import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomizeBusinessDayRecord } from '../../src/domain/businessDay/randomizeBusinessDay.js';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY } from '../../src/d1/firstOrderRuntimeStorage.js';

const D = (page, name, ...args) => page.evaluate(({ name, args }) => window.__d1GameDebug?.[name]?.(...args) ?? null, { name, args });
async function nav(page, station) {
  await page.getByTestId(`quicknav-SCR-SVC-${station}`).click();
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
}
async function object(page, key) {
  const p = await D(page, 'screenPosOf', key);
  expect(p).toBeTruthy(); await page.mouse.click(p.x, p.y); await page.waitForTimeout(330);
}
async function boot(page, dayId = 'd1') {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  if (dayId !== 'd1') {
    const record = JSON.parse(readFileSync(new URL(`../../content/releases/${dayId}-business-day-domain.v1.json`, import.meta.url), 'utf8'));
    let seed = 1;
    while (randomizeBusinessDayRecord(record, { seed }).waves[0].customers[0].id !== 'REGULAR_TSUKIOKA') seed++;
    await page.goto('/public-shell.html');
    await page.evaluate(({ key, dayId, seed }) => localStorage.setItem(key,
      JSON.stringify({ stateVersion: 1, dayId, daySeed: seed, customerRandomizationVersion: 2 })),
    { key: FIRST_ORDER_RUNTIME_STORAGE_KEY, dayId, seed });
  }
  await page.goto(dayId === 'd1' ? '/d1-game.html' : `/d1-game.html?day=${dayId}&devUnlock=1`);
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await page.evaluate(day => history.replaceState(null, '', `/d1-game.html?day=${day}`), dayId);
  await expect.poll(async () => (await D(page, 'businessView')).seats.some(s => s.customerId === 'REGULAR_TSUKIOKA' && s.canOrder), { timeout: 10000 }).toBe(true);
  return errors;
}
async function accept(page) {
  const seat = (await D(page, 'businessView')).seats.find(s => s.customerId === 'REGULAR_TSUKIOKA');
  await page.getByTestId(`serve-target-${seat.seatId}`).click();
  await expect(page.locator('#departureCutscene')).toHaveAttribute('data-beat', 'arrival');
  return seat.seatId;
}
async function readScene(page) {
  const lines = [];
  for (let i = 0; i < 15 && await page.locator('#departureCutscene').isVisible(); i++) {
    lines.push(await page.locator('#departureCutsceneLine').textContent());
    await page.locator('#departureCutsceneContinue').click();
  }
  await expect(page.locator('#departureCutscene')).toBeHidden();
  return lines;
}

test('실입력: 대화를 듣고 맥주·네기마를 직접 만들어 내면 식사와 배웅이 기록된다', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  const seatId = await accept(page);
  expect((await readScene(page)).at(-1)).toContain('생맥주');
  await nav(page, 'DRINK');
  await object(page, 'glassRack');
  const lever = await D(page, 'screenPosOf', 'drinkLeverDrag');
  await page.mouse.move(lever.x, lever.y); await page.mouse.down();
  await page.mouse.move(lever.x, lever.y + 60, { steps: 4 }); await page.waitForTimeout(2600);
  await page.mouse.move(lever.x, lever.y - 60, { steps: 4 }); await page.waitForTimeout(600); await page.mouse.up();
  await page.getByTestId('drink-finish').click();
  await nav(page, 'CUSTOMERS');
  await page.locator('.dock-card').filter({ hasText: '생맥주' }).click();
  await page.getByTestId(`serve-target-${seatId}`).click();
  await nav(page, 'ASSEMBLY');
  for (let n = 0; n < 2; n++) {
    for (const key of ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken']) await object(page, key);
    await object(page, 'jigSkewer');
  }
  await nav(page, 'GRILL');
  for (let n = 0; n < 2; n++) {
    await page.locator('#grillWaitingNegimaSalt').click(); await page.waitForTimeout(350);
  }
  await page.locator('#guestJournalToggle').click();
  const frozen = (await D(page, 'cookSlots'))[0].frontElapsedSec;
  const clock = (await D(page, 'businessView')).clock.elapsedMs;
  await expect(page.locator('#guestJournalEntries')).toContainText('생맥주');
  await page.waitForTimeout(650);
  expect((await D(page, 'cookSlots'))[0].frontElapsedSec).toBe(frozen);
  expect((await D(page, 'businessView')).clock.elapsedMs).toBe(clock);
  await page.keyboard.press('Escape');
  for (const side of ['front', 'back']) {
    for (let slot = 0; slot < 2; slot++) {
      await expect.poll(async () => (await D(page, 'cookSlots'))[slot][`${side}Doneness`], { timeout: 15000, intervals: [120] }).toBe('perfect');
      await page.getByTestId(`grill-status-${slot}`).click(); await page.waitForTimeout(350);
    }
  }
  await nav(page, 'CUSTOMERS');
  await page.locator('.dock-card').filter({ hasText: '네기마' }).first().click();
  await page.getByTestId(`serve-target-${seatId}`).click();
  await page.getByTestId('serve-all').click();
  await expect(page.locator('#departureCutscene')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#departureCutscene')).toHaveAttribute('data-beat', 'departure');
  const stopped = (await D(page, 'businessView')).clock.elapsedMs;
  await page.waitForTimeout(500);
  expect((await D(page, 'businessView')).clock.elapsedMs).toBe(stopped);
  await page.screenshot({ path: test.info().outputPath('meal-conversation.png') });
  expect((await readScene(page)).join(' ')).toContain('파가 달게');
  await page.reload();
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await expect(page.locator('#departureCutscene')).toBeHidden();
  await page.locator('#guestJournalToggle').click();
  await expect(page.locator('#guestJournalEntries')).toContainText('버스 소리');
  await expect(page.locator('#guestJournalEntries')).toContainText('생맥주 · 네기마');
  await expect(page.locator('#guestJournalEntries article')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('remembered-evening.png') });
  expect(errors).toEqual([]);
});

