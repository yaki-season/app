import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBusinessDayDefinition } from '../../src/domain/businessDay/d1BusinessDay.js';

const record = JSON.parse(readFileSync(new URL(
  '../../content/releases/d5-business-day-domain.v1.json', import.meta.url,
), 'utf8'));
const definition = createBusinessDayDefinition(record, { expectedId: 'd5' });

describe('D5 토리카와 영업 정의', () => {
  it('9명·9주문·20개와 D5 완료 전이를 고정한다', () => {
    const customers = definition.waves.flatMap((wave) => wave.customers);
    const orders = new Map(customers.map((customer) => [customer.order.id, customer.order]));
    const quantity = [...orders.values()].reduce((sum, order) => (
      sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0)
    ), 0);
    expect(customers).toHaveLength(9);
    expect(orders.size).toBe(9);
    expect(quantity).toBe(20);
    expect(definition.nextNodeId).toBe('d5-complete');
    expect(definition.economy.menuPrices.kawa).toBe(5);
  });

  it('접은 닭껍질 5조각과 10~14초 적정·18초 탄 판정을 정본으로 둔다', () => {
    expect(definition.stationProcesses.assembly.items.kawa).toMatchObject({
      ingredientId: 'foldedChickenSkin',
      ingredientCount: 5,
      seasonings: ['salt', 'tare'],
    });
    expect(definition.stationProcesses.grill.items.kawa).toMatchObject({
      faceThresholdsSec: { under: 0, perfect: 10, over: 14, burnt: 18 },
      tareFinishCycles: 2,
      torchOptional: true,
    });
  });

  it('D6를 열지 않고 D5 완료 기록만 보상한다', () => {
    expect(definition.campaignReward).toEqual({
      unlockIds: ['day-d5-completed'],
      storyFlagIds: ['d5-complete', 'torikawa-introduced'],
    });
  });
});
