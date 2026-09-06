import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBusinessDayDefinition, createD1BusinessDayState, advanceD1BusinessDay, dispatchD1Command } from '../../src/campaign-runtime.js';

function pair(day) {
  const record = JSON.parse(readFileSync(new URL(`../../content/releases/${day}-business-day-domain.v1.json`, import.meta.url), 'utf8'));
  const wave = record.waves.find(wave => wave.customers.some(customer => customer.groupId));
  const definition = createBusinessDayDefinition({ ...record, waves: [{ ...wave, atMs: 0, requiresOrderCompletionIds: [] }] }, { expectedId: day });
  let state = advanceD1BusinessDay(createD1BusinessDayState({ definition, runId: 'shared-patience', seed: 3 }), definition, 6000);
  let seq = 0;
  const dispatch = (type, fields) => {
    const result = dispatchD1Command(state, definition, { type, eventId: `patience-${++seq}`, ...fields });
    expect(result.applied).toBe(true); state = result.state;
  };
  for (const order of Object.values(state.orders)) dispatch('accept-order', { orderId: order.id });
  state = advanceD1BusinessDay(state, definition, 20000);
  return { definition, get: () => state, dispatch };
}

describe('주문 소유 단위의 대기 회복', () => {
  it.each(['d2', 'd3'])('%s 공유 주문은 어느 좌석에 내도 동행 모두 회복한다', day => {
    const game = pair(day);
    const members = Object.values(game.get().customers);
    const before = members.map(customer => customer.waitRemainingMs);
    const order = Object.values(game.get().orders)[0];
    expect(order.customerIds).toHaveLength(2);
    const line = order.lines[0];
    game.dispatch('serve-item', { customerId: members[1].id, menuId: line.menuId, seasoning: line.seasoning, quality: 'Perfect' });
    expect(Object.values(game.get().customers).map(customer => customer.waitRemainingMs))
      .toEqual(before.map((remaining, index) => Math.min(members[index].patienceMs, remaining + 10000)));
  });
  it('D4 개별 주문은 동행의 다른 주문 인내심을 회복하지 않는다', () => {
    const game = pair('d4');
    const members = Object.values(game.get().customers);
    const otherBefore = members[1].waitRemainingMs;
    const order = game.get().orders[members[0].orderId];
    const line = order.lines[0];
    game.dispatch('serve-item', { customerId: members[0].id, menuId: line.menuId, seasoning: line.seasoning, quality: 'Perfect' });
    expect(game.get().customers[members[1].id].waitRemainingMs).toBe(otherBefore);
  });
});
