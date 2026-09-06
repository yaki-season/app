import { test, expect } from '@playwright/test';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY } from '../../src/d1/firstOrderRuntimeStorage.js';

// 시작 날짜만 개발 진입으로 격리한다. 이후에는 조회 + 일반 마우스/키보드만 사용한다.
// 완성품·주문 주입, 시간 가속, business dispatch 없이 조리부터 22항목을 직접 제공한다.
const D = (page, name) => page.evaluate(name => window.__d1GameDebug[name](), name);
async function nav(page, station) {
  if (await D(page, 'activeScreen') === `SCR-SVC-${station}`) return;
  await page.getByTestId(`quicknav-SCR-SVC-${station}`).click();
  await page.waitForFunction(() => !window.__d1GameDebug.isTransitioning());
}
async function object(page, key) {
  const p = await page.evaluate(key => window.__d1GameDebug.screenPosOf(key), key);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(350);
}
async function hold(page, button, ms) {
  const b = await button.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}
async function drink(page, menu) {
  await nav(page, 'DRINK');
  if (menu === 'highball') {
    await page.getByTestId('highball-glass').click();
    await page.getByTestId('highball-ice').click();
    await hold(page, page.getByTestId('highball-whiskey'), 1000);
    await hold(page, page.getByTestId('highball-soda'), 3000);
    await page.getByTestId('highball-lemon').click();
    await page.getByTestId('highball-pickup').click();
  } else {
    await object(page, 'glassRack');
    const p = await page.evaluate(() => window.__d1GameDebug.screenPosOf('drinkLeverDrag'));
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.mouse.move(p.x, p.y + 60, { steps: 4 }); await page.waitForTimeout(2600);
    await page.mouse.move(p.x, p.y - 60, { steps: 4 }); await page.waitForTimeout(600); await page.mouse.up();
    await page.getByTestId('drink-finish').click();
  }
}
async function skewers(page, menu, seasoning, quantity) {
  const names = { negima: '네기마', momo: '모모', kawa: '토리카와' };
  await nav(page, 'ASSEMBLY');
  await page.getByRole('button', { name: names[menu], exact: true }).click();
  for (let n = 0; n < quantity; n++) {
    for (let i = 0; i < 5; i++)
      await object(page, menu === 'kawa' ? 'binTorikawa' : menu === 'negima' && i % 2 ? 'binLeek' : 'binChicken');
    if (seasoning === 'tare') {
      const pot = page.getByTestId('assembly-tare-pot');
      await pot.click(); await pot.focus();
      await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
    }
    await object(page, 'jigSkewer');
  }
  await nav(page, 'GRILL');
  for (let n = 0; n < quantity; n++) {
    await page.getByTestId(`grill-waiting-${menu}`).locator(`[data-seasoning="${seasoning}"]`).click();
    await page.waitForTimeout(350);
    await expect.poll(async () => (await D(page, 'cookSlots')).filter(s => s.status !== 'empty').length).toBe(n + 1);
  }
  for (let side = 0; side < 2; side++) {
    for (let slot = 0; slot < quantity; slot++) {
      await expect.poll(async () => (await D(page, 'cookSlots'))[slot].faceElapsedSec, { timeout: 18000, intervals: [150] })
        .toBeGreaterThan(menu === 'kawa' ? 10.2 : 8.2);
      await object(page, `pgSlot${slot}`);
    }
  }
}

