import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CAMPAIGN_NODE_KIND,
  CAMPAIGN_PHASE,
  assertEarlyCampaignDefinition,
  beginBusinessDay,
  claimCampaignGrillSlots,
  completeBusinessDay,
  completePrologue,
  createCampaignDefinition,
  createCampaignState,
  enterSettlement,
  getCampaignGrillSlotUpgradeState,
  validateCampaignState,
} from '../../src/campaign-runtime.js';

const grillSlotConfig = JSON.parse(readFileSync(
  new URL('../../content/progression/grill-slots.json', import.meta.url),
  'utf8',
));

const fixtureUrl = new URL('../fixtures/campaign/s0-d5-preview.json', import.meta.url);
const records = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'));

function definition() {
  return assertEarlyCampaignDefinition(createCampaignDefinition(records));
}

function initialState() {
  return createCampaignState({
    definition: definition(),
    campaignId: 'campaign-test',
    contentVersion: 'content-s0-d3-r1',
    seed: 42,
  });
}

describe('S0~D5 캠페인 도메인', () => {
  it('콘텐츠 ID chain을 검증한다', () => {
    const graph = definition();
    expect(graph.ids).toEqual(['s0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd5-complete']);
    expect(graph.get('d5-complete').kind).toBe(CAMPAIGN_NODE_KIND.PREVIEW);
  });

  it('S0부터 D1 영업 전으로 전이한다', () => {
    const s0 = initialState();
    expect(s0.campaign.phase).toBe(CAMPAIGN_PHASE.PROLOGUE);
    expect(s0.progression.claimedGrillSlots).toBe(2);
    const d1 = completePrologue(s0, definition());
    expect(d1.campaign).toMatchObject({
      nodeId: 'd1',
      dayId: 'd1',
      phase: CAMPAIGN_PHASE.PRE_OPEN,
    });
  });

  it('D4 영업 전 수동 claim은 2→3칸만 반영하고 명성과 골드를 소비하지 않는다', () => {
    const graph = definition();
    let state = completePrologue(initialState(), graph);
    for (const dayId of ['d1', 'd2', 'd3']) {
      state = enterSettlement(beginBusinessDay(state));
      state = completeBusinessDay(state, graph, {
        dayId,
        completionId: `${dayId}-upgrade-path`,
        reward: dayId === 'd3'
          ? { balance: 700, reputation: 10, unlockIds: ['day-d4'] }
          : {},
      }).state;
    }

    expect(getCampaignGrillSlotUpgradeState(state, grillSlotConfig)).toMatchObject({
      claimed: 2,
      available: 3,
      pending: true,
    });
    const claimed = claimCampaignGrillSlots(state, grillSlotConfig);
    expect(claimed).toMatchObject({ applied: true, reason: null });
    expect(claimed.state.progression.claimedGrillSlots).toBe(3);
    expect(claimed.state.economy).toEqual(state.economy);

    const duplicate = claimCampaignGrillSlots(claimed.state, grillSlotConfig);
    expect(duplicate).toMatchObject({
      applied: false,
      reason: 'already-claimed',
    });
    expect(duplicate.state).toBe(claimed.state);
  });

  it('영업 전이 아니거나 D4·명성 조건이 없으면 claim하지 않는다', () => {
    const d1 = completePrologue(initialState(), definition());
    expect(claimCampaignGrillSlots(d1, grillSlotConfig)).toMatchObject({
      applied: false,
      reason: 'unlock-required',
    });
    expect(claimCampaignGrillSlots(beginBusinessDay(d1), grillSlotConfig)).toMatchObject({
      applied: false,
      reason: 'pre-open-required',
    });
  });

  it('D1→D2→D3→D4→D5→완료를 결정적으로 순회한다', () => {
    const graph = definition();
    let state = completePrologue(initialState(), graph);
    for (const [index, dayId] of ['d1', 'd2', 'd3', 'd4', 'd5'].entries()) {
      state = beginBusinessDay(state);
      state = enterSettlement(state);
      const completed = completeBusinessDay(state, graph, {
        dayId,
        completionId: `${dayId}-complete`,
        reward: {
          balance: 100 + index,
          reputation: 1,
          unlockIds: [`unlock-${dayId}`],
          storyFlagIds: [`story-${dayId}`],
        },
      });
      expect(completed.applied).toBe(true);
      state = completed.state;
    }
    expect(state.campaign).toMatchObject({
      nodeId: 'd5-complete',
      nodeKind: CAMPAIGN_NODE_KIND.PREVIEW,
      dayId: null,
      phase: CAMPAIGN_PHASE.PREVIEW,
      completedDayIds: ['d1', 'd2', 'd3', 'd4', 'd5'],
    });
    expect(() => beginBusinessDay(state)).toThrow('영업일 node');
    expect(state.economy.balance).toBe(510);
    expect(validateCampaignState(state, graph)).toEqual({ valid: true, errors: [] });
  });

  it('같은 완료 ID의 정산 보상을 두 번 적용하지 않는다', () => {
    const graph = definition();
    let state = enterSettlement(beginBusinessDay(completePrologue(initialState(), graph)));
    const first = completeBusinessDay(state, graph, {
      dayId: 'd1',
      completionId: 'campaign-test:d1',
      reward: { balance: 500, reputation: 2 },
    });
    const duplicate = completeBusinessDay(first.state, graph, {
      dayId: 'd1',
      completionId: 'campaign-test:d1',
      reward: { balance: 9999, reputation: 9999 },
    });
    expect(duplicate.applied).toBe(false);
    expect(duplicate.state).toBe(first.state);
    expect(duplicate.state.economy.balance).toBe(500);
    expect(duplicate.state.economy.settlements).toHaveLength(1);
  });

  it('끊긴 초기 캠페인 chain을 거부한다', () => {
    const broken = records.map((record) => (
      record.id === 'd2' ? { ...record, nextId: 'd4' } : record
    ));
    expect(() => assertEarlyCampaignDefinition(createCampaignDefinition(broken)))
      .toThrow('초기 캠페인 연결');
  });
});
