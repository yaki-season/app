// 좌석 확장(seatCap 업그레이드) 종단 검증. 구매로 좌석이 6→8→12로 늘고, 늘어난 자리가 실제로
// 손님 화면에 배치·표시되며 운영에 편입된다.
import { test, expect } from '@playwright/test';

const cap = (p) => p.evaluate(() => window.__prodDebug.seatCapacity());
const baseVisible = (p, id) => p.evaluate((s) => window.__prodDebug.seatBaseVisible(s), id);

async function boot(page) {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
}

test('좌석 확장: 구매로 6→8→12석이 열리고 화면에 배치된다', async ({ page }) => {
  await boot(page);
  // 기본 6석: seat-07 이후는 비활성(숨김)
  expect(await cap(page)).toBe(6);
  await expect.poll(() => baseVisible(page, 'seat-01')).toBe(true);
  expect(await baseVisible(page, 'seat-07')).toBe(false);

  // 8석 구매 → capacity 8
  await page.evaluate(() => window.__prodDebug.setWallet(99999, 99));
  await page.getByTestId('end-day').click();
  await page.getByTestId('open-purchase').click();
  await page.getByTestId('cat-interior').click();
  await page.getByTestId('buy-interior-seats-8').click();
  expect(await cap(page)).toBe(8);

  // 12석 구매 → capacity 12
  await page.getByTestId('buy-interior-seats-12').click();
  expect(await cap(page)).toBe(12);
  await page.getByTestId('purchase-close').click();
  await page.getByTestId('next-day').click();

  // 늘어난 좌석이 손님 화면에 배치된다. 좌석 표식은 승인 서빙 접시 아트로 바뀌어
  // 손님이 앉아야 보이므로, 새 좌석을 점유시켜 배치와 사용 가능 여부를 함께 확인한다.
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(false); window.__prodDebug.opsClear(); });
  await page.evaluate(() => { window.__prodDebug.forceSpawn('seat-12', 'solo', 0); window.__prodDebug.opsElapse(1); });
  await expect.poll(() => baseVisible(page, 'seat-12')).toBe(true);
  // 새 좌석에 손님을 앉히고 접수까지 동작
  await page.evaluate(() => { window.__prodDebug.forceSpawn('seat-10', 'solo', 0); window.__prodDebug.opsElapse(1); });
  await expect.poll(() => page.evaluate(() => window.__prodDebug.seatViews().find((v) => v.seatId === 'seat-10').phase)).toBe('ordering');
});
