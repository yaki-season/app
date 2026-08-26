import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_PHASE,
  MemoryStorageAdapter,
  PERSISTENCE_ERROR_CODE,
  SAVE_STORAGE_KEYS,
  StoragePortError,
  sealSaveEnvelope,
  serializeSaveEnvelope,
} from '../../src/campaign-runtime.js';
import {
  S0_D3_CONTENT_VERSION,
  S0D3CampaignBridge,
  S0_D3_STORAGE_PREFIX,
  campaignPresentationPosition,
  createS0D3CampaignDefinition,
} from '../../src/scenario/s0-d3-campaign.js';

const grillSlotConfig = JSON.parse(readFileSync(
  new URL('../../content/progression/grill-slots.json', import.meta.url),
  'utf8',
));

async function reachD4PreOpen(bridge, { reputation = 10 } = {}) {
  await bridge.loadOrStart();
  bridge.finishPrologue();
  for (const dayId of ['D1', 'D2', 'D3']) {
    await bridge.startDay();
    bridge.enterSettlement();
    await bridge.completeDay(dayId, {
      reward: dayId === 'D3'
        ? { reputation, unlockIds: ['day-d4'] }
        : {},
    });
  }
}

describe('S0~D4 campaign presentation bridge', () => {
  it('공개 campaign node chain만 소비한다', () => {
    const definition = createS0D3CampaignDefinition();
    expect(definition.ids).toEqual(['s0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd5-complete']);
    expect(S0_D3_STORAGE_PREFIX).toBe('yaki-season.dev2-scenario.');
  });

  it('day-start 체크포인트를 영업 전 UI로 재개한다', async () => {
    const storage = new MemoryStorageAdapter();
    const first = new S0D3CampaignBridge({ storagePort: storage });
    expect((await first.loadOrStart()).resumed).toBe(false);
    first.finishPrologue();
    expect((await first.startDay()).ok).toBe(true);
    expect(first.getState().campaign.phase).toBe(CAMPAIGN_PHASE.BUSINESS);

    const reloaded = new S0D3CampaignBridge({ storagePort: storage });
    expect((await reloaded.loadOrStart()).resumed).toBe(true);
    expect(reloaded.getPosition()).toEqual({ kind: 'pre-open', dayId: 'D1' });
    expect(reloaded.getState().campaign.phase).toBe(CAMPAIGN_PHASE.PRE_OPEN);
  });

  it('D3 뒤 D4를 열고 D4 정산 뒤에만 UI를 종료한다', async () => {
    const storage = new MemoryStorageAdapter();
    const bridge = new S0D3CampaignBridge({ storagePort: storage });
    await bridge.loadOrStart();
    bridge.finishPrologue();

    for (const dayId of ['D1', 'D2', 'D3', 'D4']) {
      await bridge.startDay();
      bridge.enterSettlement();
      const completed = await bridge.completeDay(dayId);
      expect(completed.ok).toBe(true);
    }

    expect(campaignPresentationPosition(bridge.getState())).toEqual({ kind: 'pre-open', dayId: 'D5' });
    expect(bridge.getState().economy).toMatchObject({
      balance: 0,
      reputation: 0,
    });
  });

  it('정식 영업 결과가 제공되면 공개 aggregate에 그대로 위임한다', async () => {
    const bridge = new S0D3CampaignBridge({ storagePort: new MemoryStorageAdapter() });
    await bridge.loadOrStart();
    bridge.finishPrologue();
    await bridge.startDay();
    bridge.enterSettlement();
    await bridge.completeDay('D1', {
      completionId: 'developer-1:d1-result',
      reward: { balance: 300, reputation: 2, storyFlagIds: ['d1-cleared'] },
    });
    expect(bridge.getState()).toMatchObject({
      campaign: { nodeId: 'd2' },
      economy: { balance: 300, reputation: 2 },
      story: { flagIds: ['d1-cleared'] },
    });
  });

  it('D4의 3칸 claim을 저장하고 재접속해도 유지하며 명성과 골드는 차감하지 않는다', async () => {
    const storage = new MemoryStorageAdapter();
    const bridge = new S0D3CampaignBridge({ storagePort: storage });
    await reachD4PreOpen(bridge);
    const economyBefore = bridge.getState().economy;

    expect(bridge.getGrillSlotUpgradeState(grillSlotConfig)).toMatchObject({
      claimed: 2,
      available: 3,
      pending: true,
    });
    expect(await bridge.claimGrillSlots(grillSlotConfig)).toMatchObject({
      ok: true,
      applied: true,
    });
    expect(bridge.getState().progression.claimedGrillSlots).toBe(3);
    expect(bridge.getState().economy).toEqual(economyBefore);
    expect(await bridge.claimGrillSlots(grillSlotConfig)).toMatchObject({
      ok: true,
      applied: false,
      reason: 'already-claimed',
    });

    const reloaded = new S0D3CampaignBridge({ storagePort: storage });
    expect((await reloaded.loadOrStart()).ok).toBe(true);
    expect(reloaded.getState()).toMatchObject({
      campaign: { nodeId: 'd4', phase: CAMPAIGN_PHASE.PRE_OPEN },
      economy: { reputation: 10, balance: 0 },
      progression: { claimedGrillSlots: 3 },
    });
  });

  it('claim 저장 실패는 2칸 상태를 원자적으로 보존한다', async () => {
    const storage = new MemoryStorageAdapter();
    const bridge = new S0D3CampaignBridge({ storagePort: storage });
    await reachD4PreOpen(bridge);
    const stateBefore = bridge.getState();
    const activeBefore = await storage.get(SAVE_STORAGE_KEYS.ACTIVE);
    storage.failNext('set', new StoragePortError(
      PERSISTENCE_ERROR_CODE.WRITE_FAILED,
      '저장 공간 부족',
    ));

    expect(await bridge.claimGrillSlots(grillSlotConfig)).toMatchObject({ ok: false });
    expect(bridge.getState()).toEqual(stateBefore);
    expect(bridge.getState().progression.claimedGrillSlots).toBe(2);
    expect(await storage.get(SAVE_STORAGE_KEYS.ACTIVE)).toBe(activeBefore);
  });

  it('업그레이드를 선택하지 않아도 2칸으로 D4 영업을 시작한다', async () => {
    const bridge = new S0D3CampaignBridge({ storagePort: new MemoryStorageAdapter() });
    await reachD4PreOpen(bridge);

    expect((await bridge.startDay()).ok).toBe(true);
    expect(bridge.getState()).toMatchObject({
      campaign: { nodeId: 'd4', phase: CAMPAIGN_PHASE.BUSINESS },
      progression: { claimedGrillSlots: 2 },
      economy: { reputation: 10 },
    });
  });

  it('구 버전의 D3 종착 저장을 D4 영업 전 상태로 호환 변환한다', async () => {
    const storage = new MemoryStorageAdapter();
    const bridge = new S0D3CampaignBridge({ storagePort: storage });
    await bridge.loadOrStart();
    bridge.finishPrologue();
    for (const dayId of ['D1', 'D2', 'D3']) {
      await bridge.startDay();
      bridge.enterSettlement();
      await bridge.completeDay(dayId);
    }
    const legacyNodeId = ['d4', 'preview'].join('-');
    const legacyState = bridge.getState();
    delete legacyState.progression.claimedGrillSlots;
    legacyState.campaign = {
      ...legacyState.campaign,
      nodeId: legacyNodeId,
      nodeKind: 'preview',
      dayId: null,
      phase: 'preview',
      unlockedNodeIds: legacyState.campaign.unlockedNodeIds.map((id) => (
        id === 'd4' ? legacyNodeId : id
      )),
    };
    await storage.set(SAVE_STORAGE_KEYS.ACTIVE, serializeSaveEnvelope(sealSaveEnvelope({
      saveSchemaVersion: 1,
      contentVersion: S0_D3_CONTENT_VERSION,
      writtenAt: '2026-08-26T00:00:00.000Z',
      checkpointType: 'day-complete',
      campaignId: legacyState.meta.campaignId,
      completedDayId: 'd3',
      payload: legacyState,
    })));

    const reloaded = new S0D3CampaignBridge({ storagePort: storage });
    const loaded = await reloaded.loadOrStart();
    expect(loaded).toMatchObject({ ok: true, resumed: true, save: { migrated: true } });
    expect(reloaded.getState().campaign).toMatchObject({
      nodeId: 'd4',
      nodeKind: 'day',
      dayId: 'd4',
      phase: CAMPAIGN_PHASE.PRE_OPEN,
    });
    expect(reloaded.getState().progression.claimedGrillSlots).toBe(2);
  });

  it('구 버전 D5 preview 저장을 실제 D5 영업 전 상태로 호환 변환한다', async () => {
    const storage = new MemoryStorageAdapter();
    const bridge = new S0D3CampaignBridge({ storagePort: storage });
    await bridge.loadOrStart();
    bridge.finishPrologue();
    for (const dayId of ['D1', 'D2', 'D3', 'D4']) {
      await bridge.startDay();
      bridge.enterSettlement();
      await bridge.completeDay(dayId);
    }
    const legacyState = bridge.getState();
    legacyState.campaign = {
      ...legacyState.campaign,
      nodeId: 'd5-preview',
      nodeKind: 'preview',
      dayId: null,
      phase: 'preview',
      unlockedNodeIds: legacyState.campaign.unlockedNodeIds.map((id) => (
        id === 'd5' ? 'd5-preview' : id
      )),
    };
    await storage.set(SAVE_STORAGE_KEYS.ACTIVE, serializeSaveEnvelope(sealSaveEnvelope({
      saveSchemaVersion: 1,
      contentVersion: S0_D3_CONTENT_VERSION,
      writtenAt: '2026-08-26T00:00:00.000Z',
      checkpointType: 'day-complete',
      campaignId: legacyState.meta.campaignId,
      completedDayId: 'd4',
      payload: legacyState,
    })));

    const reloaded = new S0D3CampaignBridge({ storagePort: storage });
    expect(await reloaded.loadOrStart()).toMatchObject({ ok: true, resumed: true, save: { migrated: true } });
    expect(reloaded.getState().campaign).toMatchObject({
      nodeId: 'd5',
      nodeKind: 'day',
      dayId: 'd5',
      phase: CAMPAIGN_PHASE.PRE_OPEN,
    });
  });
});
