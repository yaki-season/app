// 생맥주 스테이션 종단 검증 (SCR-SVC-DRINK, GPL-004 §34-46,49-2, 증분 4).
// 결정론적 따르기 훅(pourExact)으로 품질·넘침·선반 이동을 검증하고, 실제 레버 홀드 배선도 확인한다.
import { test, expect } from '@playwright/test';

const active = (p) => p.evaluate(() => window.__prodDebug.activeScreen());
const trans = (p) => p.evaluate(() => window.__prodDebug.isTransitioning());
const dock = (p) => p.evaluate(() => window.__prodDebug.dockItems());

async function boot(page) {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => active(page)).toBe('SCR-SVC-CUSTOMERS');
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
}
async function go(page, id) {
  await page.evaluate((s) => window.__prodDebug.requestScreen(s), id);
  await expect.poll(() => active(page)).toBe(id);
  await expect.poll(() => trans(page)).toBe(false);
}

test('완벽 따르기(맥주3·거품1)는 Perfect 생맥주로 선반에 올라간다', async ({ page }) => {
  await boot(page);
  await go(page, 'SCR-SVC-DRINK');
  await expect(page.getByTestId('drink-panel')).toBeVisible();

  const s = await page.evaluate(() => window.__prodDebug.pourExact(3.0, 1.0));
  expect(s.beerOk).toBe(true);
  expect(s.foamOk).toBe(true);
  expect(s.phase).toBe('ready');
  await expect(page.getByTestId('drink-finish')).toBeEnabled();

  await page.evaluate(() => window.__prodDebug.drinkFinish());
  const items = await dock(page);
  expect(items).toHaveLength(1);
  expect(items[0].menu).toBe('생맥주');
  expect(items[0].label).toBe('Perfect');
  expect(items[0].good).toBe(true);
});

test('한 단계만 벗어나면 Good 품질', async ({ page }) => {
  await boot(page);
  await go(page, 'SCR-SVC-DRINK');
  await page.evaluate(() => window.__prodDebug.pourExact(3.0, 0.1)); // 거품 부족
  await page.evaluate(() => window.__prodDebug.drinkFinish());
  expect((await dock(page))[0].label).toBe('Good');
});

test('넘치면 낮은 품질 제공(Fail) 또는 폐기를 고른다', async ({ page }) => {
  await boot(page);
  await go(page, 'SCR-SVC-DRINK');

  const s = await page.evaluate(() => window.__prodDebug.pourOverflow());
  expect(s.overflow).toBe(true);
  expect(s.phase).toBe('overflow');
  await expect(page.getByTestId('drink-overflow')).toBeVisible();
  await expect(page.getByTestId('drink-finish')).toBeDisabled();

  // 낮은 품질 제공 → Fail 생맥주
  await page.evaluate(() => window.__prodDebug.drinkServeLow());
  let items = await dock(page);
  expect(items).toHaveLength(1);
  expect(items[0].label).toBe('Fail');
  expect(items[0].good).toBe(false);

  // 다시 넘치게 한 뒤 폐기 → 완성품 없음
  await page.evaluate(() => window.__prodDebug.pourOverflow());
  await page.evaluate(() => window.__prodDebug.drinkDiscard());
  expect(await dock(page)).toHaveLength(1); // 폐기라 늘지 않음
});

test('레버 아래를 누르고 있으면 맥주가 흐른다 (홀드 배선)', async ({ page }) => {
  await boot(page);
  await go(page, 'SCR-SVC-DRINK');
  await page.evaluate(() => window.__prodDebug.pourState()); // reset 없이 초기 idle
  const pos = await page.evaluate(() => window.__prodDebug.screenPosOf('drinkLeverLower'));
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  const s = await page.evaluate(() => window.__prodDebug.pourState());
  expect(s.beerSec).toBeGreaterThan(0.1); // 누른 동안 맥주가 찼다
});

test('선반의 생맥주를 생맥주 주문 손님에게 낼 수 있다', async ({ page }) => {
  await boot(page);
  await go(page, 'SCR-SVC-DRINK');
  await page.evaluate(() => window.__prodDebug.pourExact(3.0, 1.0));
  await page.evaluate(() => window.__prodDebug.drinkFinish());
  expect(await dock(page)).toHaveLength(1);

  await go(page, 'SCR-SVC-CUSTOMERS');
  // regular 손님은 생맥주를 주문한다. 접수 후 선반의 생맥주 제공.
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(false); window.__prodDebug.forceSpawn('seat-03', 'regular', 0); });
  await expect.poll(() => page.evaluate(() => window.__prodDebug.seatViews().find((v) => v.seatId === 'seat-03').phase)).toBe('ordering');
  const seatPos = () => page.evaluate(() => window.__prodDebug.screenPosOf('seatServe:seat-03'));
  let pos = await seatPos();
  await page.mouse.click(pos.x, pos.y); // 주문 접수
  await expect.poll(() => page.evaluate(() => window.__prodDebug.seatViews().find((v) => v.seatId === 'seat-03').canServe)).toBe(true);
  await page.waitForTimeout(230); // 대상별 입력 잠금 이후
  pos = await seatPos();
  await page.mouse.click(pos.x, pos.y); // 제공
  await expect.poll(() => dock(page).then((d) => d.length)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__prodDebug.seatViews().find((v) => v.seatId === 'seat-03').mood)).toBe('satisfied');
});
