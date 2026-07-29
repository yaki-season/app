// 손님 운영 심화 종단 검증: 2인 그룹·재주문·러시 (GPL-003, 증분 7).
import { test, expect } from '@playwright/test';

const view = (p, id) => p.evaluate((s) => window.__prodDebug.seatViews().find((v) => v.seatId === s), id);
const occupied = (p) => p.evaluate(() => window.__prodDebug.seatViews().filter((v) => v.occupied).length);

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

test('2인 그룹이 인접 좌석에 함께 입장한다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.forceGroup('seat-02', 'seat-03', 'office', 0));
  await expect.poll(() => view(page, 'seat-02').then((v) => v.group)).toBe(true);
  expect((await view(page, 'seat-03')).group).toBe(true);
  expect((await view(page, 'seat-02')).menu).toBe('생맥주'); // office 첫 주문
});

test('2인 그룹은 한 명의 인내심이 끝나면 함께 화난 퇴장한다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.forceGroup('seat-01', 'seat-02', 'office', 0));
  await page.evaluate(() => window.__prodDebug.opsElapse(1));
  await expect.poll(() => view(page, 'seat-01').then((v) => v.phase)).toBe('ordering');
  await page.evaluate(() => window.__prodDebug.opsElapse(101)); // office 인내심 100초 초과
  await expect.poll(() => view(page, 'seat-01').then((v) => v.phase)).toBe('leaving');
  await expect.poll(() => view(page, 'seat-02').then((v) => v.phase)).toBe('leaving');
  expect((await view(page, 'seat-02')).mood).toBe('retry');
});

test('재주문: 만족한 손님이 식사 후 다음 항목을 주문한다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.reorderOverride('always'));
  await page.evaluate(() => window.__prodDebug.forceSpawn('seat-04', 'regular', 0)); // orderSeq [drink,skewer,skewer]
  await page.evaluate(() => window.__prodDebug.opsElapse(1));
  await expect.poll(() => view(page, 'seat-04').then((v) => v.phase)).toBe('ordering');
  expect((await view(page, 'seat-04')).menu).toBe('생맥주');

  await clickSeat(page, 'seat-04'); // 주문 접수
  await expect.poll(() => view(page, 'seat-04').then((v) => v.canServe)).toBe(true);
  await page.evaluate(() => window.__prodDebug.dockAdd({ menu: '생맥주', label: 'Perfect', good: true }));
  await page.waitForTimeout(230);
  await clickSeat(page, 'seat-04'); // 제공 → 식사
  await expect.poll(() => view(page, 'seat-04').then((v) => v.phase)).toBe('eating');

  // 식사 종료 → 재주문: 다음 항목(네기마)을 다시 고민한다
  await page.evaluate(() => window.__prodDebug.opsElapse(15));
  await expect.poll(() => view(page, 'seat-04').then((v) => v.menu)).toBe('네기마');
  expect((await view(page, 'seat-04')).phase).toBe('thinking');
});

test('러시: 자동 입장 파동이 여러 좌석을 채운다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(true); window.__prodDebug.opsElapse(12); }); // 입장 간격 경과
  // 한 파동에 waveSize(2)만큼 채워진다
  await expect.poll(() => occupied(page), { timeout: 4000 }).toBeGreaterThanOrEqual(2);
});
