import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  D1_ORDER_STATUS,
  D1_QUALITY,
  advanceD1BusinessDay,
  createBusinessDayDefinition,
  createD1BusinessDayState,
  dispatchD1Command,
} from '../../src/campaign-runtime.js';

const readRelease = (dayId) => JSON.parse(readFileSync(new URL(
  `../../content/releases/${dayId}-business-day-${dayId === 'd1' ? 'definition' : 'domain'}.v1.json`,
  import.meta.url,
), 'utf8'));

function dispatch(state, definition, eventId, type, fields = {}) {
  return dispatchD1Command(state, definition, { eventId, type, ...fields }).state;
}

function completeFirstCustomer(definition) {
  const customer = definition.waves[0].customers[0];
  let state = createD1BusinessDayState({
    definition,
    runId: `arrival-policy:${definition.id}`,
    seed: 1,
  });
  state = advanceD1BusinessDay(state, definition, definition.timingMs.thinkMax);
  state = dispatch(state, definition, `${definition.id}:accept`, 'accept-order', {
    orderId: customer.order.id,
  });
  for (const line of customer.order.lines) {
    for (let index = 0; index < line.quantity; index += 1) {
      state = dispatch(state, definition, `${definition.id}:serve:${line.menuId}:${index}`, 'serve-item', {
        customerId: customer.id,
        menuId: line.menuId,
        quality: D1_QUALITY.PERFECT,
      });
    }
  }
  state = advanceD1BusinessDay(
    state,
    definition,
    definition.timingMs.eat + definition.timingMs.leave,
  );
  return state;
}

describe.each(['d2', 'd3'])('%s 빈 가게 입장 상한', (dayId) => {
  const record = readRelease(dayId);

  it('정책 누락이나 13초 이외의 값을 런타임 로딩 전에 거부한다', () => {
    const missing = structuredClone(record);
    delete missing.arrivalPolicy;
    expect(() => createBusinessDayDefinition(missing, { expectedId: dayId })).toThrow(/모든 영업일/);

    const drifted = structuredClone(record);
    drifted.arrivalPolicy.maxAllSeatsEmptyWaitSec = 14;
    expect(() => createBusinessDayDefinition(drifted, { expectedId: dayId })).toThrow(/13초/);
  });

  it('마지막 손님 퇴장 뒤 좌석 정리를 기다리지 않고 다음 파동을 13초에 당긴다', () => {
    const definition = createBusinessDayDefinition(record, { expectedId: dayId });
    let state = completeFirstCustomer(definition);
    const emptySinceMs = state.clock.allSeatsEmptySinceMs;
    expect(emptySinceMs).not.toBeNull();
    expect(state.waves[1].status).toBe('pending');

    state = advanceD1BusinessDay(state, definition, 12_999);
    expect(state.waves[1].status).toBe('pending');
    state = advanceD1BusinessDay(state, definition, 1);
    expect(state.waves[1].status).toBe('spawned');
    expect(state.clock.elapsedMs - emptySinceMs).toBe(13_000);
  });
});

describe.each(['d1', 'd2', 'd3', 'd4', 'd5'])('%s 실패 주문 이후 입장', (dayId) => {
  it('첫 손님이 화나서 이탈해도 다음 손님을 계속 입장시킨다', () => {
    const record = readRelease(dayId);
    if (dayId === 'd1') record.id = 'd1';
    const definition = createBusinessDayDefinition(record, { expectedId: dayId });
    const firstCustomer = definition.waves[0].customers[0];
    let state = createD1BusinessDayState({
      definition,
      runId: `arrival-after-abandonment:${dayId}`,
      seed: 1,
    });

    state = advanceD1BusinessDay(state, definition, definition.timingMs.thinkMax);
    state = dispatch(state, definition, `${dayId}:accept-to-abandon`, 'accept-order', {
      orderId: firstCustomer.order.id,
    });
    state = advanceD1BusinessDay(
      state,
      definition,
      firstCustomer.patienceMs + definition.timingMs.leave + 13_000,
    );

    expect(state.orders[firstCustomer.order.id].status).toBe(D1_ORDER_STATUS.ABANDONED);
    expect(state.waves[1].status).toBe('spawned');
    expect(state.metrics.visitedCustomers).toBeGreaterThan(firstCustomer.groupId ? 2 : 1);
  });

  it('Fail 품질로 즉시 화나서 떠나도 다음 손님을 계속 입장시킨다', () => {
    const record = readRelease(dayId);
    if (dayId === 'd1') record.id = 'd1';
    const definition = createBusinessDayDefinition(record, { expectedId: dayId });
    const firstCustomer = definition.waves[0].customers[0];
    const failLine = firstCustomer.order.lines.find((line) => (
      definition.menuPolicies?.[line.menuId]?.qualityMode !== 'none'
    ));
    let state = createD1BusinessDayState({
      definition,
      runId: `arrival-after-fail-quality:${dayId}`,
      seed: 1,
    });

    state = advanceD1BusinessDay(state, definition, definition.timingMs.thinkMax);
    state = dispatch(state, definition, `${dayId}:accept-to-fail`, 'accept-order', {
      orderId: firstCustomer.order.id,
    });
    state = dispatch(state, definition, `${dayId}:serve-fail`, 'serve-item', {
      customerId: firstCustomer.id,
      menuId: failLine.menuId,
      seasoning: failLine.seasoning ?? null,
      quality: D1_QUALITY.FAIL,
    });
    state = advanceD1BusinessDay(
      state,
      definition,
      definition.timingMs.leave + 13_000,
    );

    expect(state.orders[firstCustomer.order.id].status).toBe(D1_ORDER_STATUS.FAILED);
    expect(state.waves[1].status).toBe('spawned');
  });
});

