import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBusinessDayDefinition } from '../../src/campaign-runtime.js';

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
    expect(definition.nextNodeId).toBe('d3');
  });
});
