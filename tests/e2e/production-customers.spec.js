// 손님 화면 6석 렌더 어댑터 종단 검증 (SCR-SVC-CUSTOMERS, 증분 2).
// 006이 실제 운영을 꽂기 전, 6석 렌더 인터페이스가 점유·주문 말풍선·좌석 서빙을 표현하는지 확인한다.
import { test, expect } from '@playwright/test';

const seats = (p) => p.evaluate(() => window.__prodDebug.seatStates());
const active = (p) => p.evaluate(() => window.__prodDebug.activeScreen());

async function boot(page) {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => active(page)).toBe('SCR-SVC-CUSTOMERS');
}

test('6석 중 데모 손님이 seat-03에 앉고 주문 말풍선이 뜬다', async ({ page }) => {
  await boot(page);
  const s = await seats(page);
  expect(s).toHaveLength(6);
  expect(s.find((x) => x.seatId === 'seat-03').occupied).toBe(true);
  expect(s.filter((x) => x.occupied)).toHaveLength(1);

  // 점유 좌석 말풍선은 손님 화면에서 보이고 주문명을 담는다
  await expect(page.getByTestId('bubble-seat-03')).toBeVisible();
  await expect(page.getByTestId('bubble-seat-03')).toContainText('네기마');
  // 빈 좌석은 말풍선 없음
  await expect(page.getByTestId('bubble-seat-01')).toBeHidden();
});

test('주문 말풍선은 다른 화면으로 가면 숨는다', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('bubble-seat-03')).toBeVisible();
  await page.evaluate(() => window.__prodDebug.requestScreen('SCR-SVC-GRILL'));
  await expect.poll(() => active(page)).toBe('SCR-SVC-GRILL');
  await expect(page.getByTestId('bubble-seat-03')).toBeHidden();
});

test('완성품이 없으면 좌석 serve 대상이 비활성(숨김)이다', async ({ page }) => {
  await boot(page);
  // 아직 조리·완성 전 → serveReady=false → 어떤 좌석도 serve 대상이 아니다.
  const s = await seats(page);
  expect(s.every((x) => !x.serveTarget)).toBe(true);
  const pos = await page.evaluate(() => window.__prodDebug.screenPosOf('seatServe:seat-03'));
  expect(pos).toBeNull(); // 보이지 않음
});
