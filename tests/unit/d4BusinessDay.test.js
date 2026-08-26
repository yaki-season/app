import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  D1_QUALITY,
  advanceD1BusinessDay,
  createBusinessDayDefinition,
  createD1BusinessDayState,
  dispatchD1Command,
} from '../../src/campaign-runtime.js';

const record = JSON.parse(readFileSync(new URL(
  '../../content/releases/d4-business-day-domain.v1.json', import.meta.url,
), 'utf8'));
const definition = createBusinessDayDefinition(record, { expectedId: 'd4' });

describe('D4 전체 영업 정의와 무료 사라다 정책', () => {
  it('8명·8주문·19항목과 D5 영업 전이를 고정한다', () => {
    const customers = definition.waves.flatMap((wave) => wave.customers);
    const orders = new Map(customers.map((customer) => [customer.order.id, customer.order]));
    const items = [...orders.values()].reduce((sum, order) => (
      sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0)
    ), 0);
    expect(customers).toHaveLength(8);
    expect(orders.size).toBe(8);
    expect(items).toBe(19);
    expect(definition.nextNodeId).toBe('d5');
    expect(orders.get('D4-ORDER-008').lines[0]).toMatchObject({
      menuId: 'cabbage-salad', quantity: 2,
    });
  });

  it('사라다는 주문 완료에는 필요하지만 매출·품질·만족도 계산에서 제외한다', () => {
    let state = createD1BusinessDayState({ definition, runId: 'd4:test', seed: 7 });
    state = advanceD1BusinessDay(state, definition, 6_000);
    state = dispatchD1Command(state, definition, {
      eventId: 'accept:first', type: 'accept-order', orderId: 'D4-ORDER-001',
    }).state;
    state = advanceD1BusinessDay(state, definition, 5_000);

    const salad = dispatchD1Command(state, definition, {
      eventId: 'serve:salad',
      type: 'serve-item',
      customerId: 'REGULAR_TSUKIOKA',
      menuId: 'cabbage-salad',
      quality: null,
    });
    expect(salad).toMatchObject({ applied: true, partial: true, remaining: 1 });
    expect(salad.state.ledger).toEqual([]);
    expect(salad.state.metrics.quality).toEqual({ Perfect: 0, Good: 0, OK: 0, Fail: 0 });
    expect(salad.state.customers.REGULAR_TSUKIOKA.waitRemainingMs).toBe(100_000);

    const highball = dispatchD1Command(salad.state, definition, {
      eventId: 'serve:highball',
      type: 'serve-item',
      customerId: 'REGULAR_TSUKIOKA',
      menuId: 'highball',
      quality: D1_QUALITY.PERFECT,
    });
    expect(highball).toMatchObject({ applied: true, completedOrder: true });
    expect(highball.state.orders['D4-ORDER-001']).toMatchObject({
      status: 'completed', satisfaction: 100,
    });
    expect(highball.state.ledger).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'sale', menuId: 'highball', amount: 7 }),
      expect.objectContaining({ type: 'tip', amount: 2 }),
    ]));
  });

  it('무료 메뉴 단독 주문 정의를 거부한다', () => {
    const invalid = structuredClone(record);
    invalid.waves[0].customers[0].order.lines = [
      { menuId: 'cabbage-salad', quantity: 1, seasoning: 'none' },
    ];
    expect(() => createBusinessDayDefinition(invalid, { expectedId: 'd4' }))
      .toThrow(/단독 주문/);
  });
});
