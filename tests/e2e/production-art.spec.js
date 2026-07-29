// game.html(6석 프로덕션)에 승인 D1 손님 아트를 물린 것에 대한 회귀 가드.
// 손님 화면은 실제 배경·카운터·좌석 손님 텍스처, 조립·그릴·드링크는 더미. 좌석 손님은 손님 화면에서만
// 보이고 다른 화면 카메라에 걸쳐 보이지 않아야 한다.
import { test, expect } from '@playwright/test';

const actorVisible = (p, id) => p.evaluate((s) => !!window.__prodDebug.renderer.seatActorMesh[s]?.visible, id);

async function boot(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(false); window.__prodDebug.opsClear(); });
  return errs;
}

test('손님 화면은 승인 아트로 좌석 손님을 그리고, 다른 화면에는 걸쳐 보이지 않는다', async ({ page }) => {
  const errs = await boot(page);
  expect(await page.evaluate(() => window.__prodDebug.renderer.hasSeatActorArt())).toBe(true);

  await page.evaluate(() => { window.__prodDebug.forceSpawn('seat-03', 'solo', 0); window.__prodDebug.opsElapse(1); });
  // 손님 화면: 점유 좌석 손님이 보인다
  await expect.poll(() => actorVisible(page, 'seat-03')).toBe(true);

  // 그릴 화면으로 전환하면 좌석 손님은 숨는다(다른 화면 카메라에 걸쳐 보이지 않도록)
  await page.evaluate(() => window.__prodDebug.requestScreen('SCR-SVC-GRILL'));
  await expect.poll(() => page.evaluate(() => window.__prodDebug.activeScreen())).toBe('SCR-SVC-GRILL');
  await expect.poll(() => page.evaluate(() => window.__prodDebug.isTransitioning())).toBe(false);
  await expect.poll(() => actorVisible(page, 'seat-03')).toBe(false);

  // 손님 화면으로 돌아오면 다시 보인다
  await page.evaluate(() => window.__prodDebug.requestScreen('SCR-SVC-CUSTOMERS'));
  await expect.poll(() => page.evaluate(() => window.__prodDebug.activeScreen())).toBe('SCR-SVC-CUSTOMERS');
  await expect.poll(() => actorVisible(page, 'seat-03')).toBe(true);
  expect(errs).toEqual([]);
});
