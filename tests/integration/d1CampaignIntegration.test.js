import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildGuestScene } from '../../src/scenario/guestStories.js';
import {
  CAMPAIGN_PHASE,
  D1BusinessDayRuntime,
  D1_DAY_PHASE,
  D1_QUALITY,
  D1_SETTLEMENT_STEPS,
  CampaignRuntime,
  CampaignSaveRepository,
  MemoryStorageAdapter,
  PERSISTENCE_ERROR_CODE,
  StoragePortError,
  assertEarlyCampaignDefinition,
  createCampaignDefinition,
  createD1BusinessDayDefinition,
  validateCampaignState,
} from '../../src/campaign-runtime.js';

const campaignRecords = JSON.parse(readFileSync(fileURLToPath(
  new URL('../fixtures/campaign/s0-d5-preview.json', import.meta.url),
), 'utf8'));
const d1Record = JSON.parse(readFileSync(fileURLToPath(
  new URL('../fixtures/business-days/d1-full-day.json', import.meta.url),
), 'utf8'));
const campaignDefinition = assertEarlyCampaignDefinition(createCampaignDefinition(campaignRecords));
const d1Definition = createD1BusinessDayDefinition(d1Record);

function createHarness(storage = new MemoryStorageAdapter()) {
  let tick = 0;
  const repository = new CampaignSaveRepository({
    storage,
    clock: () => new Date(Date.UTC(2026, 6, 30, 1, tick++)),
    validatePayload: (payload) => validateCampaignState(payload, campaignDefinition),
    acceptsContentVersion: (version) => version === 'content-s0-d3-r1',
  });
  const campaign = new CampaignRuntime({
    definition: campaignDefinition,
    saveRepository: repository,
  });
  campaign.startNewCampaign({
    campaignId: 'campaign-d1-integration',
    contentVersion: 'content-s0-d3-r1',
    seed: 99,
  });
  campaign.finishPrologue();
  const d1 = new D1BusinessDayRuntime({
    definition: d1Definition,
    campaignRuntime: campaign,
  });
  return { storage, repository, campaign, d1 };
}

function dispatch(runtime, eventId, type, fields = {}) {
  return runtime.dispatch({ eventId, type, ...fields });
}

function advanceTo(runtime, elapsedMs) {
  runtime.advance(Math.max(0, elapsedMs - runtime.getState().clock.elapsedMs));
}

function accept(runtime, orderId) {
  dispatch(runtime, `accept:${orderId}`, 'accept-order', { orderId });
}

function serve(runtime, customerId, menuId, index) {
  dispatch(runtime, `serve:${customerId}:${menuId}:${index}`, 'serve-item', {
    customerId,
    menuId,
    quality: D1_QUALITY.PERFECT,
  });
}

function cleanupAll(runtime, prefix) {
  const seats = runtime.getState().seats.filter((seat) => seat.status === 'cleanup');
  seats.forEach((seat) => dispatch(runtime, `${prefix}:${seat.id}`, 'begin-cleanup', {
    seatId: seat.id,
  }));
  runtime.advance(3_000);
}

function completeFullDay(runtime) {
  runtime.advance(6_000);
  accept(runtime, 'D1-ORDER-001');
  serve(runtime, 'REGULAR_TSUKIOKA', 'beer', 1);
  serve(runtime, 'REGULAR_TSUKIOKA', 'negima', 1);
  serve(runtime, 'REGULAR_TSUKIOKA', 'negima', 2);
  runtime.advance(16_000);
  cleanupAll(runtime, 'cleanup:tsukioka');

  advanceTo(runtime, 100_000);
  runtime.advance(6_000);
  accept(runtime, 'D1-ORDER-002-A');
  accept(runtime, 'D1-ORDER-002-B');
  serve(runtime, 'D1-OFFICE-A', 'beer', 1);
  serve(runtime, 'D1-OFFICE-A', 'negima', 1);
  serve(runtime, 'D1-OFFICE-B', 'beer', 1);
  serve(runtime, 'D1-OFFICE-B', 'negima', 1);
  runtime.advance(16_000);
  cleanupAll(runtime, 'cleanup:office');

  advanceTo(runtime, 220_000);
  runtime.advance(6_000);
  accept(runtime, 'D1-ORDER-003');
  serve(runtime, 'D1-SOLO-A', 'negima', 1);
  runtime.advance(16_000);
  cleanupAll(runtime, 'cleanup:solo');

  advanceTo(runtime, 420_000);
  dispatch(runtime, 'charcoal', 'lower-charcoal', { disposedPreparedItems: 0 });
  D1_SETTLEMENT_STEPS.forEach((_, index) => {
    dispatch(runtime, `settlement:${index}`, 'reveal-settlement-step');
  });
}