test('D6 실입력 완주: 실제 조리 시간으로 10주문·22항목을 제공하고 후일담을 저장한다', async ({ page }) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Seed 7 moves the regular to the final wave; no meals, orders or time are injected.
  await page.goto('/public-shell.html');
  await page.evaluate(key => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ stateVersion: 1, dayId: 'd6', daySeed: 7, customerRandomizationVersion: 2 }));
  }, FIRST_ORDER_RUNTIME_STORAGE_KEY);
  await page.goto('/d1-game.html?day=d6&devUnlock=1');
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
  expect((await D(page, 'businessView')).seats[0].customerId).not.toBe('REGULAR_TSUKIOKA');
  // 새로고침 시 개발용 초기화가 반복되지 않도록 URL만 정리한다.
  await page.evaluate(() => history.replaceState(null, '', '/d1-game.html?day=d6'));
  let peakSeats = 0, lastCompleted = -1;
  let regularAlongsideOthers = false;
  const deadline = Date.now() + 540000;
  while (Date.now() < deadline) {
    await nav(page, 'CUSTOMERS');
    let view = await D(page, 'businessView');
    if (!regularAlongsideOthers && view.seats.some(s => s.customerId === 'REGULAR_TSUKIOKA')
      && view.seats.filter(s => s.occupied && !s.cleanupNeeded).length > 1) {
      regularAlongsideOthers = true;
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath('regular-late-with-guests.png') });
    }
    peakSeats = Math.max(peakSeats, view.seats.filter(s => s.occupied && !s.cleanupNeeded).length);
    for (const seat of view.seats.filter(s => s.canOrder)) {
      if ((await D(page, 'businessView')).seats.find(s => s.seatId === seat.seatId)?.canOrder)
        await page.getByTestId(`serve-target-${seat.seatId}`).click();
    }
    view = await D(page, 'businessView');
    const completed = view.orders.filter(o => o.status === 'completed').length;
    if (completed !== lastCompleted) {
      console.log(`D6 real input: ${completed}/10 orders, peak seats ${peakSeats}`);
      lastCompleted = completed;
    }
    for (const seat of view.seats.filter(s => s.cleanupNeeded))
      await hold(page, page.getByTestId(`serve-target-${seat.seatId}`), 3200);
    view = await D(page, 'businessView');
    if (['charcoal-down', 'settlement', 'complete'].includes(view.phase)) break;
    const order = view.orders.find(o => ['accepted', 'partial'].includes(o.status));
    if (!order) { await page.waitForTimeout(600); continue; }
    const line = order.lines.filter(l => l.remaining > 0)
      .sort((a, b) => Number(['negima', 'momo', 'kawa'].includes(a.menuId)) - Number(['negima', 'momo', 'kawa'].includes(b.menuId)))[0];
    const seasoning = line.seasoning ?? 'salt';
    console.log(`D6 prepare: ${order.orderId} ${line.menuId} ${seasoning} x${line.remaining}`);
    if (['beer', 'highball'].includes(line.menuId)) await drink(page, line.menuId);
    else if (line.menuId === 'cabbage-salad') {
      await nav(page, 'INSTANT'); await hold(page, page.getByTestId('cabbage-salad-prepare'), 2700);
    } else await skewers(page, line.menuId, seasoning, Math.min(line.remaining, 2));
    await nav(page, 'CUSTOMERS');
    const item = (await D(page, 'dockItems')).find(i => i.menuId === line.menuId
      && (line.seasoning !== 'tare' || i.seasoning === 'tare'));
    expect(item, `prepared ${line.menuId}`).toBeTruthy();
    await page.getByTestId(`dock-item-${item.id}`).click();
    await page.getByTestId(`serve-target-${order.seatId}`).click();
    if (await page.getByTestId('serve-quantity').isVisible()) await page.getByTestId('serve-all').click();
  }
  const view = await D(page, 'businessView');
  expect(regularAlongsideOthers).toBe(true);
  expect(view.orders.filter(o => o.status === 'completed')).toHaveLength(10);
  expect(view.orders.reduce((sum, o) => sum + o.lines.reduce((n, l) => n + l.served, 0), 0)).toBe(22);
  await page.locator('#postBusinessAction').click();
  await expect(page.getByTestId('continue-button')).toBeVisible();
  await expect(page.getByTestId('post-business-title')).toHaveText('스테이지 클리어!');
  await expect(page.getByTestId('result-earnings')).toHaveText('+111');
  await expect(page.getByTestId('result-reputation')).toHaveText('+30');
  const campaign = await D(page, 'campaignState');
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('single-result-screen.png') });
  expect(campaign.campaign.nodeId).toBe('d6-complete');
  expect(campaign.progression.unlockIds).toContain('day-d7');
  expect(campaign.economy.settlements.at(-1).summary.customers).toMatchObject({ visited: 10, lost: 0, cleanedSeats: 10 });
  console.log('D6 real-input final:', JSON.stringify({ peakSeats, summary: campaign.economy.settlements.at(-1).summary }));
  await page.locator('#continueButton').click();
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D6-EPILOGUE');
  await page.getByRole('button', { name: '시작 화면으로' }).click();
  await expect(page.getByRole('button', { name: '후일담 다시 읽기' })).toBeVisible();
  expect(errors).toEqual([]);
});
