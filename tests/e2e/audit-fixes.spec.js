import { test, expect } from '@playwright/test';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY } from '../../src/d1/firstOrderRuntimeStorage.js';

const D = (page, name) => page.evaluate(name => window.__d1GameDebug[name](), name);
test('새 영업은 조작하기 전부터 배정 seed와 버전을 저장한다', async ({ page }) => {
  await page.goto('/d1-game.html?day=d6&devUnlock=1&reset=1');
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), FIRST_ORDER_RUNTIME_STORAGE_KEY);
  expect(saved.customerRandomizationVersion).toBe(2);
  expect(saved.daySeed).toBeGreaterThan(0);
  expect(saved.business).toBeTruthy();
  await page.evaluate(() => history.replaceState(null, '', '/d1-game.html?day=d6'));
  await page.reload();
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
  expect((await D(page, 'businessView')).seats[0].customerId).toBe(saved.business.seats[0].customerId);
});

async function boot(page, day = 'd6', seed = 7) {
  await page.goto('/public-shell.html');
  await page.evaluate(({ key, day, seed }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ stateVersion: 1, dayId: day, daySeed: seed, customerRandomizationVersion: 2 }));
  }, { key: FIRST_ORDER_RUNTIME_STORAGE_KEY, day, seed });
  await page.goto(`/d1-game.html?day=${day}&devUnlock=1`);
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
}
async function nav(page, station) {
  await page.getByTestId(`quicknav-SCR-SVC-${station}`).click();
  await page.waitForFunction(() => !window.__d1GameDebug.isTransitioning());
}
async function point(page, key) {
  return page.evaluate(key => window.__d1GameDebug.screenPosOf(key), key);
}
async function hold(page, target, ms) {
  const b = await target.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}

test('첫 손님을 섞고 새로고침해도 같은 주문·인물을 유지한다', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  const first = (await D(page, 'businessView')).seats[0];
  expect(first.customerId).toBe('D6-SOLO-6');
  expect(first.orderId).toBe('D6-ORDER-001');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
  expect((await D(page, 'businessView')).seats[0].customerId).toBe(first.customerId);
  expect((await D(page, 'businessView')).orders[0].lines).toEqual([]);
  await expect.poll(async () => (await D(page, 'businessView')).seats[0].canOrder, { timeout: 10000 }).toBe(true);
  await page.getByTestId(`serve-target-${first.seatId}`).click();
  expect((await D(page, 'businessView')).orders[0].lines.map(l => [l.menuId, l.quantity]))
    .toEqual([['kawa', 1], ['beer', 1]]);
  await page.screenshot({ path: test.info().outputPath('random-first-resumed.png') });
  expect(errors).toEqual([]);
});

test('비법노트와 Escape가 시간을 멈추고 중첩된 정지 이유를 보존한다', async ({ page }) => {
  await boot(page);
  await page.getByTestId('recipe-book-toggle').click();
  const before = await D(page, 'businessView');
  await page.waitForTimeout(1100);
  expect((await D(page, 'businessView')).clock.elapsedMs).toBe(before.clock.elapsedMs);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('recipe-book')).toBeHidden();
  await expect.poll(async () => (await D(page, 'businessView')).clock.elapsedMs).toBeGreaterThan(before.clock.elapsedMs);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('runtime-pause')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('runtime-pause')).toBeHidden();
  await page.getByTestId('recipe-book-toggle').click();
  // Background/foreground is a lifecycle fixture, while modal controls use real input.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByTestId('recipe-book-close').click();
  expect((await D(page, 'runtimeSuspension')).paused).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await D(page, 'runtimeSuspension')).paused).toBe(false);
});

test('거품만 있는 잔과 극소량 하이볼을 완성품으로 올리지 못한다', async ({ page }) => {
  await boot(page); await nav(page, 'DRINK');
  const rack = await point(page, 'glassRack'); await page.mouse.click(rack.x, rack.y);
  const lever = await point(page, 'drinkLeverDrag');
  await page.mouse.move(lever.x, lever.y); await page.mouse.down();
  await page.mouse.move(lever.x, lever.y - 60, { steps: 4 });
  await page.waitForTimeout(250); await page.mouse.up();
  await expect(page.getByTestId('drink-finish')).toBeDisabled();
  expect(await D(page, 'dockItems')).toHaveLength(0);
  await page.getByTestId('highball-glass').click(); await page.getByTestId('highball-ice').click();
  await hold(page, page.getByTestId('highball-whiskey'), 100);
  await hold(page, page.getByTestId('highball-soda'), 200);
  await expect(page.getByTestId('highball-lemon')).toBeDisabled();
  expect(await D(page, 'dockItems')).toHaveLength(0);
});

for (const menu of ['negima', 'momo', 'kawa']) {
  test(`${menu}: 빠른 재료 입력 5회와 음식 위 붓질로 타레를 완성한다`, async ({ page }) => {
    await boot(page); await nav(page, 'ASSEMBLY');
    const labels = { negima: '네기마', momo: '모모', kawa: '토리카와' };
    await page.getByRole('button', { name: labels[menu], exact: true }).click();
    const chicken = await point(page, menu === 'kawa' ? 'binTorikawa' : 'binChicken');
    const leek = await point(page, 'binLeek');
    for (let i = 0; i < 5; i++) {
      const p = menu === 'negima' && i % 2 ? leek : chicken;
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(60);
    }
    const art = await D(page, 'assemblyArtRuntime');
    expect((menu === 'negima' ? art : art[menu]).build.ingredientCount).toBe(5);
    await page.getByTestId('assembly-tare-pot').click();
    const bounds = await D(page, 'assemblyTareTargetBounds');
    expect(bounds.right - bounds.left).toBeLessThan(page.viewportSize().width * 0.25);
    const y = (bounds.top + bounds.bottom) / 2;
    await page.mouse.move(bounds.left + 5, y); await page.mouse.down();
    await page.mouse.move(bounds.right - 5, y, { steps: 20 }); await page.mouse.up();
    await expect(page.getByTestId('assembly-tare-cursor')).toHaveAttribute('data-coverage', '1');
    const jig = await point(page, 'jigSkewer'); await page.mouse.click(jig.x, jig.y);
    await nav(page, 'GRILL');
    await expect(page.locator(`#grillWaiting${menu === 'negima' ? 'Negima' : menu === 'momo' ? 'Momo' : 'Kawa'}TareCount`)).toHaveText('× 1');
  });
}
