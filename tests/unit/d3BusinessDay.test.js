import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBusinessDayDefinition } from '../../src/campaign-runtime.js';

const record = JSON.parse(readFileSync(new URL(
  '../../content/releases/d3-business-day-domain.v1.json', import.meta.url,
), 'utf8'));

describe('D3 전체 영업 정의', () => {
  it('8명·7주문·16항목과 첫 타레 모모 주문을 고정한다', () => {
    const definition = createBusinessDayDefinition(record, { expectedId: 'd3' });
    const customers = definition.waves.flatMap((wave) => wave.customers);
    const orders = new Map(customers.map((customer) => [customer.order.id, customer.order]));
    const items = [...orders.values()].reduce((sum, order) => (
      sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0)
    ), 0);
    expect(customers).toHaveLength(8);
    expect(orders.size).toBe(7);
    expect(items).toBe(16);
    expect(orders.get('D3-ORDER-001').lines[0]).toMatchObject({ menuId: 'momo', seasoning: 'tare' });
    expect(definition.nextNodeId).toBe('d4-preview');
  });
});
