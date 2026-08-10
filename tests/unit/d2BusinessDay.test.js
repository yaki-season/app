import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  advanceD1BusinessDay,
  createBusinessDayDefinition,
  createD1BusinessDayState,
  dispatchD1Command,
  D1_QUALITY,
} from '../../src/campaign-runtime.js';

const record = JSON.parse(readFileSync(new URL(
  '../../content/releases/d2-business-day-domain.v1.json', import.meta.url,
), 'utf8'));

describe('D2 전체 영업 정의', () => {
  it('6명·5주문·10항목과 2인 공유 주문을 고정한다', () => {
    const definition = createBusinessDayDefinition(record, { expectedId: 'd2' });
    const customers = definition.waves.flatMap((wave) => wave.customers);
    const orders = new Map(customers.map((customer) => [customer.order.id, customer.order]));
    const items = [...orders.values()].reduce((sum, order) => (
      sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0)
    ), 0);
    expect(customers).toHaveLength(6);
    expect(orders.size).toBe(5);
    expect(items).toBe(10);
    expect(customers.filter((customer) => customer.order.id === 'D2-ORDER-002')).toHaveLength(2);
    expect(customers[0]).toMatchObject({ id: 'REGULAR_TSUKIOKA', typeId: 'regular' });
    expect(customers.find((customer) => customer.id === 'D2-COMMUTER-A')?.order.lines)
      .toEqual([{ menuId: 'negima', quantity: 1 }]);
    expect(definition.nextNodeId).toBe('d3');
  });

  it('13초 입장 정책에 따라 빈 가게에서 예정 시각을 기다리지 않는다', () => {
    const definition = createBusinessDayDefinition(record, { expectedId: 'd2' });
    expect(definition.arrivalPolicy).toEqual({
      maxAllSeatsEmptyWaitSec: 13,
      autoCloseAfterFinalCustomer: true,
    });
    const officeWave = definition.waves[1];
    expect(officeWave.atMs).toBe(100_000);

    let state = createD1BusinessDayState({ definition, runId: 'd2-arrival',seed: 3 });
    let sequence = 0;
    const dispatch = (type, fields) => {
      const result = dispatchD1Command(state, definition, { eventId: `d2:${sequence += 1}`, type, ...fields });
      if (result.state) state = result.state;
      return result;
    };

    // 첫 손님 주문만 끝내고 자리를 비운다.
    for (let tick = 0; tick < 60 && state.waves[1].status === 'pending'; tick += 1) {
      state = advanceD1BusinessDay(state, definition, 1_000);
      for (const order of Object.values(state.orders)) {
        if (order.status === 'unaccepted') dispatch('accept-order', { orderId: order.id });
      }
      for (const order of Object.values(state.orders)) {
        if (!['accepted', 'partial', 'group-pending'].includes(order.status)) continue;
        for (const line of order.lines) {
          const remaining = line.quantity - line.servedQualities.length;
          for (let index = 0; index < remaining; index += 1) {
            dispatch('serve-item', {
              customerId: order.customerIds[0],
              menuId: line.menuId,
              quality: D1_QUALITY.PERFECT,
            });
          }
        }
      }
    }

    expect(state.waves[1].status).toBe('spawned');
    expect(state.clock.elapsedMs).toBeLessThan(officeWave.atMs);
  });
});
