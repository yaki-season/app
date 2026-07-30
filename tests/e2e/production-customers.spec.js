// 손님 운영 루프 종단 검증 (SCR-SVC-CUSTOMERS, GPL-003, 증분 5).
// 결정론을 위해 자동 입장을 끄고 forceSpawn/opsElapse로 생애주기를 구동한다.
import { test, expect } from '@playwright/test';

const active = (p) => p.evaluate(() => window.__prodDebug.activeScreen());
const trans = (p) => p.evaluate(() => window.__prodDebug.isTransitioning());
const view = (p, id) => p.evaluate((s) => window.__prodDebug.seatViews().find((v) => v.seatId === s), id);

async function boot(page) {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => active(page)).toBe('SCR-SVC-CUSTOMERS');
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(false); window.__prodDebug.opsClear(); }); // 결정론
}
async function click(page, key) {
  const pos = await page.evaluate((k) => window.__prodDebug.screenPosOf(k), key);
  if (!pos) throw new Error(`보이지 않는 대상: ${key}`);
  await page.mouse.click(pos.x, pos.y);
}

test('6석 렌더 인터페이스: 기본은 빈 좌석, 입장하면 점유', async ({ page }) => {
  await boot(page);
  let views = await page.evaluate(() => window.__prodDebug.seatViews());
  expect(views).toHaveLength(6);
  expect(views.every((v) => !v.occupied)).toBe(true);

  await page.evaluate(() => window.__prodDebug.forceSpawn('seat-03', 'solo', 5));
  await expect.poll(() => view(page, 'seat-03').then((v) => v.occupied)).toBe(true);
  expect((await view(page, 'seat-03')).menu).toBe('네기마');
});

test('생애주기: 고민→주문→서빙→식사→퇴장→정리', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.forceSpawn('seat-02', 'solo', 5)); // 네기마, 5초 고민
  expect((await view(page, 'seat-02')).phase).toBe('thinking');
  await expect(page.getByTestId('bubble-seat-02')).toBeVisible();

  // 고민 종료 → 주문 중
  await page.evaluate(() => window.__prodDebug.opsElapse(5));
  await expect.poll(() => view(page, 'seat-02').then((v) => v.phase)).toBe('ordering');

  // 주문 접수 → 수령 대기
  await click(page, 'seatServe:seat-02');
  await expect.poll(() => view(page, 'seat-02').then((v) => v.canServe)).toBe(true);

  // 선반에 네기마를 두고 제공 (대상별 입력 잠금 200ms 이후)
  await page.evaluate(() => window.__prodDebug.dockAdd({ menu: '네기마', label: '좋음', good: true }));
  await page.waitForTimeout(230);
  await click(page, 'seatServe:seat-02');
  await expect.poll(() => view(page, 'seat-02').then((v) => v.phase)).toBe('eating');
  expect((await view(page, 'seat-02')).mood).toBe('satisfied');
  expect(await page.evaluate(() => window.__prodDebug.dockItems().length)).toBe(0); // 소비됨

  // 식사(15초)→퇴장(1초)→정리
  await page.evaluate(() => window.__prodDebug.opsElapse(15));
  await expect.poll(() => view(page, 'seat-02').then((v) => v.phase)).toBe('leaving');
  await page.evaluate(() => window.__prodDebug.opsElapse(1));
  await expect.poll(() => view(page, 'seat-02').then((v) => v.cleanupNeeded)).toBe(true);
});

test('주문과 다른 메뉴는 제공되지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.forceSpawn('seat-01', 'solo', 0)); // 네기마
  await page.evaluate(() => window.__prodDebug.opsElapse(1));
  await expect.poll(() => view(page, 'seat-01').then((v) => v.phase)).toBe('ordering');
  await click(page, 'seatServe:seat-01'); // 주문 접수
  await page.evaluate(() => window.__prodDebug.dockAdd({ menu: '생맥주', label: 'Perfect', good: true })); // 다른 메뉴
  await click(page, 'seatServe:seat-01');
  // 메뉴 불일치 → 여전히 수령 대기, 선반 그대로
  expect((await view(page, 'seat-01')).phase).toBe('waiting');
  expect(await page.evaluate(() => window.__prodDebug.dockItems().length)).toBe(1);
});

test('인내심을 넘기면 화난 채로 떠난다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.forceSpawn('seat-04', 'solo', 0));
  await page.evaluate(() => window.__prodDebug.opsElapse(1));
  await expect.poll(() => view(page, 'seat-04').then((v) => v.phase)).toBe('ordering');
  await page.evaluate(() => window.__prodDebug.opsElapse(61)); // solo 인내심 60초 초과
  await expect.poll(() => view(page, 'seat-04').then((v) => v.mood)).toBe('retry');
});

test('Fail 품질(넘친 맥주 등)을 내면 손님이 화나서 즉시 떠난다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.forceSpawn('seat-06', 'regular', 0)); // 첫 주문 생맥주
  await page.evaluate(() => window.__prodDebug.opsElapse(1));
  await expect.poll(() => view(page, 'seat-06').then((v) => v.phase)).toBe('ordering');
  await click(page, 'seatServe:seat-06'); // 주문 접수
  await expect.poll(() => view(page, 'seat-06').then((v) => v.canServe)).toBe(true);
  await page.evaluate(() => window.__prodDebug.dockAdd({ menu: '생맥주', label: 'Fail', good: false })); // 실패 품질
  await page.waitForTimeout(230);
  await click(page, 'seatServe:seat-06'); // 실패 음식 제공
  await expect.poll(() => view(page, 'seat-06').then((v) => v.phase)).toBe('leaving');
  expect((await view(page, 'seat-06')).mood).toBe('retry');
  expect(await page.evaluate(() => window.__prodDebug.dockItems().length)).toBe(0); // 소비됨
});

test('정리 필요 좌석을 3초 눌러 비운다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.forceSpawn('seat-05', 'solo', 0));
  await page.evaluate(() => window.__prodDebug.opsElapse(1));
  await expect.poll(() => view(page, 'seat-05').then((v) => v.phase)).toBe('ordering');
  await click(page, 'seatServe:seat-05'); // 주문 접수
  await expect.poll(() => view(page, 'seat-05').then((v) => v.canServe)).toBe(true);
  await page.evaluate(() => window.__prodDebug.dockAdd({ menu: '네기마', label: '좋음', good: true }));
  await page.waitForTimeout(230);
  await click(page, 'seatServe:seat-05'); // 제공
  await page.evaluate(() => window.__prodDebug.opsElapse(16)); // 식사+퇴장
  await expect.poll(() => view(page, 'seat-05').then((v) => v.cleanupNeeded)).toBe(true);

  // 3초 홀드로 정리
  const pos = await page.evaluate(() => window.__prodDebug.screenPosOf('seatServe:seat-05'));
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await page.waitForTimeout(3200);
  await page.mouse.up();
  await expect.poll(() => view(page, 'seat-05').then((v) => v.occupied)).toBe(false);
});