test('읽던 줄 복구·키 반복 방지·포커스 격리·중첩 정지·건너뛰기', async ({ page }) => {
  const errors = await boot(page); await accept(page);
  await page.locator('#departureCutsceneContinue').click();
  const line = await page.locator('#departureCutsceneLine').textContent();
  await page.reload(); await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await expect(page.locator('#departureCutsceneLine')).toHaveText(line);
  await expect.poll(() => D(page, 'runtimeSuspension')).toMatchObject({ paused: true, cookPaused: true });
  await page.locator('#departureCutsceneContinue').focus();
  await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await expect(page.locator('#guestSceneProgress')).toContainText('3 / 4');
  await page.keyboard.press('Tab');
  await expect(page.locator('#guestSceneSkip')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#departureCutsceneContinue')).toBeFocused();
  const screen = await D(page, 'activeScreen');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('1');
  expect(await D(page, 'activeScreen')).toBe(screen);
  await D(page, 'setRuntimeSuspended', 'manual-pause', true);
  await page.locator('#guestSceneSkip').click();
  expect((await D(page, 'runtimeSuspension')).reasons).toEqual(['manual-pause']);
  await page.getByTestId('runtime-pause-resume').click();
  expect(errors).toEqual([]);
});

for (const dayId of ['d2', 'd3', 'd4', 'd5', 'd6']) {
  test(`${dayId} 실제 배정 메뉴의 인사·배웅과 좌석 유지`, async ({ page }) => {
    const errors = await boot(page, dayId); const seatId = await accept(page);
    const lines = await readScene(page);
    const order = (await D(page, 'businessView')).orders.find(o => o.seatId === seatId);
    for (const item of order.lines) expect(lines.at(-1)).toContain(item.menuLabel);
    // 시작/경계 fixture: 각 날짜 배웅을 빠르게 재현한다. 실조리는 위 별도 테스트가 담당한다.
    for (const [i, item] of order.lines.entries()) for (let n = 0; n < item.quantity; n++) {
      expect(await D(page, 'businessDispatch', { type: 'serve-item', intentId: `${dayId}:${i}:${n}`,
        seatId, menuId: item.menuId, seasoning: item.seasoning, quality: item.menuId === 'cabbage-salad' ? null : 'Perfect' })).toMatchObject({ ok: true, applied: true });
    }
    // 그릴을 보던 중 식사가 끝나도 실제 렌더가 손님 화면으로 바뀐 뒤 정지해야 한다.
    if (dayId === 'd6') await nav(page, 'GRILL');
    await expect(page.locator('#departureCutscene')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#departureCutscene')).toHaveAttribute('data-scene-id', `SCN-${dayId.toUpperCase()}-TSUKIOKA-DEPARTURE`);
    expect(await D(page, 'activeScreen')).toBe('SCR-SVC-CUSTOMERS');
    expect(await page.evaluate(id => window.__d1GameDebug.renderer.seatActorMesh[id].visible, seatId)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${dayId}-dialogue.png`) });
    if (dayId === 'd6') {
      await page.reload();
      await expect.poll(() => D(page, 'businessReady')).toBe(true);
      await expect(page.locator('#departureCutscene')).toBeVisible();
    }
    await page.locator('#guestSceneSkip').click();
    if (dayId === 'd6') expect(await D(page, 'activeScreen')).toBe('SCR-SVC-GRILL');
    await page.locator('#guestJournalToggle').click();
    await expect(page.locator('#guestJournalEntries article')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('실패 음식의 배웅은 맛을 칭찬하지 않고 새로고침 뒤 반복하지 않는다', async ({ page }) => {
  await boot(page); const seatId = await accept(page); await page.locator('#guestSceneSkip').click();
  // 완성품만 시작 fixture로 준비하고 실제 카드→손님으로 실패를 제공한다.
  const itemId = await D(page, 'dockAdd', { menu: '네기마', label: 'Fail', good: false });
  await page.getByTestId(`dock-item-${itemId}`).click();
  await page.getByTestId(`serve-target-${seatId}`).click();
  await expect(page.locator('#departureCutscene')).toHaveAttribute('data-beat', 'departure');
  await expect(page.locator('#departureCutsceneLine')).toContainText('먹기 어렵');
  await page.locator('#guestSceneSkip').click();
  await page.reload(); await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await expect(page.locator('#departureCutscene')).toBeHidden();
  await page.locator('#guestJournalToggle').click();
  await expect(page.locator('#guestJournalEntries')).toContainText('식사를 마치지 못했다');
});
