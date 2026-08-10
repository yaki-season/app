import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_PHASE,
  CampaignRuntime,
  CampaignSaveRepository,
  D1BusinessDayRuntime,
  D1BusinessDayUiPort,
  D1_UI_ERROR_CODE,
  D1_UI_INTENT,
  D1_SETTLEMENT_STEPS,
  MemoryStorageAdapter,
  assertEarlyCampaignDefinition,
  createCampaignDefinition,
  createD1BusinessDayDefinition,
  validateCampaignState,
} from '../../src/campaign-runtime.js';
import { buildSeatStates } from '../../src/render/customerAdapter.js';
import { canServeD1MenuToSeat } from '../../src/application/businessDay/d1BusinessDayUiPort.js';

const campaignRecords = JSON.parse(readFileSync(fileURLToPath(
  new URL('../fixtures/campaign/s0-d4-preview.json', import.meta.url),
), 'utf8'));
const d1Record = JSON.parse(readFileSync(fileURLToPath(
  new URL('../fixtures/business-days/d1-full-day.json', import.meta.url),
), 'utf8'));
const campaignDefinition = assertEarlyCampaignDefinition(createCampaignDefinition(campaignRecords));
const d1Definition = createD1BusinessDayDefinition(d1Record);

function harness() {
  const storage = new MemoryStorageAdapter();
  let tick = 0;
  const repository = new CampaignSaveRepository({
    storage,
    clock: () => new Date(Date.UTC(2026, 6, 30, 3, tick++)),
    validatePayload: (payload) => validateCampaignState(payload, campaignDefinition),
    acceptsContentVersion: (version) => version === 'content-s0-d3-r1',
  });
  const campaign = new CampaignRuntime({
    definition: campaignDefinition,
    saveRepository: repository,
  });
  campaign.startNewCampaign({
    campaignId: 'd1-ui-port',
    contentVersion: 'content-s0-d3-r1',
    seed: 77,
  });
  campaign.finishPrologue();
  const runtime = new D1BusinessDayRuntime({
    definition: d1Definition,
    campaignRuntime: campaign,
  });
  return {
    storage,
    repository,
    campaign,
    port: new D1BusinessDayUiPort({ runtime, definition: d1Definition }),
  };
}

function dispatch(port, intentId, type, fields = {}) {
  return port.dispatch({ intentId, type, ...fields });
}

function advanceTo(port, elapsedMs) {
  const current = port.getViewModel().clock.elapsedMs;
  port.advance(Math.max(0, elapsedMs - current));
}

function accept(port, orderId) {
  return dispatch(port, `accept:${orderId}`, D1_UI_INTENT.ACCEPT_ORDER, { orderId });
}

function serve(port, customerId, menu, index) {
  return dispatch(port, `serve:${customerId}:${menu}:${index}`, D1_UI_INTENT.SERVE_ITEM, {
    customerId,
    menu,
    quality: 'perfect',
  });
}

function cleanupAll(port, prefix) {
  port.getViewModel().seats
    .filter((seat) => seat.cleanupNeeded)
    .forEach((seat) => dispatch(port, `${prefix}:${seat.seatId}`, D1_UI_INTENT.BEGIN_CLEANUP, {
      seatId: seat.seatId,
    }));
  port.advance(3_000);
}

function finishAllOrders(port) {
  port.advance(6_000);
  accept(port, 'D1-ORDER-001');
  serve(port, 'REGULAR_TSUKIOKA', '생맥주', 1);
  serve(port, 'REGULAR_TSUKIOKA', '네기마', 1);
  serve(port, 'REGULAR_TSUKIOKA', '네기마', 2);
  serve(port, 'REGULAR_TSUKIOKA', '네기마', 3);
  port.advance(16_000);
  cleanupAll(port, 'cleanup:tsukioka');

  advanceTo(port, 100_000);
  port.advance(6_000);
  accept(port, 'D1-ORDER-002-A');
  accept(port, 'D1-ORDER-002-B');
  serve(port, 'D1-OFFICE-A', '생맥주', 1);
  serve(port, 'D1-OFFICE-A', '네기마', 1);
  serve(port, 'D1-OFFICE-B', '생맥주', 1);
  serve(port, 'D1-OFFICE-B', '네기마', 1);
  port.advance(16_000);
  cleanupAll(port, 'cleanup:office');

  advanceTo(port, 220_000);
  port.advance(6_000);
  accept(port, 'D1-ORDER-003');
  serve(port, 'D1-SOLO-A', '네기마', 1);
  port.advance(16_000);
  cleanupAll(port, 'cleanup:solo');
}

