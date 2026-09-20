import { test, expect } from '@playwright/test';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY } from '../../src/d1/firstOrderRuntimeStorage.js';
import { pourPerfectBeer } from './helpers/beerPour.js';

// 시작 날짜만 개발 진입으로 격리한다. 이후에는 조회 + 일반 마우스/키보드만 사용한다.
// 완성품·주문 주입, 시간 가속, business dispatch 없이 조리부터 22항목을 직접 제공한다.
const D = async (page, name) => {
  for (let i = 0; i < 64; i++) {
    const story = await page.evaluate(() => window.__d1GameDebug.departureCutscene());
    if (!story.active && !story.pendingIds.length) break;
    await expect(page.locator('#departureCutsceneContinue')).toBeVisible();
    await page.locator('#departureCutsceneContinue').click();
  }
  return page.evaluate(name => window.__d1GameDebug[name](), name);
};
async function click(page, target) {
  // 확인과 클릭 사이에 열린 대화만 읽고 다시 클릭한다. 비활성 조작/게임 오류는 숨기지 않는다.
  for (let i = 0; i < 6; i++) {
    await D(page, 'activeScreen');
    try { await target.click({timeout:1200}); return; }
    catch (error) {
      if (!await page.locator('#departureCutscene').isVisible()) throw error;
    }
  }
  throw new Error('대화 이후 실제 조작을 재개하지 못했습니다');
}
async function nav(page, station) {
  if (await D(page, 'activeScreen') === `SCR-SVC-${station}`) return;
  await click(page, page.getByTestId(`quicknav-SCR-SVC-${station}`));
  await page.waitForFunction(() => !window.__d1GameDebug.isTransitioning());
}
async function object(page, key) {
  // 배웅 대화는 손님 화면에서 듣는다. 그 뒤 원래 작업대로 실제 이동해 조리를 잇는다.
  await nav(page, key.startsWith('pgSlot') ? 'GRILL' : key === 'glassRack' ? 'DRINK' : 'ASSEMBLY');
  const p = await page.evaluate(key => window.__d1GameDebug.screenPosOf(key), key);
  expect(p, `${key} 실제 작업대 클릭 영역`).toBeTruthy();
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(350);
}
async function hold(page, button, ms) {
  await D(page, 'activeScreen');
  const b = await button.boundingBox();
  expect(b, '이야기를 마친 실제 작업대의 누르기 영역').toBeTruthy();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}
async function drink(page, menu) {
  await nav(page, 'DRINK');
  if (menu === 'highball') {
    await click(page, page.getByTestId('highball-glass'));
    await click(page, page.getByTestId('highball-ice'));
    await hold(page, page.getByTestId('highball-whiskey'), 1000);
    await hold(page, page.getByTestId('highball-soda'), 3000);
    await click(page, page.getByTestId('highball-lemon'));
    await click(page, page.getByTestId('highball-pickup'));
  } else {
    await object(page, 'glassRack');
    await pourPerfectBeer(page, await page.evaluate(() => window.__d1GameDebug.screenPosOf('drinkLeverDrag')));
    await click(page, page.getByTestId('drink-finish'));
  }
}
async function skewers(page, menu, seasoning, quantity) {
  const names = { negima: '네기마', momo: '모모', kawa: '토리카와' };
  await nav(page, 'ASSEMBLY');
  await click(page, page.getByRole('button', { name: names[menu], exact: true }));
  for (let n = 0; n < quantity; n++) {
    for (let i = 0; i < 5; i++)
      await object(page, menu === 'kawa' ? 'binTorikawa' : menu === 'negima' && i % 2 ? 'binLeek' : 'binChicken');
    if (seasoning === 'tare') {
      const pot = page.getByTestId('assembly-tare-pot');
      await click(page, pot); await pot.focus();
      await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
    }
    await object(page, 'jigSkewer');
  }
  await nav(page, 'GRILL');
  for (let n = 0; n < quantity; n++) {
    await click(page, page.getByTestId(`grill-waiting-${menu}`).locator(`[data-seasoning="${seasoning}"]`));
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
  // 세션 생성 성공은 화면 진입 성공과 다르다. 로딩 오류에서 10분간 빈 주문을 순회하지 않는다.
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.businessReady()), {timeout:25000}).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-entry-state', 'ready');
  expect((await D(page, 'businessView')).seats.find(seat => seat.occupied)?.customerId).not.toBe('REGULAR_TSUKIOKA');
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
    const occupied = view.seats.filter(s => s.occupied && !s.cleanupNeeded).length;
    if (occupied === 6 && peakSeats < 6) await page.screenshot({path:test.info().outputPath('six-customers.png')});
    peakSeats = Math.max(peakSeats, occupied);
    for (const seat of view.seats.filter(s => s.canOrder)) {
      if ((await D(page, 'businessView')).seats.find(s => s.seatId === seat.seatId)?.canOrder)
        await click(page, page.getByTestId(`serve-target-${seat.seatId}`));
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
    await click(page, page.getByTestId(`dock-item-${item.id}`));
    await click(page, page.getByTestId(`serve-target-${order.seatId}`));
    if (await page.getByTestId('serve-quantity').isVisible()) await click(page, page.getByTestId('serve-all'));
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
  expect(await page.evaluate(() => window.__d1GameDebug.renderer.textureErrors())).toBe(0);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('single-result-screen.png') });
  expect(campaign.campaign.nodeId).toBe('d6-complete');
  expect(campaign.progression.unlockIds).toContain('day-d7');
  expect(campaign.economy.settlements.at(-1).summary.customers).toMatchObject({ visited: 10, lost: 0, cleanedSeats: 10 });
  for (const key of ['tsukioka', 'ren', 'mio', 'sae', 'hayato', 'genji', 'akane', 'naoko', 'shun', 'daichi']) for (const beat of ['arrival', 'departure'])
    expect(campaign.story.flagIds).toContain(`guest:${key}:d6:scene:${beat}`);
  console.log('D6 real-input final:', JSON.stringify({ peakSeats, summary: campaign.economy.settlements.at(-1).summary }));
  await page.locator('#continueButton').click();
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D6-EPILOGUE');
  await page.getByRole('button', { name: '시작 화면으로' }).click();
  await expect(page.getByRole('button', { name: '후일담 다시 읽기' })).toBeVisible();
  expect(errors).toEqual([]);
});
