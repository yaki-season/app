import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkContentRules } from '../../src/content/rules.js';
import {
  buildEarlyCampaignDayContract,
  simulateEarlyCampaignPlan,
} from '../../src/content/earlyCampaign.js';

const root = new URL('../../', import.meta.url);
const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, root)), 'utf8'));

function bundle() {
  return {
    menus: read('content/menus/early-campaign.json'),
    customers: read('content/customers/types.json'),
    campaignCharacters: read('content/campaign/characters.json'),
    orders: read('content/orders/early-campaign.json'),
    days: [
      read('content/campaign/day-d1.json'),
      read('content/campaign/day-d2.json'),
      read('content/campaign/day-d3.json'),
    ],
    scenarios: read('content/campaign/scenario.json'),
  };
}

describe('Developer 3 S0~D3 stable data contract', () => {
  it('S0→D1→D2→D3→D4-preview chain과 읽기 전용 preview를 검증한다', () => {
    const content = bundle();
    expect(checkContentRules(content)).toEqual({ valid: true, errors: [] });
    expect(content.scenarios.map(({ id, nextDay }) => [id, nextDay])).toEqual([
      ['s0', 'd1'],
      ['d1', 'd2'],
      ['d2', 'd3'],
      ['d3', 'd4-preview'],
      ['d4-preview', null],
    ]);
    expect(content.scenarios.at(-1)).toMatchObject({
      kind: 'preview',
      readOnly: true,
      gameplayCommandIds: [],
      economyCommandIds: [],
      reward: null,
    });
  });

  it('S0는 무실패 3단계이며 고정 인물은 아키와 츠키오카뿐이다', () => {
    const content = bundle();
    const s0 = content.scenarios[0];
    expect(s0.interactions.map(({ id }) => id)).toEqual([
      'S0-KEY-SELECT',
      'S0-GATE-OPEN',
      'S0-CHARCOAL-IGNITE',
    ]);
    expect(s0.interactions.every(({ failurePolicy }) => failurePolicy === 'no-failure')).toBe(true);
    expect(content.campaignCharacters.map(({ id }) => id)).toEqual(['CHAR-AKI', 'CHAR-TSUKIOKA']);
    expect(content.orders.filter(({ source }) => source.kind === 'extra-type')
      .every(({ runtimeCustomerId }) => runtimeCustomerId === null)).toBe(true);
  });

  it('D1~D3 계획은 같은 데이터에서 결정적인 손님·주문·항목·상한을 만든다', () => {
    const content = bundle();
    expect(['d1', 'd2', 'd3'].map((dayId) => simulateEarlyCampaignPlan(content, dayId)))
      .toMatchObject([
        { dayId: 'd1', nextNodeId: 'd2', customers: 4, orders: 4, items: 8, peakActiveOrders: 2, peakRiskProcesses: 1 },
        { dayId: 'd2', nextNodeId: 'd3', customers: 6, orders: 5, items: 10, peakActiveOrders: 2, peakRiskProcesses: 2 },
        { dayId: 'd3', nextNodeId: 'd4-preview', customers: 8, orders: 7, items: 16, peakActiveOrders: 2, peakRiskProcesses: 2 },
      ]);
    expect(simulateEarlyCampaignPlan(content, 'd3')).toEqual(simulateEarlyCampaignPlan(content, 'd3'));
  });

  it('D1 고정 주문, D2 도움 감소, D3 타레 신규 행동을 stable ID로 제공한다', () => {
    const content = bundle();
    expect(content.orders.find(({ id }) => id === 'D1-ORDER-001')).toMatchObject({
      runtimeCustomerId: 'REGULAR_TSUKIOKA',
      source: { kind: 'fixed-character', characterId: 'CHAR-TSUKIOKA' },
      items: [
        { menuId: 'beer', quantity: 1 },
        { menuId: 'negima', quantity: 2 },
      ],
    });
    expect(buildEarlyCampaignDayContract(content, 'd2').tutorial).toMatchObject({
      newActionId: 'd2-reduced-guidance',
      guidanceLevel: 'reduced',
      helpCanBeReenabled: true,
    });
    expect(buildEarlyCampaignDayContract(content, 'd3').tutorial).toMatchObject({
      newActionId: 'd3-tare-brush',
      failurePolicy: 'safe-first-use',
    });
  });

  it('끊긴 날짜, 중복 고정 인물, 범위 위반, D4 command를 거부한다', () => {
    const brokenChain = bundle();
    brokenChain.scenarios.find(({ id }) => id === 'd2').nextDay = 'd4-preview';
    expect(checkContentRules(brokenChain).errors.join('\n')).toMatch(/chain|이전 참조/);

    const duplicateFixed = bundle();
    duplicateFixed.campaignCharacters.push({
      ...structuredClone(duplicateFixed.campaignCharacters[0]),
      id: 'CHAR-THIRD',
    });
    expect(checkContentRules(duplicateFixed).errors.join('\n')).toMatch(/고정 인물/);

    const outOfRange = bundle();
    outOfRange.days.find(({ id }) => id === 'd3').totals.items.max = 15;
    expect(checkContentRules(outOfRange).errors.join('\n')).toMatch(/items 합계/);

    const mutablePreview = bundle();
    mutablePreview.scenarios.at(-1).gameplayCommandIds = ['begin-day'];
    expect(checkContentRules(mutablePreview).errors.join('\n')).toMatch(/preview는 읽기 전용/);
  });

  it('미정의 참조와 D3 이전 tare 주문을 거부한다', () => {
    const missing = bundle();
    missing.orders[0].items[0].menuId = 'missing-menu';
    expect(checkContentRules(missing).errors.join('\n')).toMatch(/미정의 메뉴 참조/);

    const earlyTare = bundle();
    earlyTare.orders.find(({ id }) => id === 'D2-ORDER-001').items[0].seasoning = 'tare';
    expect(checkContentRules(earlyTare).errors.join('\n')).toMatch(/tare 주문은 d3 이전/);
  });
});
