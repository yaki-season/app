import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { consumeD6BusinessDayDefinition, loadD6BusinessDayDefinition } from '../../src/application/ports/d6BusinessDayDefinition.js';
import { createD1BusinessDayBrowserSession } from '../../src/application/businessDay/d1BusinessDayBrowserSession.js';
import { MemoryStorageAdapter, D1_SETTLEMENT_STEPS, createD1BusinessDayState, advanceD1BusinessDay } from '../../src/campaign-runtime.js';
import { normalizeLegacyCampaignState } from '../../src/scenario/s0-d3-campaign.js';

const record = JSON.parse(readFileSync(new URL('../../content/releases/d6-business-day-domain.v1.json', import.meta.url)));
const definition = consumeD6BusinessDayDefinition(record);
async function start(storagePort = new MemoryStorageAdapter()) {
  return createD1BusinessDayBrowserSession({ definition, storagePort, developmentStartDay: 'd6' });
}
let event = 0;
function command(port, type, fields = {}) {
  const result = port.dispatch({ intentId: `d6-test:${++event}`, type, ...fields });
  expect(result.ok, JSON.stringify(result)).toBe(true);
}
function acceptReady(port) {
  for (const order of port.getViewModel().orders.filter(o => o.status === 'unaccepted')) {
    if (port.getViewModel().seats.some(s => s.orderId === order.orderId && s.canOrder))
      command(port, 'accept-order', { orderId: order.orderId });
  }
}
function serve(port, orderId) {
  const state = port.runtime.getState();
  const order = state.orders[orderId];
  for (const line of order.lines) for (let n = line.servedQualities.length; n < line.quantity; n++)
    command(port, 'serve-item', { customerId: order.customerId, menuId: line.menuId,
      seasoning: line.seasoning, quality: line.menuId === 'cabbage-salad' ? null : 'Perfect' });
}
function clean(port) {
  for (const seat of port.getViewModel().seats.filter(s => s.cleanupNeeded && !port.runtime.getState().seats.find(raw => raw.id === s.seatId).cleanup.active))
    command(port, 'begin-cleanup', { seatId: seat.seatId });
}

