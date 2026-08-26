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

  it('조립대에서 소금·타레를 나누고 타레를 한 번 칠한 뒤 그릴 재고로 보낸다', () => {
    expect(definition.stationProcesses.assembly.items.kawa).toMatchObject({
      ingredientId: 'foldedChickenSkin',
      ingredientCount: 5,
      seasoningPolicy: {
        selectionStage: 'assembly',
        options: ['salt', 'tare'],
        saltTransferMode: 'direct',
        inventoryPartition: 'menu-and-seasoning',
        tareApplication: {
          station: 'assembly',
          afterAssemblyCompleted: true,
          brushPasses: 1,
          minimumCoverage: 0.8,
          torchEnabled: false,
        },
      },
    });
    expect(definition.stationProcesses.grill.items.kawa).toMatchObject({
      faceThresholdsSec: { under: 0, perfect: 10, over: 14, burnt: 18 },
      inventorySelection: {
        groupBy: 'menu',
        columns: ['salt', 'tare'],
      },
    });
    expect(definition.stationProcesses.assembly.items.kawa.seasoningPolicy.tareApplication).toEqual({
      station: 'assembly',
      afterAssemblyCompleted: true,
      brushPasses: 1,
      minimumCoverage: 0.8,
      torchEnabled: false,
    });
    expect(definition.stationProcesses.grill.items.kawa).not.toHaveProperty('seasoningOptions');
    expect(definition.stationProcesses.grill.items.kawa).not.toHaveProperty('seasoningSelectionStage');
    expect(definition.stationProcesses.grill.items.kawa).not.toHaveProperty('tareFinish');
    expect(definition.stationProcesses.grill.items.kawa).not.toHaveProperty('tareFinishCycles');
    expect(definition.stationProcesses.grill.items.kawa).not.toHaveProperty('torchOptional');
  });

  it('그릴은 소금·타레 재고를 같은 메뉴 행의 두 열로 고르고 굽기만 한다', () => {
    expect(definition.stationProcesses.grill.items.kawa).toMatchObject({
      bothFacesRequired: true,
      fullyBurntPolicy: 'discard',
      inventorySelection: {
        groupBy: 'menu',
        columns: ['salt', 'tare'],
      },
    });
  });

  it('D6를 열지 않고 D5 완료 기록만 보상한다', () => {
    expect(definition.campaignReward).toEqual({
      unlockIds: ['day-d5-completed'],
      storyFlagIds: ['d5-complete', 'torikawa-introduced'],
    });
  });
});