it('같은 파동의 개별 손님은 동시에 입장하지 않고 4초 간격을 둔다', () => {
  const record = readRelease('d2');
  const firstWave = structuredClone(record.waves[0]);
  const soloWave = structuredClone(record.waves.find((wave) => wave.id === 'd2-review-flow'));
  soloWave.atMs = 0;
  soloWave.requiresOrderCompletionIds = [firstWave.customers[0].order.id];
  record.waves = [firstWave, soloWave];
  const definition = createBusinessDayDefinition(record, { expectedId: 'd2' });

  let state = createD1BusinessDayState({
    definition,
    runId: 'individual-arrival-gap:d2',
    seed: 1,
  });
  state = advanceD1BusinessDay(state, definition, definition.timingMs.thinkMax);
  state = dispatch(state, definition, 'individual-gap:accept', 'accept-order', {
    orderId: firstWave.customers[0].order.id,
  });
  for (const line of firstWave.customers[0].order.lines) {
    for (let index = 0; index < line.quantity; index += 1) {
      state = dispatch(state, definition, `individual-gap:serve:${line.menuId}:${index}`, 'serve-item', {
        customerId: firstWave.customers[0].id,
        menuId: line.menuId,
        quality: D1_QUALITY.PERFECT,
      });
    }
  }
  state = advanceD1BusinessDay(state, definition, definition.timingMs.eat);

  expect(state.metrics.visitedCustomers).toBe(2);
  expect(state.waves[1].status).toBe('pending');
  expect(state.customers[soloWave.customers[0].id]).toBeDefined();
  expect(state.customers[soloWave.customers[1].id]).toBeUndefined();

  state = advanceD1BusinessDay(state, definition, 3_999);
  expect(state.metrics.visitedCustomers).toBe(2);
  state = advanceD1BusinessDay(state, definition, 1);
  expect(state.metrics.visitedCustomers).toBe(3);
  expect(state.waves[1].status).toBe('spawned');
});

it('같은 그룹의 두 손님은 4초 간격을 적용하지 않고 함께 입장한다', () => {
  const record = readRelease('d2');
  const groupWave = structuredClone(record.waves.find((wave) => wave.id === 'd2-office-pair'));
  groupWave.atMs = 0;
  groupWave.requiresOrderCompletionIds = [];
  record.waves = [groupWave];
  const definition = createBusinessDayDefinition(record, { expectedId: 'd2' });

  const state = createD1BusinessDayState({
    definition,
    runId: 'group-arrival-is-atomic:d2',
    seed: 1,
  });

  expect(state.metrics.visitedCustomers).toBe(2);
  expect(state.waves[0].status).toBe('spawned');
  expect(Object.keys(state.customers)).toEqual(['D2-OFFICE-A', 'D2-OFFICE-B']);
});

it('첫 파동 자체가 개별 손님 둘이어도 두 번째 손님을 4초 뒤 입장시킨다', () => {
  const record = readRelease('d2');
  const soloWave = structuredClone(record.waves.find((wave) => wave.id === 'd2-review-flow'));
  soloWave.atMs = 0;
  soloWave.requiresOrderCompletionIds = [];
  record.waves = [soloWave];
  const definition = createBusinessDayDefinition(record, { expectedId: 'd2' });

  let state = createD1BusinessDayState({ definition, runId: 'first-wave-solo-gap:d2', seed: 1 });
  expect(state.metrics.visitedCustomers).toBe(1);
  expect(state.waves[0]).toMatchObject({ status: 'pending', nextCustomerIndex: 1 });
  state = advanceD1BusinessDay(state, definition, 3_999);
  expect(state.metrics.visitedCustomers).toBe(1);
  state = advanceD1BusinessDay(state, definition, 1);
  expect(state.metrics.visitedCustomers).toBe(2);
  expect(state.waves[0].status).toBe('spawned');
});

it('그룹과 개인을 한 파동에 섞거나 개인 입장 간격이 마감을 넘는 정의를 거부한다', () => {
  const mixed = readRelease('d2');
  const groupWave = structuredClone(mixed.waves.find((wave) => wave.id === 'd2-office-pair'));
  delete groupWave.customers[1].groupId;
  groupWave.atMs = 0;
  groupWave.requiresOrderCompletionIds = [];
  mixed.waves = [groupWave];
  expect(() => createBusinessDayDefinition(mixed, { expectedId: 'd2' })).toThrow(/그룹 전체 또는 개별 손님/);

  const tooLate = readRelease('d2');
  const soloWave = structuredClone(tooLate.waves.find((wave) => wave.id === 'd2-review-flow'));
  soloWave.atMs = tooLate.sessionTargetMs - 1;
  soloWave.requiresOrderCompletionIds = [];
  tooLate.waves = [soloWave];
  expect(() => createBusinessDayDefinition(tooLate, { expectedId: 'd2' })).toThrow(/입장할 시간이 부족/);
});
