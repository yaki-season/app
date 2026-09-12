import { expect, test } from '@playwright/test';
import { computeSeats } from '../../src/config/screenLayout.js';

const D = (page, name) => page.evaluate(name => window.__d1GameDebug[name](), name);
for (const day of ['d2', 'd6']) test(`${day}: 첫 입장부터 실제 좌석 순서와 맞고 재접속에도 유지한다`, async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/d1-game.html?day=${day}&devUnlock=1`);
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  expect(await page.evaluate(() => window.__d1GameDebug.renderer.textureErrors())).toBe(0);
  await page.evaluate(day => history.replaceState(null, '', `/d1-game.html?day=${day}`), day);
  await page.waitForTimeout(500);
  await page.locator('#businessPhase').click();
  const first = await D(page, 'customerRenderSnapshot');
  expect(first.some(seat => seat.customerId)).toBe(true);
  for (const [i, seat] of first.entries()) {
    const expected = computeSeats(6, { layoutMode: 'sequential-guests' })[i].bubble.x;
    expect(Math.abs(seat.anchor.x - expected * page.viewportSize().width)).toBeLessThan(1);
    if (seat.customerId) {
      expect(seat.frame).toContain('sequential-guests');
      // 같은 1920px 완성 레이어가 가장자리 좌석에서만 확대되지 않아야 한다.
      expect(seat.planeWidth).toBeCloseTo(page.viewportSize().width, 1);
    }
  }
  await page.reload();
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  const restored = await D(page, 'customerRenderSnapshot');
  expect(restored.map(({seatId, customerId}) => ({seatId, customerId}))).toEqual(first.map(({seatId, customerId}) => ({seatId, customerId})));
  expect(restored.map(seat => seat.anchor.x)).toEqual(first.map(seat => seat.anchor.x));
  expect(errors).toEqual([]);
});
