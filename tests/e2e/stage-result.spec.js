import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createD1BusinessDayBrowserSession } from '../../src/application/businessDay/d1BusinessDayBrowserSession.js';
import { createBusinessDayDefinition } from '../../src/domain/businessDay/d1BusinessDay.js';
import { consumeD1BusinessDayReleaseDefinition } from '../../src/application/ports/d1BusinessDayDefinition.js';
import { MemoryStorageAdapter } from '../../src/campaign-runtime.js';
import { S0D3CampaignBridge, S0_D3_STORAGE_PREFIX } from '../../src/scenario/s0-d3-campaign.js';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY } from '../../src/d1/firstOrderRuntimeStorage.js';

// Domain-driven fixtures isolate result UI/save behavior from cooking speed.
async function closingFixture(dayId, { fail = false, partialSettlement = false } = {}) {
  const filename = dayId === 'd1' ? 'd1-business-day-definition' : `${dayId}-business-day-domain`;
  const record = JSON.parse(readFileSync(new URL(`../../content/releases/${filename}.v1.json`, import.meta.url)));
  const definition = dayId === 'd1' ? consumeD1BusinessDayReleaseDefinition(record).definition : createBusinessDayDefinition(record);
  const storage = new MemoryStorageAdapter();
  const bridge = new S0D3CampaignBridge({ storagePort: storage });
  await bridge.loadOrStart();
  bridge.finishPrologue();
  for (let day = 1; day < Number(dayId.slice(1)); day++) {
    await bridge.startDay();
    bridge.enterSettlement();
    await bridge.completeDay('d' + day, { reward: { balance: 200, reputation: 20 } });
  }
  if (dayId === 'd1') await bridge.runtime.saveRepository.saveCheckpoint({ checkpointType: 'day-start', state: bridge.getState(), completedDayId: null });
  const session = await createD1BusinessDayBrowserSession({ definition, storagePort: storage });
  const { port } = session;
  let sequence = 0;
  const dispatch = (type, payload = {}) => port.dispatch({ type, intentId: `result-fixture:${++sequence}`, ...payload });
  for (let tick = 0; tick < 900 && port.getViewModel().phase !== 'charcoal-down'; tick++) {
    let view = port.getViewModel();
    for (const seat of view.seats.filter(s => s.canOrder)) dispatch('accept-order', { orderId: seat.orderId });
    view = port.getViewModel();
    for (const order of view.orders.filter(o => ['accepted', 'partial'].includes(o.status))) {
      for (const line of order.lines) for (let n = 0; n < line.remaining; n++) {
        dispatch('serve-item', { customerId: order.customerId, menuId: line.menuId, seasoning: line.seasoning, quality: line.menuId === 'cabbage-salad' ? null : fail ? 'Fail' : 'Perfect' });
      }
    }
    for (const seat of port.runtime.getState().seats.filter(s => s.status === 'cleanup' && !s.cleanup.active)) dispatch('begin-cleanup', { seatId: seat.id });
    port.advance(1000);
  }
  expect(port.getViewModel().phase).toBe('charcoal-down');
  if (partialSettlement) {
    dispatch('lower-charcoal', { disposedPreparedItems: 0 });
    dispatch('reveal-settlement-step');
  }
  return {
    ...Object.fromEntries([...storage.entries].map(([key, value]) => [S0_D3_STORAGE_PREFIX + key, value])),
    [FIRST_ORDER_RUNTIME_STORAGE_KEY]: JSON.stringify({ stateVersion: 1, dayId, business: port.runtime.getState() }),
  };
}

async function install(page, dayId, options) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/public-shell.html');
  await page.evaluate(entries => {
    localStorage.clear();
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, await closingFixture(dayId, options));
  await page.goto(`/d1-game.html?day=${dayId}`);
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
  return errors;
}

for (const dayId of ['d1', 'd2', 'd3', 'd4', 'd5', 'd6']) {
  test(`${dayId} 마감 한 번 → 두 보상 → 자동 저장, 재접속과 키보드`, async ({ page }) => {
    const errors = await install(page, dayId);
    await page.getByTestId('post-business-action').click();
    await expect(page.getByTestId('continue-button')).toBeVisible();
    const saved = await page.evaluate(() => window.__d1GameDebug.campaignState().economy);
    const reward = saved.settlements.at(-1).reward;
    await expect(page.getByTestId('post-business-title')).toHaveText('스테이지 클리어!');
    await expect(page.getByTestId('result-earnings')).toHaveText(`+${reward.balance}`);
    await expect(page.getByTestId('result-reputation')).toHaveText(`+${reward.reputation}`);
    await expect(page.getByTestId('post-business-panel').locator('button:visible, a:visible')).toHaveCount(1);
    await expect(page.getByTestId('continue-button')).toBeFocused();
    for (const key of ['Tab', 'Shift+Tab', 'Escape', 'ArrowRight']) await page.keyboard.press(key);
    await expect(page.getByTestId('continue-button')).toBeFocused();
    await expect(page.locator('#runtimePausePanel')).toBeHidden();
    const bounds = await page.locator('.stage-result-card').boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`${dayId}-stage-clear.png`) });
    await page.reload();
    await expect(page.getByTestId('continue-button')).toBeVisible();
    await expect(page.getByTestId('result-earnings')).toHaveText(`+${reward.balance}`);
    await expect(page.getByTestId('result-reputation')).toHaveText(`+${reward.reputation}`);
    expect(await page.evaluate(() => window.__d1GameDebug.campaignState().economy)).toEqual(saved);
    await page.getByTestId('continue-button').click();
    await expect(page).toHaveURL(dayId === 'd6' ? /s0-d3\.html$/ : new RegExp(`s0-d3\\.html\\?post=${dayId}$`));
    expect(errors).toEqual([]);
  });
}

test('저장 실패는 보상을 유지하고 재시도하며 한 번만 지급한다', async ({ page }) => {
  const errors = await install(page, 'd2');
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.includes('save.') && String(value).includes('day-complete')) throw new DOMException('Full', 'QuotaExceededError');
      return window.originalSetItem.call(this, key, value);
    };
  });
  await page.getByTestId('post-business-action').click();
  await expect(page.getByRole('button', { name: '저장 다시 시도' })).toBeVisible();
  await expect(page.getByTestId('continue-button')).toBeHidden();
  const before = await page.getByTestId('result-earnings').textContent();
  expect((await page.evaluate(() => window.__d1GameDebug.campaignState())).campaign.completedDayIds).toEqual(['d1']);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await page.getByRole('button', { name: '저장 다시 시도' }).click();
  await expect(page.getByTestId('continue-button')).toBeVisible();
  await expect(page.getByTestId('result-earnings')).toHaveText(before);
  const economy = await page.evaluate(() => window.__d1GameDebug.campaignState().economy);
  await page.reload();
  await expect(page.getByTestId('continue-button')).toBeVisible();
  expect(await page.evaluate(() => window.__d1GameDebug.campaignState().economy)).toEqual(economy);
  expect(errors).toEqual([]);
});

test('구형 부분 정산을 자동 완료하고 0건·명성 감소를 과장하지 않는다', async ({ page }) => {
  const errors = await install(page, 'd1', { fail: true, partialSettlement: true });
  await expect(page.getByTestId('continue-button')).toBeVisible();
  await expect(page.getByTestId('post-business-title')).toHaveText('영업 종료');
  await expect(page.getByTestId('result-reputation')).toHaveText(/^-\d+$/);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('failed-day-result.png') });
  expect((await page.evaluate(() => window.__d1GameDebug.campaignState())).economy.settlements).toHaveLength(1);
  expect(errors).toEqual([]);
});
