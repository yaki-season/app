import { expect, test } from '@playwright/test';
import { D1_GRILL_SLOTS } from '../../src/config/d1GrillLayout.js';
import {
  GRILL_FINISHED_TRAY_RESERVED_FHD,
  scaleRect,
} from '../../src/config/grillUiLayout.js';

function overlaps(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

async function goScreen(page, id) {
  await page.evaluate((screenId) => window.__prodDebug.requestScreen(screenId), id);
  await expect.poll(() => page.evaluate(() => window.__prodDebug.activeScreen())).toBe(id);
  await expect.poll(() => page.evaluate(() => window.__prodDebug.isTransitioning())).toBe(false);
}

test('그릴 UI 하네스가 6 receipts·tray reserved·6 slots·waiting/discard/dock을 동시에 표시한다', async ({ page }) => {
  await page.goto('/src/grill-ui-harness.html');
  await expect(page.getByTestId('grill-ui-frame')).toBeVisible();
  await expect(page.locator('.receipt-card')).toHaveCount(6);
  await expect(page.locator('.slot-hit')).toHaveCount(6);
  await expect(page.locator('.waiting-zone')).toBeVisible();
  await expect(page.locator('.finished-zone')).toBeVisible();
  await expect(page.locator('.discard-zone')).toBeVisible();
  await expect(page.getByTestId('grill-prepared-dock')).toBeVisible();
  await expect(page.getByTestId('grill-order-detail')).toBeVisible();
  await expect(page.locator('[data-layer-owner="art-runtime"]')).toBeVisible();
  await expect(page.locator('[data-layer-owner="runtime-interaction"]')).toBeVisible();
  await expect(page.locator('[data-layer-owner="dom-ui"]')).toBeVisible();

  const reserved = await page.getByTestId('finished-tray-reserved').boundingBox();
  for (const locator of [
    page.getByTestId('grill-service-status'),
    page.getByTestId('grill-receipt-rail'),
    page.getByTestId('grill-order-detail'),
    page.getByTestId('grill-help'),
    page.getByTestId('grill-prepared-dock'),
  ]) {
    expect(overlaps(await locator.boundingBox(), reserved)).toBe(false);
  }
  const report = await page.evaluate(() => window.__grillUiHarness.layoutReport());
  expect(report.compatible).toBe(true);
  expect(report.intersectionAreas).toEqual({
    serviceStatus: 0,
    receiptRail: 0,
    orderDetailRail: 0,
    helpRail: 0,
    preparedDock: 0,
  });
  expect(await page.evaluate(() => window.__grillUiHarness.approvedInput)).toEqual({
    id: 'ST-GRILL-FINISHED-TRAY',
    sourceRevision: 6,
    sha256: '51abf390cbf31d40b50a7d99f08a5d37a2da70df6cf94d405788538bad7d9184',
    runtimeRegistrationAllowed: false,
  });
});

test('실제 SCR-SVC-GRILL만 전용 rail을 쓰고 tray·slot·prepared dock을 침범하지 않는다', async ({ page }, testInfo) => {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
  await goScreen(page, 'SCR-SVC-GRILL');

  const viewport = testInfo.project.use.viewport;
  const reserved = scaleRect(GRILL_FINISHED_TRAY_RESERVED_FHD, viewport);
  await expect(page.getByTestId('svc-receipts').locator('li')).toHaveCount(6);
  expect(await page.getByTestId('svc-receipts').evaluate((node) => getComputedStyle(node).position)).toBe('fixed');

  expect(overlaps(
    await page.getByTestId('svc-bar').boundingBox(),
    await page.getByTestId('svc-receipts').boundingBox(),
  )).toBe(false);
  for (const locator of [
    page.getByTestId('svc-bar'),
    page.getByTestId('svc-receipts'),
    page.getByTestId('hint'),
    page.getByTestId('nav-left'),
    page.getByTestId('nav-right'),
  ]) {
    expect(overlaps(await locator.boundingBox(), reserved)).toBe(false);
  }

  const slotHitOwners = await page.evaluate((slots) => slots.map((slot) => {
    const x = (slot.hitRect.x + slot.hitRect.width / 2) * innerWidth;
    const y = (slot.hitRect.y + slot.hitRect.height / 2) * innerHeight;
    const node = document.elementFromPoint(x, y);
    return node?.id ?? node?.className ?? node?.tagName ?? null;
  }), D1_GRILL_SLOTS);
  expect(slotHitOwners).toEqual(Array(6).fill('scene'));

  const trayDomOwners = await page.evaluate(({ art, reserved }) => {
    const points = [
      [art.x + 1, art.y + 1],
      [art.x + art.width / 2, art.y + art.height / 2],
      [art.x + art.width - 1, art.y + art.height - 1],
      [reserved.x + 1, reserved.y + 1],
      [reserved.x + reserved.width - 1, reserved.y + reserved.height - 1],
    ];
    return points.map(([x, y]) => {
      const node = document.elementFromPoint(x, y);
      return node?.id ?? node?.className ?? node?.tagName ?? null;
    });
  }, {
    art: scaleRect({
      x: 1534,
      y: 123,
      width: 266,
      height: 354,
    }, viewport),
    reserved,
  });
  expect(trayDomOwners).toEqual(Array(5).fill('scene'));

  await page.evaluate(() => window.__prodDebug.dockAdd({
    menu: '네기마',
    label: 'Perfect',
    good: true,
  }));
  await expect(page.getByTestId('dock-shelf')).toBeVisible();
  expect(overlaps(await page.getByTestId('dock-shelf').boundingBox(), reserved)).toBe(false);
  await expect(page.getByTestId('dock-shelf').getByRole('button')).toBeEnabled();

  for (const id of ['SCR-SVC-ASSEMBLY', 'SCR-SVC-DRINK', 'SCR-SVC-CUSTOMERS']) {
    await goScreen(page, id);
    expect(await page.getByTestId('svc-receipts').evaluate((node) => getComputedStyle(node).position))
      .not.toBe('fixed');
  }
});
