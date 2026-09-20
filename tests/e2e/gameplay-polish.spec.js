import { test, expect } from '@playwright/test';
import { pourPerfectBeer } from './helpers/beerPour.js';
import { settleGuestScene } from './helpers/guestScene.js';

const D = (page, name) => page.evaluate(name => window.__d1GameDebug[name](), name);

test('일괄 제공 안내는 선택품부터 남은 주문 수량만 집계하고 실패 포함을 알린다', async ({ page }) => {
  await boot(page);
  const seat = await acceptFirst(page);
  // 품질이 섞인 선반만 fixture로 준비하고 선택·수량·제공은 UI로 검증한다.
  const ids = await page.evaluate(() => ['Fail', 'Perfect', 'Good'].map(quality => window.__d1GameDebug.dockAdd({
    menuId: 'negima', menu: '네기마', seasoning: 'salt', quality, good: quality !== 'Fail',
  })));
  await page.getByTestId(`dock-item-${ids[1]}`).click();
  await page.getByTestId(`serve-target-${seat.seatId}`).click();
  const dialog = page.getByTestId('serve-quantity');
  await expect(dialog).toContainText('모두 제공 2개 (완벽 1개 · 실패 1개)');
  await expect(dialog).toContainText('주의: 실패 음식 포함');
  await expect(dialog).not.toContainText('좋음');
  await page.getByTestId('serve-one').click();
  expect((await D(page, 'businessView')).orders[0].lines.find(line => line.menuId === 'negima').qualities).toEqual(['Perfect']);
  expect((await D(page, 'dockItems')).map(item => item.id)).toEqual([ids[0], ids[2]]);
});

test('일괄 제공 범위 밖의 실패 음식과 다른 양념은 안내·제공에 포함하지 않는다', async ({ page }) => {
  await boot(page);
  const seat = await acceptFirst(page);
  const ids = await page.evaluate(() => [
    ['Fail', 'tare'], ['Good', 'salt'], ['Perfect', 'salt'], ['Fail', 'salt'],
  ].map(([quality, seasoning]) => window.__d1GameDebug.dockAdd({ menuId: 'negima', menu: '네기마', seasoning, quality, good: quality !== 'Fail' })));
  await page.getByTestId(`dock-item-${ids[2]}`).click();
  await page.getByTestId(`serve-target-${seat.seatId}`).click();
  const dialog = page.getByTestId('serve-quantity');
  await expect(dialog).toContainText('모두 제공 2개 (완벽 1개 · 좋음 1개)');
  await expect(dialog).not.toContainText('실패');
  await page.getByTestId('serve-all').click();
  expect((await D(page, 'businessView')).orders[0].lines.find(line => line.menuId === 'negima').qualities).toEqual(['Perfect', 'Good']);
  expect((await D(page, 'dockItems')).map(item => item.id)).toEqual([ids[0], ids[3]]);
});

test('여러 완성품을 쌓아도 서빙대가 화면을 벗어나지 않고 마지막 카드를 선택할 수 있다', async ({ page }) => {
  await boot(page);
  // 선반 밀도만 준비하는 fixture. 조리·완주 검증과 구분한다.
  const ids = await page.evaluate(() => Array.from({ length: 8 }, () => window.__d1GameDebug.dockAdd({
    menuId: 'negima', menu: '네기마', quality: 'Perfect', good: true, seasoning: 'salt',
  })));
  await nav(page, 'CUSTOMERS');
  const last = page.getByTestId(`dock-item-${ids.at(-1)}`);
  await last.click();
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  await expect(last).toContainText('완벽');
  const bounds = await page.getByTestId('dock-zone-food').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
  const visible = await last.boundingBox();
  expect(visible.x).toBeGreaterThanOrEqual(bounds.x);
  expect(visible.x + visible.width).toBeLessThanOrEqual(bounds.x + bounds.width);
});
async function boot(page, day = 'd1') {
  await page.goto(`/d1-game.html?day=${day}&devUnlock=1&reset=1`);
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
}
async function nav(page, station) {
  await settleGuestScene(page);
  await page.getByTestId(`quicknav-SCR-SVC-${station}`).click();
  await page.waitForFunction(() => !window.__d1GameDebug.isTransitioning());
}
const position = (page, key) => page.evaluate(key => window.__d1GameDebug.screenPosOf(key), key);
async function object(page, key) {
  const point = await position(page, key);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(350);
}
async function hold(page, locator, duration) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(duration); await page.mouse.up();
}
async function acceptFirst(page) {
  await nav(page, 'CUSTOMERS');
  await expect.poll(async () => (await D(page, 'businessView')).seats.some(s => s.canOrder), { timeout: 15000 }).toBe(true);
  const seat = (await D(page, 'businessView')).seats.find(s => s.canOrder);
  await page.getByTestId(`serve-target-${seat.seatId}`).click();
  // 접수 직후 도착 이야기가 화면을 덮으므로 닫고 조작을 이어간다.
  await settleGuestScene(page);
  return seat;
}
async function serveOne(page, seat, menu) {
  await nav(page, 'CUSTOMERS');
  await page.locator(`.dock-card[data-menu-id="${menu}"]`).click();
  await page.getByTestId(`serve-target-${seat.seatId}`).click();
  await expect(page.getByTestId('serve-quantity')).toBeHidden();
}

