import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createD1BusinessDayBrowserSession } from '../../src/application/businessDay/d1BusinessDayBrowserSession.js';
import { consumeD6BusinessDayDefinition } from '../../src/application/ports/d6BusinessDayDefinition.js';
import { MemoryStorageAdapter } from '../../src/campaign-runtime.js';
import { S0_D3_STORAGE_PREFIX } from '../../src/scenario/s0-d3-campaign.js';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY } from '../../src/d1/firstOrderRuntimeStorage.js';

const definition = consumeD6BusinessDayDefinition(JSON.parse(readFileSync(new URL('../../content/releases/d6-business-day-domain.v1.json', import.meta.url))));
const D = (page, name) => page.evaluate(name => window.__d1GameDebug[name](), name);
async function nav(page, station) {
  await page.getByTestId(`quicknav-SCR-SVC-${station}`).click();
  await page.waitForFunction(() => !window.__d1GameDebug.isTransitioning());
}
async function fullSeatFixture() {
  const storage = new MemoryStorageAdapter();
  const { port } = await createD1BusinessDayBrowserSession({ definition, storagePort: storage, developmentStartDay: 'd6' });
  let id = 0;
  const dispatch = (type, data = {}) => {
    const result = port.dispatch({ intentId: `fixture:${++id}`, type, ...data });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
  };
  function accept() {
    for (const s of port.getViewModel().seats.filter(s => s.canOrder)) dispatch('accept-order', { orderId: s.orderId });
  }
  function serve(orderId) {
    const order = port.runtime.getState().orders[orderId];
    for (const line of order.lines) for (let n = 0; n < line.quantity; n++)
      dispatch('serve-item', { customerId: order.customerId, menuId: line.menuId, seasoning: line.seasoning, quality: line.menuId === 'cabbage-salad' ? null : 'Perfect' });
  }
  port.advance(49000); accept(); serve('D6-ORDER-001');
  port.advance(16000);
  for (const s of port.getViewModel().seats.filter(s => s.cleanupNeeded)) dispatch('begin-cleanup', { seatId: s.seatId });
  port.advance(3000); port.advance(6000); accept(); serve('D6-ORDER-002');
  port.advance(4000); accept(); serve('D6-ORDER-003');
  port.advance(4000); accept(); serve('D6-ORDER-004');
  port.advance(4000); accept();
  // 최장 주문을 생각 중(…)으로 숨기지 않는 표시 fixture. 완주 테스트에는 사용하지 않는다.
  const business = port.runtime.getState();
  for (const customer of Object.values(business.customers)) {
    if (customer.phase === 'thinking') {
      customer.phase = 'order-ready'; customer.phaseRemainingMs = 0;
    }
  }
  return {
    ...Object.fromEntries([...storage.entries].map(([key, value]) => [S0_D3_STORAGE_PREFIX + key, value])),
    [FIRST_ORDER_RUNTIME_STORAGE_KEY]: JSON.stringify({ stateVersion: 1, dayId: 'd6', business }),
  };
}

test('D6 만석 fixture에서 좌석 표시·조작 영역과 일시정지·새로고침 복구를 검증한다', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/public-shell.html');
  await page.evaluate(entries => { localStorage.clear(); for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value); }, await fullSeatFixture());
  await page.goto('/d1-game.html?day=d6');
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
  await nav(page, 'CUSTOMERS');
  expect((await D(page, 'businessView')).seats.filter(s => s.occupied && !s.cleanupNeeded)).toHaveLength(6);
  await expect(page.locator('.order-bubble:visible')).toHaveCount(5);
  await expect(page.locator('.customer-serve-target:not([hidden])')).toHaveCount(6);
  // 좌석 배정은 seatingSeed가 정하므로 좌석 번호 대신 표시 형태를 본다. 접수한 주문은
  // 남은 항목을 읽히고, 아직 접수하지 않은 주문은 내용 없이 '주문서'만 보인다(주문 발견).
  await expect(page.locator('.order-bubble:visible').filter({ hasText: '소금 모모 0/2 · 생맥주' })).toHaveCount(1);
  await expect(page.locator('.order-bubble:visible').filter({ hasText: /^주문서$/ })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('d6-full-seats.png') });
  console.log('D6 full-seat renderer sample:', JSON.stringify(await D(page, 'rendererStats')));
  const bubbles = await page.locator('.order-bubble:visible').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  }));
  const targets = await page.locator('.customer-serve-target:not([hidden])').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  }));
  for (const target of targets) {
    expect(target.x).toBeGreaterThanOrEqual(0);
    expect(target.right).toBeLessThanOrEqual(page.viewportSize().width);
    expect(target.y).toBeGreaterThanOrEqual(0);
    expect(target.bottom).toBeLessThanOrEqual(page.viewportSize().height);
    for (const other of targets) if (target !== other)
      expect(target.right <= other.x || other.right <= target.x || target.bottom <= other.y || other.bottom <= target.y).toBe(true);
  }
  for (const a of bubbles) {
    expect(a.x).toBeGreaterThanOrEqual(0); expect(a.right).toBeLessThanOrEqual(page.viewportSize().width);
    expect(a.y).toBeGreaterThanOrEqual(0); expect(a.bottom).toBeLessThanOrEqual(page.viewportSize().height);
    for (const b of bubbles) if (a !== b)
      expect(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, JSON.stringify({ a, b })).toBe(true);
  }
  await page.locator('#businessPhase').click();
  const full = await D(page, 'businessView');
  await page.waitForTimeout(1200);
  expect((await D(page, 'businessView')).clock.elapsedMs).toBe(full.clock.elapsedMs);
  await page.reload();
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
  await page.locator('#businessPhase').click();
  const restored = await D(page, 'businessView');
  expect(restored.clock.paused).toBe(true);
  expect(restored.seats.map(s => [s.seatId, s.customerId, s.phase])).toEqual(full.seats.map(s => [s.seatId, s.customerId, s.phase]));
  for (const seat of full.seats) {
    const after = restored.seats.find(s => s.seatId === seat.seatId);
    expect(Math.abs(after.waitRatio - seat.waitRatio)).toBeLessThan(.02);
  }
  await page.getByTestId('runtime-pause-resume').click();
  expect((await D(page, 'businessView')).clock.paused).toBe(false);
  expect(errors).toEqual([]);
});

test('D5 완료 저장의 이어하기에서 D6 이야기·준비·영업으로 이어진다', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const entries = await fullSeatFixture();
  delete entries[FIRST_ORDER_RUNTIME_STORAGE_KEY];
  await page.goto('/public-shell.html');
  await page.evaluate(entries => { localStorage.clear(); for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value); }, entries);
  await page.reload();
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D6-PREOPEN');
  await expect(page.locator('body')).toHaveAttribute('data-screen-id', 'SCR-STORY-BEAT');
  await page.getByRole('button', { name: '이 장면 건너뛰기' }).click();
  await expect(page.locator('#screen-heading')).toHaveText('여섯째 날 영업 준비');
  await page.getByRole('button', { name: /칸으로 여섯째 영업 시작/ }).click();
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
  expect((await D(page, 'businessView')).dayId).toBe('D6');
  expect(errors).toEqual([]);
});