describe('D6 겹침 도착·회전·저장', () => {
  it('10명·10건·22항목과 기존 공정만 로드하며 잘못된 메뉴/상한을 거부한다', async () => {
    expect(definition.waves.map(w => w.customers.length)).toEqual([1, 2, 3, 1, 3]);
    const d5 = JSON.parse(readFileSync(new URL('../../content/releases/d5-business-day-domain.v1.json', import.meta.url)));
    expect(definition.stationProcesses).toEqual(d5.stationProcesses);
    expect(definition.economy).toEqual(d5.economy);
    for (const mutate of [
      r => { r.limits.maxActiveOrders = 4; },
      r => { r.waves[0].customers[0].order.lines[0].menuId = 'fan'; },
      r => { r.waves[1].requiresOrderCompletionIds = ['D6-ORDER-001']; },
    ]) {
      const bad = structuredClone(record); mutate(bad);
      expect(() => consumeD6BusinessDayDefinition(bad)).toThrow();
    }
    expect(await loadD6BusinessDayDefinition({ fetchImpl: async () => ({ ok: false, status: 404 }) }))
      .toMatchObject({ ok: false, error: { code: 'D6_DEFINITION_HTTP' } });
  });

  it('첫 파동 보호 뒤 6석 점유, 일시정지·복구, W5 분할 입장과 1회 정산을 검증한다', async () => {
    const storage = new MemoryStorageAdapter();
    let { port } = await start(storage);
    port.advance(49000);
    expect(port.runtime.getState().metrics.visitedCustomers).toBe(1);
    acceptReady(port); serve(port, 'D6-ORDER-001');
    port.advance(16000); clean(port); port.advance(3000); port.advance(6000);
    // W2 동행과 W3 첫 개인이 겹친다. 식사 전까지 전량 제공한 동행도 용량을 돌려준다.
    acceptReady(port);
    serve(port, 'D6-ORDER-002');
    port.advance(4000); acceptReady(port);
    serve(port, 'D6-ORDER-003');
    port.advance(4000); acceptReady(port);
    serve(port, 'D6-ORDER-004');
    port.advance(4000); acceptReady(port);
    const full = port.runtime.getState();
    expect(full.seats.filter(s => s.status === 'occupied')).toHaveLength(6);
    expect(full.limits.peakActiveOrders).toBe(3);
    command(port, 'pause'); const paused = port.runtime.getState(); port.advance(30000);
    expect(port.runtime.getState()).toEqual(paused);
    const resumed = await createD1BusinessDayBrowserSession({ definition, storagePort: storage, businessSnapshot: paused });
    expect(resumed.ok).toBe(true); port = resumed.port;
    expect(port.runtime.getState().customers).toEqual(full.customers);
    expect(port.runtime.getState().seats).toEqual(full.seats);
    expect(port.runtime.getState().clock.paused).toBe(false);
    let split = false;
    for (let step = 0; step < 450; step++) {
      acceptReady(port);
      for (const o of port.getViewModel().orders.filter(o => ['accepted', 'partial'].includes(o.status))) serve(port, o.orderId);
      clean(port); port.advance(1000);
      const state = port.runtime.getState();
      if (state.waves[4].status === 'pending' && state.waves[4].nextCustomerIndex > 0) split = true;
      if (state.phase === 'charcoal-down') break;
    }
    expect(split).toBe(true);
    expect(port.runtime.getState().metrics).toMatchObject({ visitedCustomers: 10, completedOrders: 10, servedItems: 22, lostCustomers: 0, cleanedSeats: 10 });
    command(port, 'lower-charcoal');
    for (const _ of D1_SETTLEMENT_STEPS) command(port, 'reveal-settlement-step');
    const completed = await port.finalize();
    expect(completed.ok).toBe(true);
    expect(completed.campaign.campaign.nodeId).toBe('d6-complete');
    expect(completed.campaign.progression.unlockIds).toEqual(expect.arrayContaining(['day-d6-completed', 'day-d7']));
    expect(await port.finalize()).toMatchObject({ ok: true, duplicate: true });
  });

  it('D5 종착 저장을 보상 변경 없이 D6 준비로 옮기고 반복 정규화해도 변하지 않는다', async () => {
    const session = await start();
    const legacy = session.bridge.getState();
    Object.assign(legacy.campaign, { nodeId: 'd5-complete', nodeKind: 'preview', dayId: null, phase: 'preview' });
    const normalized = normalizeLegacyCampaignState(legacy);
    expect(normalized.campaign).toMatchObject({ nodeId: 'd6', phase: 'pre-open' });
    expect(normalized.economy).toEqual(legacy.economy);
    expect(normalizeLegacyCampaignState(normalized)).toEqual(normalized);
  });

  it('빈 좌석 총수가 충분해도 인접하지 않으면 동행을 쪼개지 않는다', () => {
    // 좌석 단편화만 fixture로 만든다. 입장 판정은 실제 도메인 함수를 호출한다.
    let state = createD1BusinessDayState({ definition, runId: 'fragmented:d6' });
    state.customers.REGULAR_TSUKIOKA.phase = 'done';
    state.orders['D6-ORDER-001'].status = 'completed';
    state.clock.elapsedMs = 45000;
    state.seats.forEach((seat, i) => { seat.customerId = null; seat.status = i % 2 ? 'cleanup' : 'empty'; });
    state = advanceD1BusinessDay(state, definition, 1);
    expect(state.waves[1].status).toBe('pending');
    expect(state.metrics.visitedCustomers).toBe(1);
    state.seats[1].status = 'empty';
    state = advanceD1BusinessDay(state, definition, 1);
    expect(state.waves[1].status).toBe('spawned');
    const party = ['D6-OFFICE-1', 'D6-SOLO-2'].map(id => state.seats.findIndex(seat => seat.customerId === id));
    expect(party[0]).toBeGreaterThanOrEqual(0);
    expect(party[1]).toBe(party[0] + 1);
  });

  it('마감까지 미도착한 손님은 이후 입장하지 않으며 도착 주문만 정리해 마감한다', async () => {
    const { port } = await start();
    port.advance(definition.sessionTargetMs);
    expect(port.runtime.getState().clock.arrivalsClosed).toBe(true);
    expect(port.runtime.getState().waves.slice(1).every(w => w.status === 'skipped-at-close')).toBe(true);
    acceptReady(port); serve(port, 'D6-ORDER-001');
    port.advance(16000); clean(port); port.advance(3000);
    expect(port.runtime.getState().phase).toBe('charcoal-down');
    expect(port.runtime.getState().metrics.visitedCustomers).toBe(1);
  });

  it('다른 회차·손상 snapshot은 현재 영업을 바꾸지 않고 거부한다', async () => {
    const { port } = await start();
    const before = port.runtime.getState();
    expect(port.runtime.restore({ ...before, runId: 'other' }).ok).toBe(false);
    expect(port.runtime.restore({ ...before, orders: null }).ok).toBe(false);
    expect(port.runtime.restore({ ...before, clock: { ...before.clock, elapsedMs: -1 } }).ok).toBe(false);
    expect(port.runtime.getState()).toEqual(before);
  });
});