describe('D1 영업일과 캠페인 저장 통합', () => {
  it.each([undefined, { damaged: true }])('이전/손상된 손님 기억(%j)을 복구해도 정상 제공을 계속할 수 있다', async guestServings => {
    const { d1 } = createHarness();
    await d1.start({ runId: 'memory-recovery' });
    d1.advance(6000);
    accept(d1, 'D1-ORDER-001');
    const snapshot = d1.getState();
    snapshot.guestServings = guestServings;
    snapshot.guestStory = { active: { sceneId: 'SCN-D6-TSUKIOKA-ARRIVAL', lineIndex: -1 } };
    expect(d1.restore(snapshot).ok).toBe(true);
    expect(d1.getState().guestStory).toEqual({ completedIds: [], active: null, pendingIds: [] });
    expect(d1.getState().guestServings).toEqual([]);
    serve(d1, 'REGULAR_TSUKIOKA', 'beer', 1);
    expect(d1.getState().guestServings).toEqual([
      expect.objectContaining({ customerId: 'REGULAR_TSUKIOKA', menuId: 'beer' }),
    ]);
  });

  it('day-start 체크포인트에서 시작하고 영업 중 중단은 D1 영업 전으로 복구한다', async () => {
    const { repository, campaign, d1 } = createHarness();
    const started = await d1.start({ runId: 'campaign-d1-integration:d1:run-1' });
    expect(started.ok).toBe(true);
    expect(campaign.getState().campaign.phase).toBe(CAMPAIGN_PHASE.BUSINESS);
    d1.advance(6_000);
    accept(d1, 'D1-ORDER-001');
    serve(d1, 'REGULAR_TSUKIOKA', 'beer', 1);

    const reloadedCampaign = new CampaignRuntime({
      definition: campaignDefinition,
      saveRepository: repository,
    });
    const loaded = await reloadedCampaign.loadCampaign();
    expect(loaded.ok).toBe(true);
    expect(reloadedCampaign.getState().campaign).toMatchObject({
      nodeId: 'd1',
      phase: CAMPAIGN_PHASE.PRE_OPEN,
    });
  });

  it('정산 5단계 뒤 day-complete를 저장하고 D2·정산 원장을 새로고침 뒤에도 보존한다', async () => {
    const { repository, campaign, d1 } = createHarness();
    await d1.start({ runId: 'campaign-d1-integration:d1:run-2' });
    completeFullDay(d1);
    expect(d1.getState()).toMatchObject({
      phase: D1_DAY_PHASE.SETTLEMENT,
      settlement: { ready: true },
    });
    const staleSettlementState = d1.getState();

    const completed = await d1.finalize();
    expect(completed).toMatchObject({
      ok: true,
      duplicate: false,
      value: { phase: D1_DAY_PHASE.COMPLETE },
      campaign: {
        campaign: { nodeId: 'd2', phase: CAMPAIGN_PHASE.PRE_OPEN },
        economy: { balance: 41, reputation: 12 },
      },
    });
    expect(campaign.getState().economy.settlements[0].summary).toMatchObject({
      orders: { completed: 4 },
      economy: { total: 41 },
    });

    const duplicate = await d1.finalize();
    expect(duplicate).toMatchObject({ ok: true, duplicate: true });
    expect(campaign.getState().economy.balance).toBe(41);
    expect(campaign.getState().economy.settlements).toHaveLength(1);

    const duplicateRuntime = new D1BusinessDayRuntime({
      definition: d1Definition,
      campaignRuntime: campaign,
      state: staleSettlementState,
    });
    const duplicateAcrossInstances = await duplicateRuntime.finalize();
    expect(duplicateAcrossInstances).toMatchObject({
      ok: true,
      duplicate: true,
      value: { phase: D1_DAY_PHASE.COMPLETE },
    });
    expect(campaign.getState().economy).toMatchObject({
      balance: 41,
      reputation: 12,
      settlements: [expect.objectContaining({
        completionId: staleSettlementState.settlement.completionId,
      })],
    });

    const reloadedCampaign = new CampaignRuntime({
      definition: campaignDefinition,
      saveRepository: repository,
    });
    await reloadedCampaign.loadCampaign();
    expect(reloadedCampaign.getState()).toMatchObject({
      campaign: {
        nodeId: 'd2',
        completedDayIds: ['d1'],
        unlockedNodeIds: ['s0', 'd1', 'd2'],
      },
      progression: {
        unlockIds: ['recipe-momo', 'menu-momo', 'day-d2'],
      },
      story: {
        flagIds: ['d1-complete', 'momo-restored', 'guest:tsukioka:d1:visited',
          'guest:tsukioka:d1:ordered', 'guest:tsukioka:d1:first:beer',
          'guest:tsukioka:d1:served:beer', 'guest:tsukioka:d1:served:negima',
          ...['ren', 'mio'].flatMap(key => ['visited', 'ordered', 'first:beer', 'served:beer', 'served:negima'].map(flag => `guest:${key}:d1:${flag}`)),
          ...['visited', 'ordered', 'first:negima', 'served:negima'].map(flag => `guest:sae:d1:${flag}`)],
      },
    });
    // 저장에 값이 있기만 한 계약이 아니라 다음 방문의 실제 원고 선택기가 소비한다.
    const nextScene = buildGuestScene({ dayId: 'd2', beat: 'arrival',
      flagIds: reloadedCampaign.getState().story.flagIds, business: { ...staleSettlementState, dayId: 'd2' } });
    expect(nextScene.lines[0].text).toContain('맥주부터');
  });

  it('day-complete 저장 실패 시 D1 보상과 날짜를 commit하지 않고 같은 완료 ID로 재시도한다', async () => {
    const { storage, campaign, d1 } = createHarness();
    await d1.start({ runId: 'campaign-d1-integration:d1:run-3' });
    completeFullDay(d1);
    storage.failNext('set', new StoragePortError(
      PERSISTENCE_ERROR_CODE.WRITE_FAILED,
      '저장 공간 부족',
    ));

    const failed = await d1.finalize();
    expect(failed.ok).toBe(false);
    expect(campaign.getState()).toMatchObject({
      campaign: { nodeId: 'd1', phase: CAMPAIGN_PHASE.SETTLEMENT },
      economy: { balance: 0, reputation: 0, settlements: [] },
    });
    expect(d1.getState().phase).toBe(D1_DAY_PHASE.SETTLEMENT);
    expect(campaign.getState().story.flagIds).not.toContain('guest:tsukioka:d1:first:beer');

    const retried = await d1.finalize();
    expect(retried.ok).toBe(true);
    expect(campaign.getState().story.flagIds.filter(id => id === 'guest:tsukioka:d1:first:beer')).toHaveLength(1);
    expect(campaign.getState()).toMatchObject({
      campaign: { nodeId: 'd2', phase: CAMPAIGN_PHASE.PRE_OPEN },
      economy: { balance: 41, reputation: 12 },
    });
  });
});
