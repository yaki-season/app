import { test, expect } from '@playwright/test';
import {
  D1_DRINK_ART_BINDING_INVENTORY,
  S0_ART_BINDING_INVENTORY,
} from '../../src/assets/s0D1ArtBindingContract.js';

const approvedFixture = (assetId) => (
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
      <rect width="480" height="270" fill="#244f42"/>
      <path d="M32 220L180 60l80 92 62-70 126 138z" fill="#d79a48"/>
      <title>${assetId}</title>
    </svg>`,
  )}`
);

const comparableSnapshot = (snapshot) => ({
  cameraId: snapshot.cameraId,
  domContract: snapshot.domContract,
  stageRect: snapshot.stageRect,
  cameraRect: snapshot.cameraRect,
  semanticDomRect: snapshot.semanticDomRect,
  assetRect: snapshot.assetRect,
  interactionRect: snapshot.interactionRect,
  domSafeRect: snapshot.domSafeRect,
});

test.describe('S0·D1 FHD/720 재조립 harness', () => {
  for (const entry of [...S0_ART_BINDING_INVENTORY, ...D1_DRINK_ART_BINDING_INVENTORY]) {
    test(`${entry.componentId}: placeholder/승인 fixture가 같은 camera·DOM·bounds를 쓴다`, async ({ page }) => {
      await page.addInitScript(({ assetId, url }) => {
        window.__ART_HARNESS_APPROVED_ASSETS__ = { [assetId]: url };
      }, { assetId: entry.requiredAssetId, url: approvedFixture(entry.requiredAssetId) });

      const query = `componentId=${encodeURIComponent(entry.componentId)}`;
      await page.goto(`/src/art-recomposition-harness.html?${query}&mode=placeholder`);
      await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'placeholder');
      await expect(page.locator('body')).toHaveAttribute('data-body-part-count', '0');
      const placeholderSnapshot = await page.evaluate(
        () => window.__artRecompositionHarness.snapshot(),
      );
      const placeholderCapture = await page.getByTestId('logical-stage').screenshot();
      expect(placeholderCapture.byteLength).toBeGreaterThan(1000);

      await page.goto(`/src/art-recomposition-harness.html?${query}&mode=approved`);
      await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'approved');
      await expect(page.locator('body')).toHaveAttribute(
        'data-semantic-owner',
        entry.semanticOwner,
      );
      const approvedSnapshot = await page.evaluate(
        () => window.__artRecompositionHarness.snapshot(),
      );
      const approvedCapture = await page.getByTestId('logical-stage').screenshot();
      expect(approvedCapture.byteLength).toBeGreaterThan(1000);

      expect(comparableSnapshot(approvedSnapshot)).toEqual(
        comparableSnapshot(placeholderSnapshot),
      );
    });
  }

  test('승인 URL이 없으면 가까운 자산을 대체하지 않고 개발 placeholder를 유지한다', async ({ page }) => {
    await page.route('**/public/assets/manifest.json', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          assets: [{
            id: 'BG-EXTERIOR-S0-CLOSED',
            status: 'approved',
            url: '/assets/test/nearby-approved.svg',
          }],
        }),
      });
    });
    await page.goto(
      '/src/art-recomposition-harness.html?componentId=prologue.key&mode=approved',
    );
    await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'placeholder');
    await expect(page.getByText('개발 중')).toBeVisible();
    await expect(page.locator('#approved-asset')).toBeHidden();
  });

  test('runtime manifest의 exact approved ID만 승인 mode에서 소비한다', async ({ page }) => {
    await page.route('**/public/assets/manifest.json', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          assets: [{
            id: 'PR-SHOP-KEY',
            status: 'approved',
            url: '/assets/test/pr-shop-key.svg',
          }],
        }),
      });
    });
    await page.route('**/public/assets/test/pr-shop-key.svg', async (route) => {
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="224" height="150"><rect width="224" height="150" fill="#d79a48"/></svg>',
      });
    });
    await page.goto(
      '/src/art-recomposition-harness.html?componentId=prologue.key&mode=approved',
    );
    await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'approved');
    await expect(page.locator('#approved-asset')).toHaveAttribute(
      'src',
      '/public/assets/test/pr-shop-key.svg',
    );
    await expect(page.locator('#asset-placeholder')).toBeHidden();
  });
});
