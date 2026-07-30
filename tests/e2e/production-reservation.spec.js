// 8인 예약 종단 검증. 좌석을 8석 이상으로 확장하면 예약 시각에 8인 그룹이 연속 좌석에 함께 입장한다.
import { test, expect } from '@playwright/test';

const occupied = (p) => p.evaluate(() => window.__prodDebug.seatViews().filter((v) => v.occupied).length);

async function boot(page) {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
}

test('8인 예약: 좌석 확장 후 예약 시각에 8인 그룹이 함께 입장한다', async ({ page }) => {
  await boot(page);
  // 8석 확장 구매
  await page.evaluate(() => window.__prodDebug.setWallet(99999, 99));
  await page.getByTestId('end-day').click();
  await page.getByTestId('open-purchase').click();
  await page.getByTestId('cat-interior').click();
  await page.getByTestId('buy-interior-seats-8').click();
  expect(await page.evaluate(() => window.__prodDebug.seatCapacity())).toBe(8);
  await page.getByTestId('purchase-close').click();
  await page.getByTestId('next-day').click();

  // 결정론: 자동 입장을 끄고 좌석을 비운 뒤 즉시 due 예약을 넣는다
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(false); window.__prodDebug.opsClear(); });
  await page.evaluate(() => window.__prodDebug.opsReserve('office', 8, 0, 0));

  // 예약이 처리되어 8석이 한 번에 찬다
  await expect.poll(() => occupied(page), { timeout: 4000 }).toBe(8);
  // 모두 같은 그룹(공동 입장)
  const groupIds = await page.evaluate(() => new Set(window.__prodDebug.seatViews().filter((v) => v.occupied).map((v) => v.group)).size);
  expect(groupIds).toBe(1); // 전부 group=true
  expect(await page.evaluate(() => window.__prodDebug.seatViews().filter((v) => v.occupied).every((v) => v.group))).toBe(true);
});
