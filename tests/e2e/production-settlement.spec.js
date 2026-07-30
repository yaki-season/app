// 영업일 정산 종단 검증 (SCR-POST-SETTLEMENT, GPL-002/005, 증분 6).
import { test, expect } from '@playwright/test';

const view = (p, id) => p.evaluate((s) => window.__prodDebug.seatViews().find((v) => v.seatId === s), id);
const field = (p, f) => p.locator(`#settlement [data-f="${f}"]`);

async function boot(page) {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(false); window.__prodDebug.opsClear(); });
}
async function clickSeat(page, seatId) {
  const pos = await page.evaluate((s) => window.__prodDebug.screenPosOf(`seatServe:${s}`), seatId);
  if (!pos) throw new Error(`좌석 대상이 보이지 않음: ${seatId}`);
  await page.mouse.click(pos.x, pos.y);
}
async function serveCustomer(page, seatId, good) {
  await page.evaluate((s) => window.__prodDebug.forceSpawn(s, 'solo', 0), seatId);
  await page.evaluate(() => window.__prodDebug.opsElapse(1));
  await expect.poll(() => view(page, seatId).then((v) => v.phase)).toBe('ordering');
  await clickSeat(page, seatId); // 주문 접수
  await expect.poll(() => view(page, seatId).then((v) => v.canServe)).toBe(true);
  await page.evaluate((g) => window.__prodDebug.dockAdd({ menu: '네기마', label: g ? '좋음' : '과다', good: g }), good);
  await page.waitForTimeout(230);
  await clickSeat(page, seatId); // 제공
  await expect.poll(() => view(page, seatId).then((v) => v.phase)).toBe('eating');
}

test('영업 종료 → 정산 집계 → 다음 날 리셋', async ({ page }) => {
  await boot(page);
  const content = await page.evaluate(() => window.__prodDebug.contentContract());
  expect(content.urls.day).toBe('/content/campaign/day-d1.json');
  expect(content.applied.economy).toEqual(content.day.economy);

  // 좋은 서빙 1, 낮은 서빙 1
  await serveCustomer(page, 'seat-02', true);
  await serveCustomer(page, 'seat-03', false);

  // 이탈 1 (주문 후 인내심 초과)
  await page.evaluate(() => window.__prodDebug.forceSpawn('seat-05', 'solo', 0));
  await page.evaluate(() => window.__prodDebug.opsElapse(1));
  await expect.poll(() => view(page, 'seat-05').then((v) => v.phase)).toBe('ordering');
  await page.evaluate(() => window.__prodDebug.opsElapse(62)); // solo 인내심 60초 초과
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsRecords().filter((r) => !r.served).length)).toBe(1);

  // 영업 종료 → 정산
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('settlement')).toBeVisible();
  await expect(field(page, 'visited')).toHaveText('3');
  await expect(field(page, 'served')).toHaveText('2');
  await expect(field(page, 'lost')).toHaveText('1');
  await expect(field(page, 'good')).toHaveText('1');
  await expect(field(page, 'low')).toHaveText('1');
  const expectedRevenue = Math.round(
    content.day.economy.basePrice * content.day.economy.qualityMultGood
    + content.day.economy.basePrice * content.day.economy.qualityMultLow,
  );
  await expect(field(page, 'revenue')).toHaveText(String(expectedRevenue));
  await expect(field(page, 'total')).toHaveText(/\d+/);

  // 다음 날 → 리셋
  await page.getByTestId('next-day').click();
  await expect(page.getByTestId('settlement')).toBeHidden();
  expect(await page.evaluate(() => window.__prodDebug.opsRecords().length)).toBe(0);
});
