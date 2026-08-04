// game.html(6석 legacy sandbox)의 손님 아트 회귀 가드.
// 배경·좌석·카운터는 승인 아트지만, 이 화면의 손님은 모두 이름 없는 엑스트라라 승인 아트가 없다
// (CH-EXTRA-* 미승인). 고정 인물 츠키오카를 크롭해 재사용하지 않으며(ART-003), 좌석 손님은
// 손님 화면에서만 보이고 다른 화면 카메라에 걸쳐 보이지 않아야 한다.
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

test('좌석 손님은 엑스트라 더미로 그려지고, 다른 화면에는 걸쳐 보이지 않는다', async ({ page }) => {
  const errs = await boot(page);
  // 엑스트라 승인 아트 전까지 좌석 손님은 더미이며 츠키오카 아트를 빌려 쓰지 않는다.
  expect(await page.evaluate(() => window.__prodDebug.renderer.hasSeatActorArt())).toBe(false);
  expect(await page.evaluate(() => window.__prodDebug.renderer.artMesh.custTsukioka.visible)).toBe(false);

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
