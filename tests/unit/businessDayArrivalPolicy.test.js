import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  D1_QUALITY,
  advanceD1BusinessDay,
  createBusinessDayDefinition,
  createD1BusinessDayState,
  dispatchD1Command,
} from '../../src/campaign-runtime.js';

const readRelease = (dayId) => JSON.parse(readFileSync(new URL(
  `../../content/releases/${dayId}-business-day-domain.v1.json`,
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
