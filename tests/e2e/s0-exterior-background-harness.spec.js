import { expect, test } from '@playwright/test';
import {
  S0_EXTERIOR_BACKGROUND_BINDINGS,
} from '../../src/assets/s0ExteriorBackgroundBindingContract.js';

const approvedFixture = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">'
  + '<rect width="1920" height="1080" fill="#33453b"/>'
  + '<path d="M0 820L540 280l260 270 360-410 760 680v260H0z" fill="#9b7650"/>'
  + '</svg>',
)}`;

const comparableSnapshot = (snapshot) => ({
  cameraId: snapshot.cameraId,
  domContract: snapshot.domContract,
  stageRect: snapshot.stageRect,
  cameraRect: snapshot.cameraRect,
  semanticDomRect: snapshot.semanticDomRect,
  assetRect: snapshot.assetRect,
  domSafeRect: snapshot.domSafeRect,
  actionRect: snapshot.actionRect,
});

const overlaps = (a, b) => (
  a.x < b.x + b.width
  && a.x + a.width > b.x
  && a.y < b.y + b.height
  && a.y + a.height > b.y
);

test.describe('S0 exterior state-specific backgrounds FHD/720 harness', () => {
  for (const binding of S0_EXTERIOR_BACKGROUND_BINDINGS) {
    test(`${binding.stateId}: exact placeholder/approved가 같은 camera·DOM·bounds를 쓴다`, async ({ page }) => {
      await page.addInitScript(({ assetId, url }) => {
        window.__S0_EXTERIOR_APPROVED_ASSETS__ = { [assetId]: url };
      }, {
        assetId: binding.requiredAssetId,
        url: approvedFixture,
      });

      const query = `stateId=${binding.stateId}`;
      await page.goto(`/src/s0-exterior-background-harness.html?${query}&mode=placeholder`);
      await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'placeholder');
      await expect(page.locator('body')).toHaveAttribute('data-body-part-count', '0');
      await expect(page.locator('body')).toHaveAttribute(
        'data-background-contract-mode',
        'state-specific',
      );
      await expect(page.locator('body')).toHaveAttribute(
        'data-required-asset-id',
        binding.requiredAssetId,
      );
      await expect(page.locator('body')).toHaveAttribute(
        'data-runtime-visual-layer-count',
        '1',
      );
      await expect(page.locator('body')).toHaveAttribute('data-body-part-count', '0');
      const placeholder = await page.evaluate(
        () => window.__s0ExteriorBackgroundHarness.snapshot(),
      );
      expect((await page.getByTestId('logical-stage').screenshot()).byteLength)
        .toBeGreaterThan(1000);

      await page.goto(`/src/s0-exterior-background-harness.html?${query}&mode=approved`);
      await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'approved');
      await expect(page.locator('body')).toHaveAttribute(
        'data-camera-id',
        'S0-EXTERIOR-FIXED-V1',
      );
      await expect(page.locator('body')).toHaveAttribute(
        'data-semantic-owner',
        'artist-2.s0-prologue-story',
      );
      await expect(page.locator('body')).toHaveAttribute(
        'data-forbidden-asset-id',
        binding.compositionPolicy.forbiddenAssetId,
      );
      const approved = await page.evaluate(
        () => window.__s0ExteriorBackgroundHarness.snapshot(),
      );
      expect((await page.getByTestId('logical-stage').screenshot()).byteLength)
        .toBeGreaterThan(1000);
      expect(comparableSnapshot(approved)).toEqual(comparableSnapshot(placeholder));
      expect(approved.approvedVisualCount).toBe(1);
      expect(approved.separateGateVisualCount).toBe(0);
    });
  }

  for (const binding of S0_EXTERIOR_BACKGROUND_BINDINGS) {
    const wrongBinding = S0_EXTERIOR_BACKGROUND_BINDINGS.find(
      (candidate) => candidate.stateId !== binding.stateId,
    );
    test(`${binding.stateId}: ${wrongBinding.requiredAssetId}를 대체 사용하지 않는다`, async ({ page }) => {
      await page.route('**/public/assets/manifest.json', async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            assets: [{
              id: wrongBinding.requiredAssetId,
              status: 'approved',
              url: '/assets/wrong-state-background.png',
            }],
          }),
        });
      });
      await page.goto(
        `/src/s0-exterior-background-harness.html?stateId=${binding.stateId}&mode=approved`,
      );
      await expect(page.locator('body')).toHaveAttribute(
        'data-required-asset-id',
        binding.requiredAssetId,
      );
      await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'placeholder');
      await expect(page.getByText('개발 중')).toBeVisible();
      await expect(page.locator('#approved-asset')).toBeHidden();
    });
  }

  test('GATE는 PR-SHOP-GATE-S0 미승격 상태에서도 exact background 한 장으로 표시한다', async ({
    page,
  }) => {
    await page.addInitScript((url) => {
      window.__S0_EXTERIOR_APPROVED_ASSETS__ = {
        'BG-EXTERIOR-S0-GATE-OPEN': url,
      };
    }, approvedFixture);
    await page.goto(
      '/src/s0-exterior-background-harness.html?stateId=S0-STATE-GATE&mode=approved',
    );
    await expect(page.locator('body')).toHaveAttribute('data-asset-mode', 'approved');
    await expect(page.locator('body')).toHaveAttribute(
      'data-required-asset-id',
      'BG-EXTERIOR-S0-GATE-OPEN',
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-pr-shop-gate-runtime-visual',
      'false',
    );
    await expect(page.locator('body')).toHaveAttribute('data-open-gate-outline-count', '1');
    await expect(page.locator('body')).toHaveAttribute(
      'data-closed-gate-residual-pixel-count',
      '0',
    );
    await expect(page.locator('#approved-asset')).toBeVisible();
    await expect(page.locator('[data-runtime-visual-asset-id="PR-SHOP-GATE-S0"]'))
      .toHaveCount(0);
    const snapshot = await page.evaluate(() => window.__s0ExteriorBackgroundHarness.snapshot());
    const interaction = S0_EXTERIOR_BACKGROUND_BINDINGS[1]
      .compositionPolicy.provenanceInteractionReference.bounds.fhd;
    const scale = snapshot.stageRect.width / 1920;
    const interactionRect = {
      x: snapshot.stageRect.x + interaction.x * scale,
      y: snapshot.stageRect.y + interaction.y * scale,
      width: interaction.width * scale,
      height: interaction.height * scale,
    };
    expect(overlaps(snapshot.actionRect, interactionRect)).toBe(false);
  });
});