test('Perfect 잔을 선택하면 먼저 만든 Fail 잔을 대신 제공하지 않는다', async ({ page }) => {
  test.setTimeout(70000);
  await boot(page);
  const seat = await acceptFirst(page);
  await nav(page, 'DRINK');
  await object(page, 'glassRack');
  let lever = await position(page, 'drinkLeverDrag');
  await page.mouse.move(lever.x, lever.y); await page.mouse.down();
  await page.mouse.move(lever.x, lever.y + 60, { steps: 4 });
  await page.waitForTimeout(5100); await page.mouse.up();
  await page.locator('#drinkPanel [data-act="serve-low"]').click();
  await object(page, 'glassRack');
  await pourPerfectBeer(page, await position(page, 'drinkLeverDrag'));
  await page.getByTestId('drink-finish').click();
  const [bad, good] = await D(page, 'dockItems');
  expect(bad.quality).toBe('Fail'); expect(good.quality).toBe('Perfect');
  await nav(page, 'CUSTOMERS');
  await page.getByTestId(`dock-item-${good.id}`).click();
  await page.getByTestId(`serve-target-${seat.seatId}`).click();
  await expect(page.getByTestId('serve-quantity')).toBeHidden();
  expect((await D(page, 'businessView')).orders[0].lines.find(l => l.menuId === 'beer').qualities).toEqual(['Perfect']);
  expect(await D(page, 'dockItems')).toEqual([expect.objectContaining({ id: bad.id, quality: 'Fail' })]);
});

test('한 재료로 넘친 하이볼은 다시 만들 수 있고 사라다 카드 이탈은 취소된다', async ({ page }) => {
  test.setTimeout(50000);
  await boot(page, 'd4'); await nav(page, 'DRINK');
  await page.getByTestId('highball-glass').click(); await page.getByTestId('highball-ice').click();
  await hold(page, page.getByTestId('highball-whiskey'), 5100);
  await expect(page.locator('[data-highball-act="serve-low"]')).toBeDisabled();
  await page.locator('[data-highball-act="discard"]').click();
  await expect(page.getByTestId('highball-glass')).toBeEnabled();
  await page.getByTestId('highball-glass').click();
  await expect(page.getByTestId('highball-ice')).toBeEnabled();
  await nav(page, 'INSTANT');
  const button = page.getByTestId('cabbage-salad-prepare');
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.waitForTimeout(300); await page.mouse.move(5, 5); await page.waitForTimeout(2800); await page.mouse.up();
  expect(await D(page, 'dockItems')).toEqual([]);
  await hold(page, button, 2700);
  expect(await D(page, 'dockItems')).toHaveLength(1);
});

test('D4 하이볼과 사라다 두 항목 제공은 맥주 그림이나 세 항목 안내를 만들지 않는다', async ({ page }) => {
  test.setTimeout(60000);
  await boot(page, 'd4'); const seat = await acceptFirst(page);
  await nav(page, 'DRINK');
  await page.getByTestId('highball-glass').click(); await page.getByTestId('highball-ice').click();
  await hold(page, page.getByTestId('highball-whiskey'), 1000);
  await hold(page, page.getByTestId('highball-soda'), 3000);
  await page.getByTestId('highball-lemon').click(); await page.getByTestId('highball-pickup').click();
  await serveOne(page, seat, 'highball');
  const visual = await page.evaluate(id => {
    const r = window.__d1GameDebug.renderer;
    return { beerVisible: r.seatBeerMesh[id].visible, actorTexture: r.seatActorMesh[id].material.map.image.src };
  }, seat.seatId);
  expect(visual.beerVisible).toBe(true);
  expect(visual.actorTexture).not.toMatch(/drinking-beer|partial-beer/);
  await expect.poll(() => page.evaluate(id => {
    const image = window.__d1GameDebug.renderer.seatBeerMesh[id].material.map.image;
    return image?.currentSrc || image?.src || '';
  }, seat.seatId)).toContain('highball');
  await nav(page, 'INSTANT'); await hold(page, page.getByTestId('cabbage-salad-prepare'), 2700);
  await serveOne(page, seat, 'cabbage-salad');
  await expect(page.locator('#hint')).toHaveText('주문 제공 완료 · 총 2항목');
  expect((await D(page, 'businessView')).orders[0].status).toBe('completed');
});

test('D5 토리카와는 실제 양면 조리 뒤 올바른 접시로 제공되고 손에 네기마가 생기지 않는다', async ({ page }) => {
  test.setTimeout(70000);
  await boot(page, 'd5'); const seat = await acceptFirst(page);
  await nav(page, 'ASSEMBLY');
  await page.getByRole('button', { name: '토리카와', exact: true }).click();
  for (let i = 0; i < 5; i++) await object(page, 'binTorikawa');
  await object(page, 'jigSkewer'); await nav(page, 'GRILL');
  await page.getByTestId('grill-waiting-kawa').locator('[data-seasoning="salt"]').click();
  for (let side = 0; side < 2; side++) {
    await expect.poll(async () => (await D(page, 'cookSlots'))[0].faceElapsedSec, { timeout: 15000 }).toBeGreaterThan(10.2);
    await object(page, 'pgSlot0');
  }
  expect((await D(page, 'dockItems'))[0]).toMatchObject({ menuId: 'kawa', quality: 'Perfect' });
  await serveOne(page, seat, 'kawa');
  const visual = await page.evaluate(id => {
    const r = window.__d1GameDebug.renderer;
    return { plateVisible: r.seatBaseMesh[id].visible, actorTexture: r.seatActorMesh[id].material.map.image.src };
  }, seat.seatId);
  expect(visual.plateVisible).toBe(true);
  expect(visual.actorTexture).not.toMatch(/eating-negima|received-eating/);
  await expect.poll(() => page.evaluate(id => {
    const image = window.__d1GameDebug.renderer.seatBaseMesh[id].material.map.image;
    return image?.currentSrc || image?.src || '';
  }, seat.seatId)).toContain('kawa');
});
