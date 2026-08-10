import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  D1_CUSTOMER_PHASE,
  D1_DAY_PHASE,
  D1_ORDER_STATUS,
  D1_QUALITY,
  D1_SETTLEMENT_STEPS,
  advanceD1BusinessDay,
  createBusinessDayDefinition,
  createD1BusinessDayDefinition,
  createD1BusinessDayState,
  dispatchD1Command,
  summarizeD1Settlement,
  validateD1BusinessDayState,
} from '../../src/campaign-runtime.js';

const fixture = JSON.parse(readFileSync(fileURLToPath(
  new URL('../fixtures/business-days/d1-full-day.json', import.meta.url),
), 'utf8'));
const definition = createD1BusinessDayDefinition(fixture);

it('날짜 공통 정의 검증은 D2 id와 다른 첫 주문을 허용한다', () => {
  const d2 = structuredClone(fixture);
  d2.id = 'd2';
  d2.waves[0].customers[0].id = 'D2-CUSTOMER-001';
  d2.waves[0].customers[0].order.id = 'D2-ORDER-001';
  d2.waves.slice(1).forEach((wave) => {
    wave.requiresOrderCompletionIds = [];
  });
  expect(createBusinessDayDefinition(d2, { expectedId: 'd2' }).id).toBe('d2');
});

it('같은 그룹의 두 손님은 D2 공유 주문 한 건을 함께 사용한다', () => {
  const d2 = structuredClone(fixture);
  d2.id = 'd2';
  const pair = structuredClone(d2.waves[1]);
  pair.atMs = 0;
  pair.requiresOrderCompletionIds = [];
  pair.customers[1].order = structuredClone(pair.customers[0].order);
  d2.waves = [pair];
  const sharedDefinition = createBusinessDayDefinition(d2, { expectedId: 'd2' });
  let state = createD1BusinessDayState({ definition: sharedDefinition, runId: 'shared:d2', seed: 1 });
  state = advanceD1BusinessDay(state, sharedDefinition, 6_000);
  expect(Object.keys(state.orders)).toHaveLength(1);
  const [order] = Object.values(state.orders);
  expect(order.customerIds).toEqual(['D1-OFFICE-A', 'D1-OFFICE-B']);
  state = dispatchD1Command(state, sharedDefinition, {
    eventId: 'accept:shared', type: 'accept-order', orderId: order.id,
  }).state;
  expect(pair.customers.map(({ id }) => state.customers[id].phase)).toEqual([
    D1_CUSTOMER_PHASE.WAITING,
    D1_CUSTOMER_PHASE.WAITING,
  ]);
});

function initialState(seed = 7) {
  return createD1BusinessDayState({ definition, runId: 'campaign-test:d1', seed });
}

function advance(state, deltaMs) {
  return advanceD1BusinessDay(state, definition, deltaMs);
}

function command(state, eventId, type, fields = {}) {
  return dispatchD1Command(state, definition, { eventId, type, ...fields });
}

function accept(state, orderId) {
  return command(state, `accept:${orderId}`, 'accept-order', { orderId }).state;
}

function serve(state, customerId, menuId, index, quality = D1_QUALITY.PERFECT) {
  return command(state, `serve:${customerId}:${menuId}:${index}`, 'serve-item', {
    customerId,
    menuId,
    quality,
  }).state;
}

function cleanOccupiedSeats(state, prefix) {
  let next = state;
  const cleanupSeats = next.seats.filter((seat) => seat.status === 'cleanup');
  for (const seat of cleanupSeats) {
    next = command(next, `${prefix}:begin:${seat.id}`, 'begin-cleanup', { seatId: seat.id }).state;
  }
  return advance(next, 3_000);
}

function completeTsukioka(state) {
  let next = advance(state, 6_000);
  next = accept(next, 'D1-ORDER-001');
  next = serve(next, 'REGULAR_TSUKIOKA', 'beer', 1);
  next = serve(next, 'REGULAR_TSUKIOKA', 'negima', 1);
  return serve(next, 'REGULAR_TSUKIOKA', 'negima', 2);
}

function completeOfficePair(state) {
  let next = advance(state, 6_000);
  next = accept(next, 'D1-ORDER-002-A');
  next = accept(next, 'D1-ORDER-002-B');
  next = serve(next, 'D1-OFFICE-A', 'beer', 1);
  next = serve(next, 'D1-OFFICE-A', 'negima', 1);
  next = serve(next, 'D1-OFFICE-B', 'beer', 1);
  return serve(next, 'D1-OFFICE-B', 'negima', 1);
}