describe('D1 영업일 UI port 경계 통합', () => {
  it('도메인 좌석·주문·오류를 기존 6석 렌더 계약에 맞는 안정 view로 투영한다', async () => {
    const { port } = harness();
    expect(port.getViewModel()).toMatchObject({
      ready: false,
      suggestedScreenId: 'SCR-DAY-PREP',
      error: { code: D1_UI_ERROR_CODE.NOT_STARTED },
    });
    expect((await port.start({ runId: 'd1-ui-port:run-1' })).ok).toBe(true);
    expect(port.getViewModel().seats.map((seat) => seat.seatId)).toEqual(d1Definition.seatIds);

    port.advance(6_000);
    const ordering = port.getViewModel().seats.find((seat) => seat.customerId === 'REGULAR_TSUKIOKA');
    expect(ordering).toMatchObject({
      phase: 'ordering',
      canOrder: true,
      orderLabel: '생맥주 · 네기마 0/2',
    });
    expect(buildSeatStates(port.getViewModel().seats).find(
      (seat) => seat.seatId === ordering.seatId,
    )).toMatchObject({
      occupied: true,
      orderLabel: '생맥주 · 네기마 0/2',
    });

    expect(dispatch(port, 'accept:seat', D1_UI_INTENT.ACCEPT_ORDER, {
      seatId: ordering.seatId,
    })).toMatchObject({ ok: true, applied: true });
    const acceptedSeat = port.getViewModel().seats.find((seat) => seat.seatId === ordering.seatId);
    expect(acceptedSeat).toMatchObject({
      remainingOrderLabel: '생맥주 1개 · 네기마 2개',
      remainingItems: [
        { menuId: 'beer', menuLabel: '생맥주', remaining: 1 },
        { menuId: 'negima', menuLabel: '네기마', remaining: 2 },
      ],
    });
    expect(canServeD1MenuToSeat(acceptedSeat, '네기마')).toBe(true);
    expect(canServeD1MenuToSeat(acceptedSeat, '생맥주')).toBe(true);
    expect(canServeD1MenuToSeat(acceptedSeat, '없는 메뉴')).toBe(false);
    const negimaFirst = dispatch(port, 'serve:negima-first', D1_UI_INTENT.SERVE_ITEM, {
      seatId: ordering.seatId,
      menu: '네기마',
      quality: 'Perfect',
    });
    expect(negimaFirst).toMatchObject({ ok: true, partial: true, remaining: 2 });

    const served = dispatch(port, 'serve:beer', D1_UI_INTENT.SERVE_ITEM, {
      seatId: ordering.seatId,
      menu: '생맥주',
      quality: 'perfect',
    });
    const duplicate = dispatch(port, 'serve:beer', D1_UI_INTENT.SERVE_ITEM, {
      seatId: ordering.seatId,
      menu: '생맥주',
      quality: 'perfect',
    });
    expect(served).toMatchObject({ ok: true, partial: true, remaining: 1 });
    expect(duplicate).toMatchObject({ ok: true, applied: false, duplicate: true });
    expect(port.getViewModel().orders[0].lines[0]).toMatchObject({
      menuId: 'beer',
      served: 1,
      remaining: 0,
    });
    expect(port.getViewModel().orders[0].lines[1]).toMatchObject({
      menuId: 'negima',
      served: 1,
      remaining: 1,
    });
    expect(port.getViewModel().seats.find(
      (seat) => seat.seatId === ordering.seatId,
    )).toMatchObject({
      remainingOrderLabel: '네기마 1개',
      remainingItems: [{ menuId: 'negima', menuLabel: '네기마', remaining: 1 }],
    });
    expect(port.dispatch({
      type: D1_UI_INTENT.PAUSE,
    })).toMatchObject({
      ok: false,
      error: { code: D1_UI_ERROR_CODE.INVALID_INTENT },
    });
  });

  it('먼저 접수한 주문 대신 화면에서 선택한 늦은 손님의 일치 메뉴를 먼저 제공한다', async () => {
    const { port } = harness();
    await port.start({ runId: 'd1-ui-port:selected-customer' });
    port.advance(6_000);
    accept(port, 'D1-ORDER-001');
    serve(port, 'REGULAR_TSUKIOKA', '네기마', 1);
    serve(port, 'REGULAR_TSUKIOKA', '네기마', 2);
    serve(port, 'REGULAR_TSUKIOKA', '네기마', 3);
    serve(port, 'REGULAR_TSUKIOKA', '생맥주', 1);

    advanceTo(port, 100_000);
    port.advance(6_000);
    accept(port, 'D1-ORDER-002-A');
    accept(port, 'D1-ORDER-002-B');
    const provided = serve(port, 'D1-OFFICE-B', '네기마', 1);

    expect(provided).toMatchObject({ ok: true, applied: true, partial: true, remaining: 1 });
    const view = port.getViewModel();
    expect(view.orders.find((order) => order.customerId === 'D1-OFFICE-A').lines)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ served: 0 }),
      ]));
    expect(view.orders.find((order) => order.customerId === 'D1-OFFICE-B').lines
      .find((line) => line.menuId === 'negima')).toMatchObject({ served: 1, remaining: 0 });
  });

  it('화면 독립 intent만으로 마감·5단계 정산·D2 저장 복구까지 이어진다', async () => {
    const { port, repository } = harness();
    await port.start({ runId: 'd1-ui-port:run-2' });
    finishAllOrders(port);
    advanceTo(port, 420_000);

    expect(port.getViewModel()).toMatchObject({
      phase: 'charcoal-down',
      suggestedScreenId: 'SCR-POST-CLOSING',
      clock: { label: '22:45', dayOffset: 0 },
      closing: {
        unfinishedCustomerCount: 0,
        unfinishedOrderCount: 0,
        cleanupSeatCount: 0,
        canLowerCharcoal: true,
      },
    });
    expect(dispatch(port, 'charcoal', D1_UI_INTENT.LOWER_CHARCOAL, {
      disposedPreparedItems: 2,
    })).toMatchObject({ ok: true });
    expect(port.getViewModel()).toMatchObject({
      phase: 'settlement',
      suggestedScreenId: 'SCR-POST-SETTLEMENT',
      settlement: {
        nextStepId: D1_SETTLEMENT_STEPS[0],
        ready: false,
        summary: {
          customers: { visited: 4, lost: 0, cleanedSeats: 4 },
          economy: { total: 41, reputation: 12 },
        },
      },
    });

    D1_SETTLEMENT_STEPS.forEach((stepId, index) => {
      expect(dispatch(
        port,
        `settlement:${index}`,
        D1_UI_INTENT.REVEAL_SETTLEMENT_STEP,
      )).toMatchObject({ ok: true, stepId });
    });
    const finalized = await port.finalize();
    expect(finalized).toMatchObject({
      ok: true,
      duplicate: false,
      view: {
        phase: 'complete',
        suggestedScreenId: 'SCR-POST-DAY-COMPLETE',
      },
      campaign: {
        campaign: { nodeId: 'd2', phase: CAMPAIGN_PHASE.PRE_OPEN },
        economy: { balance: 41, reputation: 12 },
      },
    });

    const reloaded = new CampaignRuntime({
      definition: campaignDefinition,
      saveRepository: repository,
    });
    expect((await reloaded.loadCampaign()).ok).toBe(true);
    expect(reloaded.getState()).toMatchObject({
      campaign: { nodeId: 'd2', completedDayIds: ['d1'] },
      economy: { balance: 41, reputation: 12 },
    });
  });
});