function completeSolo(state) {
  let next = advance(state, 6_000);
  next = accept(next, 'D1-ORDER-003');
  return serve(next, 'D1-SOLO-A', 'negima', 1);
}

function advanceTo(state, elapsedMs) {
  return advance(state, Math.max(0, elapsedMs - state.clock.elapsedMs));
}

describe('D1 전체 영업일 도메인', () => {
  it('17:30~02:30·13초·마지막 손님 자동 마감 정책 변조를 기동 전에 거부한다', () => {
    const wrongWindow = structuredClone(fixture);
    wrongWindow.businessWindow.endMinute = 1410;
    expect(() => createD1BusinessDayDefinition(wrongWindow)).toThrow(/17:30~02:30/);

    const wrongArrival = structuredClone(fixture);
    wrongArrival.arrivalPolicy.maxAllSeatsEmptyWaitSec = 14;
    expect(() => createD1BusinessDayDefinition(wrongArrival)).toThrow(/13초/);
  });

  it('D1 4명·4주문·8항목을 7분 목표 안에서 마감하고 정산 5단계를 만든다', () => {
    let state = completeTsukioka(initialState());
    state = advance(state, 16_000);
    state = cleanOccupiedSeats(state, 'tsukioka');

    state = advanceTo(state, 100_000);
    expect(state.waves[1].status).toBe('spawned');
    state = completeOfficePair(state);
    state = advance(state, 16_000);
    state = cleanOccupiedSeats(state, 'office');

    state = advanceTo(state, 220_000);
    expect(state.waves[2].status).toBe('spawned');
    state = completeSolo(state);
    state = advance(state, 16_000);
    state = cleanOccupiedSeats(state, 'solo');

    state = advanceTo(state, 420_000);
    expect(state.phase).toBe(D1_DAY_PHASE.CHARCOAL_DOWN);
    expect(state.clock).toMatchObject({
      elapsedMs: 245_000,
      gameMinute: 1365,
      arrivalsClosed: true,
    });

    state = command(state, 'charcoal-down', 'lower-charcoal', {
      disposedPreparedItems: 2,
    }).state;
    expect(state.phase).toBe(D1_DAY_PHASE.SETTLEMENT);
    expect(state.settlement.summary).toMatchObject({
      customers: { visited: 4, lost: 0, cleanedSeats: 4 },
      orders: { accepted: 4, completed: 4, abandoned: 0 },
      quality: { Perfect: 8, Good: 0, OK: 0, Fail: 0 },
      economy: { revenue: 33, tip: 8, total: 41, reputation: 12 },
      operations: {
        peakActiveOrders: 2,
        peakRiskProcesses: 0,
        disposedPreparedItems: 2,
        elapsedMs: 245_000,
      },
    });

    for (let index = 0; index < D1_SETTLEMENT_STEPS.length; index += 1) {
      state = command(state, `settlement:${index}`, 'reveal-settlement-step').state;
    }
    expect(state.settlement).toMatchObject({
      revealedSteps: D1_SETTLEMENT_STEPS,
      ready: true,
    });
    expect(validateD1BusinessDayState(state, definition)).toEqual({ valid: true, errors: [] });
  });

  it('앞 손님이 자리를 뜨면 예정 시각을 기다리지 않고 다음 손님이 들어온다', () => {
    // 자리가 남아 있는데도 예정 시각(atMs)까지 아무도 오지 않아 가게가 멈춰 보이던 문제.
    let state = advance(initialState(), 6_000);
    expect(state.clock.allSeatsEmptySinceMs).not.toBeNull(); // 다섯 자리가 비어 있다

    // 다만 첫 손님은 좌석이 아니라 화면 가운데 전용 구도로 그려진다. 식사 중에 다음 무리를
    // 들이면 그림이 겹치므로, 주문을 다 받았어도 자리에 있는 동안은 오지 않는다.
    state = completeTsukioka(state);
    state = advance(state, 1_000);
    expect(state.customers.REGULAR_TSUKIOKA.phase).toBe(D1_CUSTOMER_PHASE.EATING);
    expect(state.waves[1].status).toBe('pending');

    // 자리에서 일어나면 곧바로 들어온다. 예정 시각은 100초인데 그보다 훨씬 이르다.
    state = advance(state, 15_000);
    expect(state.waves[1].status).toBe('spawned');
    expect(state.clock.elapsedMs).toBeLessThan(100_000);
  });

  it('D1 첫 주문은 네기마 선제공을 허용하고 중복·수량 초과만 차단한다', () => {
    let state = advance(initialState(), 6_000);
    state = accept(state, 'D1-ORDER-001');
    const first = command(state, 'serve:first-negima-first', 'serve-item', {
      customerId: 'REGULAR_TSUKIOKA',
      menuId: 'negima',
      quality: D1_QUALITY.PERFECT,
    });
    const duplicate = command(first.state, 'serve:first-negima-first', 'serve-item', {
      customerId: 'REGULAR_TSUKIOKA',
      menuId: 'negima',
      quality: D1_QUALITY.PERFECT,
    });
    expect(first).toMatchObject({ applied: true, partial: true, remaining: 2 });
    expect(duplicate).toMatchObject({ applied: false, duplicate: true });
    expect(duplicate.state.metrics.servedItems).toBe(1);
    expect(duplicate.state.ledger).toHaveLength(1);

    state = serve(duplicate.state, 'REGULAR_TSUKIOKA', 'negima', 2);
    const excess = command(state, 'serve:negima:excess', 'serve-item', {
      customerId: 'REGULAR_TSUKIOKA',
      menuId: 'negima',
      quality: D1_QUALITY.PERFECT,
    });
    expect(excess).toMatchObject({ applied: false, reason: 'menu-mismatch' });
  });

  it('먼저 주문한 손님과 무관하게 선택한 늦은 손님의 미제공 line에 먼저 제공한다', () => {
    let state = completeTsukioka(initialState());
    state = advance(state, 16_000);
    state = cleanOccupiedSeats(state, 'late-customer');
    state = advanceTo(state, 100_000);
    state = advance(state, 6_000);
    state = accept(state, 'D1-ORDER-002-A');
    state = accept(state, 'D1-ORDER-002-B');

    const servedLateCustomer = command(state, 'serve:late-customer-first', 'serve-item', {
      customerId: 'D1-OFFICE-B',
      menuId: 'negima',
      quality: D1_QUALITY.PERFECT,
    });
    expect(servedLateCustomer).toMatchObject({ applied: true, partial: true, remaining: 1 });
    expect(servedLateCustomer.state.orders['D1-ORDER-002-A'].lines)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ servedQualities: [] }),
      ]));
    expect(servedLateCustomer.state.orders['D1-ORDER-002-B'].lines
      .find((line) => line.menuId === 'negima').servedQualities).toEqual([D1_QUALITY.PERFECT]);
  });

  it('존재하지 않는 손님과 선택한 손님의 주문에 없는 메뉴는 계속 거부한다', () => {
    let state = advance(initialState(), 6_000);
    state = accept(state, 'D1-ORDER-001');
    expect(command(state, 'serve:unknown-customer', 'serve-item', {
      customerId: 'D1-NOT-A-CUSTOMER',
      menuId: 'negima',
      quality: D1_QUALITY.PERFECT,
    })).toMatchObject({ applied: false, reason: 'customer-not-found' });
    expect(command(state, 'serve:wrong-menu', 'serve-item', {
      customerId: 'REGULAR_TSUKIOKA',
      menuId: 'kawa',
      quality: D1_QUALITY.PERFECT,
    })).toMatchObject({ applied: false, reason: 'menu-mismatch' });
  });

  it('정리 중인 좌석은 3초 완료 전 재배정하지 않고 완료 이벤트도 한 번만 집계한다', () => {
    let state = completeTsukioka(initialState());
    state = advance(state, 16_000);
    const dirtySeat = state.customers.REGULAR_TSUKIOKA.seatId;
    expect(state.seats.find((seat) => seat.id === dirtySeat).status).toBe('cleanup');

    state = advanceTo(state, 100_000);
    const officeSeats = ['D1-OFFICE-A', 'D1-OFFICE-B']
      .map((id) => state.customers[id].seatId);
    expect(officeSeats).not.toContain(dirtySeat);

    const started = command(state, 'cleanup:start-once', 'begin-cleanup', { seatId: dirtySeat });
    const duplicate = command(started.state, 'cleanup:start-once', 'begin-cleanup', { seatId: dirtySeat });
    state = advance(duplicate.state, 2_999);
    expect(state.seats.find((seat) => seat.id === dirtySeat).status).toBe('cleanup');
    state = advance(state, 1);
    expect(state.seats.find((seat) => seat.id === dirtySeat).status).toBe('empty');
    expect(state.metrics.cleanedSeats).toBe(1);
    state = advance(state, 10_000);
    expect(state.metrics.cleanedSeats).toBe(1);
  });

  it('정리 홀드를 취소하면 진행률을 0으로 되돌린다', () => {
    let state = completeTsukioka(initialState());
    state = advance(state, 16_000);
    const seatId = state.customers.REGULAR_TSUKIOKA.seatId;
    state = command(state, 'cleanup:start', 'begin-cleanup', { seatId }).state;
    state = advance(state, 2_000);
    state = command(state, 'cleanup:cancel', 'cancel-cleanup', { seatId }).state;
    expect(state.seats.find((seat) => seat.id === seatId).cleanup)
      .toMatchObject({ active: false, progressMs: 0 });
    state = advance(state, 5_000);
    expect(state.seats.find((seat) => seat.id === seatId).status).toBe('cleanup');
  });

  it('2인 그룹 한 명의 Fail이 동행 전체를 내보내고 명성을 한 번만 차감한다', () => {
    let state = completeTsukioka(initialState());
    state = advance(state, 16_000);
    state = cleanOccupiedSeats(state, 'first');
    state = advanceTo(state, 100_000);
    state = advance(state, 6_000);
    state = accept(state, 'D1-ORDER-002-A');
    state = accept(state, 'D1-ORDER-002-B');
    state = serve(state, 'D1-OFFICE-A', 'beer', 1);
    state = serve(state, 'D1-OFFICE-A', 'negima', 1);
    expect(state.orders['D1-ORDER-002-A'].status).toBe(D1_ORDER_STATUS.GROUP_PENDING);

    const failed = command(state, 'serve:office-b:fail', 'serve-item', {
      customerId: 'D1-OFFICE-B',
      menuId: 'beer',
      quality: D1_QUALITY.FAIL,
    });
    state = failed.state;
    expect(failed.left).toBe(true);
    expect(state.customers['D1-OFFICE-A'].phase).toBe(D1_CUSTOMER_PHASE.LEAVING);
    expect(state.customers['D1-OFFICE-B'].phase).toBe(D1_CUSTOMER_PHASE.LEAVING);
    expect(state.orders['D1-ORDER-002-A'].status).toBe(D1_ORDER_STATUS.FAILED);
    expect(state.orders['D1-ORDER-002-B'].status).toBe(D1_ORDER_STATUS.FAILED);
    expect(state.ledger.filter((entry) => entry.type === 'tip')).toHaveLength(1);
    expect(state.ledger.filter((entry) => entry.type === 'reputation' && entry.amount === -1))
      .toHaveLength(1);
  });

  it('일시정지 중 시간·대기·정리가 진행하지 않고 위험 공정 상한을 강제한다', () => {
    let state = advance(initialState(), 6_000);
    state = accept(state, 'D1-ORDER-001');
    const before = structuredClone(state);
    state = command(state, 'pause', 'pause').state;
    state = advance(state, 50_000);
    expect(state.clock.elapsedMs).toBe(before.clock.elapsedMs);
    expect(state.customers.REGULAR_TSUKIOKA.waitRemainingMs)
      .toBe(before.customers.REGULAR_TSUKIOKA.waitRemainingMs);
    state = command(state, 'resume', 'resume').state;

    const validRisk = command(state, 'risk:1', 'set-risk-count', { count: 1 });
    expect(validRisk.applied).toBe(true);
    const overCap = command(validRisk.state, 'risk:2', 'set-risk-count', { count: 2 });
    expect(overCap).toMatchObject({
      applied: false,
      reason: 'risk-cap-exceeded',
      maxRiskProcesses: 1,
    });
  });

  it('동일 상태·시드는 손님 좌석과 고민 시간을 결정적으로 만든다', () => {
    const first = initialState(1234);
    const second = initialState(1234);
    expect(first).toEqual(second);
    expect(summarizeD1Settlement(first)).toEqual(summarizeD1Settlement(second));
  });
});
