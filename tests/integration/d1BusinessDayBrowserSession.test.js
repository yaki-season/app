import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  D1_SETTLEMENT_STEPS,
  D1_UI_INTENT,
  MemoryStorageAdapter,
  createBusinessDayDefinition,
  createD1BusinessDayDefinition,
} from '../../src/campaign-runtime.js';
import { createD1BusinessDayBrowserSession } from '../../src/application/businessDay/d1BusinessDayBrowserSession.js';

const record = JSON.parse(readFileSync(fileURLToPath(
  new URL('../fixtures/business-days/d1-full-day.json', import.meta.url),
), 'utf8'));
const definition = createD1BusinessDayDefinition(record);
const d2Record = JSON.parse(readFileSync(fileURLToPath(
  new URL('../../content/releases/d2-business-day-domain.v1.json', import.meta.url),
), 'utf8'));
const d2Definition = createBusinessDayDefinition(d2Record, { expectedId: 'd2' });

const dispatch = (port, intentId, type, fields = {}) => port.dispatch({
  intentId,
  type,
  ...fields,
});
const advanceTo = (port, elapsedMs) => port.advance(
  Math.max(0, elapsedMs - port.getViewModel().clock.elapsedMs),
);

function serve(port, customerId, menu, index) {
  return dispatch(port, `serve:${customerId}:${menu}:${index}`, D1_UI_INTENT.SERVE_ITEM, {
    customerId,
    menu,
    quality: 'Perfect',
  });
}

function cleanup(port, prefix) {
  port.getViewModel().seats.filter((seat) => seat.cleanupNeeded).forEach((seat) => {
    dispatch(port, `${prefix}:${seat.seatId}`, D1_UI_INTENT.BEGIN_CLEANUP, {
      seatId: seat.seatId,
    });
  });
  port.advance(3_000);
}

function finishDay(port) {
  port.advance(6_000);
  dispatch(port, 'accept:1', D1_UI_INTENT.ACCEPT_ORDER, { orderId: 'D1-ORDER-001' });
  serve(port, 'REGULAR_TSUKIOKA', 'beer', 1);
  serve(port, 'REGULAR_TSUKIOKA', 'negima', 1);
  serve(port, 'REGULAR_TSUKIOKA', 'negima', 2);
  serve(port, 'REGULAR_TSUKIOKA', 'negima', 3);
  port.advance(16_000);
  cleanup(port, 'cleanup:1');

  advanceTo(port, 100_000);
  port.advance(6_000);
  dispatch(port, 'accept:2a', D1_UI_INTENT.ACCEPT_ORDER, { orderId: 'D1-ORDER-002-A' });
  dispatch(port, 'accept:2b', D1_UI_INTENT.ACCEPT_ORDER, { orderId: 'D1-ORDER-002-B' });
  serve(port, 'D1-OFFICE-A', 'beer', 1);
  serve(port, 'D1-OFFICE-A', 'negima', 1);
  serve(port, 'D1-OFFICE-B', 'beer', 1);
  serve(port, 'D1-OFFICE-B', 'negima', 1);
  port.advance(16_000);
  cleanup(port, 'cleanup:2');

  advanceTo(port, 220_000);
  port.advance(6_000);
  dispatch(port, 'accept:3', D1_UI_INTENT.ACCEPT_ORDER, { orderId: 'D1-ORDER-003' });
  serve(port, 'D1-SOLO-A', 'negima', 1);
  port.advance(16_000);
  cleanup(port, 'cleanup:3');

  advanceTo(port, 420_000);
  dispatch(port, 'charcoal', D1_UI_INTENT.LOWER_CHARCOAL);
  D1_SETTLEMENT_STEPS.forEach((_, index) => {
    dispatch(port, `settle:${index}`, D1_UI_INTENT.REVEAL_SETTLEMENT_STEP);
  });
}

describe('D1 브라우저 영업 세션 조립', () => {
  it('직접 진입은 S0를 끝내고 day-start 저장 뒤 D1 6석 영업을 시작한다', async () => {
    const storage = new MemoryStorageAdapter();
    const session = await createD1BusinessDayBrowserSession({
      definition,
      storagePort: storage,
      seed: 17,
    });

    expect(session).toMatchObject({
      ok: true,
      completed: false,
      resumed: false,
      startedFromS0: true,
      checkpoint: {
        envelope: { checkpointType: 'day-start', completedDayId: null },
      },
    });
    expect(session.port.getViewModel()).toMatchObject({
      phase: 'open',
      seats: expect.arrayContaining([
        expect.objectContaining({ seatId: 'seat-01' }),
        expect.objectContaining({ seatId: 'seat-06' }),
      ]),
    });
  });

  it('영업 중 새로고침은 D1 pre-open 체크포인트로 복구하고 완료 뒤에는 D2를 재개한다', async () => {
    const storage = new MemoryStorageAdapter();
    const first = await createD1BusinessDayBrowserSession({ definition, storagePort: storage });
    first.port.advance(6_000);
    dispatch(first.port, 'accept:before-refresh', D1_UI_INTENT.ACCEPT_ORDER, {
      orderId: 'D1-ORDER-001',
    });
    serve(first.port, 'REGULAR_TSUKIOKA', 'beer', 1);

    const refreshed = await createD1BusinessDayBrowserSession({ definition, storagePort: storage });
    expect(refreshed).toMatchObject({
      ok: true,
      completed: false,
      resumed: true,
      startedFromS0: false,
    });
    expect(refreshed.port.getViewModel()).toMatchObject({
      clock: { elapsedMs: 0 },
      orders: [{
        orderId: 'D1-ORDER-001',
        status: 'unaccepted',
        lines: [
          { menuId: 'beer', served: 0 },
          { menuId: 'negima', served: 0 },
        ],
      }],
    });

    finishDay(refreshed.port);
    const firstCommit = await refreshed.port.finalize();
    const duplicateCommit = await refreshed.port.finalize();
    expect(firstCommit).toMatchObject({
      ok: true,
      duplicate: false,
      campaign: {
        campaign: { nodeId: 'd2', phase: 'pre-open' },
        economy: { balance: 41, reputation: 12 },
      },
    });
    expect(duplicateCommit).toMatchObject({ ok: true, duplicate: true });

    const afterCompleteRefresh = await createD1BusinessDayBrowserSession({
      definition,
      storagePort: storage,
    });
    expect(afterCompleteRefresh).toMatchObject({
      ok: true,
      completed: true,
      resumed: true,
      campaign: {
        campaign: { nodeId: 'd2', completedDayIds: ['d1'] },
        economy: { balance: 41, reputation: 12 },
      },
    });

    const resetForDevelopmentTest = await createD1BusinessDayBrowserSession({
      definition,
      storagePort: storage,
      resetDevelopment: true,
    });
    expect(resetForDevelopmentTest).toMatchObject({
      ok: true,
      completed: false,
      resumed: false,
      startedFromS0: true,
      campaign: {
        campaign: { nodeId: 'd1', completedDayIds: [] },
        economy: { balance: 0, reputation: 0 },
      },
    });
  });
});

describe('D2 브라우저 영업 세션 조립', () => {
  it('개발 시작 날짜는 중복 초기화 분기 없이 선행 날짜를 완료하고 D2를 연다', async () => {
    const session = await createD1BusinessDayBrowserSession({
      definition: d2Definition,
      storagePort: new MemoryStorageAdapter(),
      developmentStartDay: 'd2',
    });

    expect(session).toMatchObject({
      ok: true,
      completed: false,
      resumed: false,
      startedFromS0: false,
      campaign: {
        campaign: { nodeId: 'd2', completedDayIds: ['d1'] },
      },
    });
    expect(session.port.getViewModel()).toMatchObject({ dayId: 'D2', phase: 'open' });
  });

  it('D1 완료 저장에서 D2 실제 영업을 시작하고 모모 주문을 제공한다', async () => {
    const storage = new MemoryStorageAdapter();
    const d1 = await createD1BusinessDayBrowserSession({ definition, storagePort: storage });
    finishDay(d1.port);
    expect((await d1.port.finalize()).campaign.campaign.nodeId).toBe('d2');

    const d2 = await createD1BusinessDayBrowserSession({ definition: d2Definition, storagePort: storage });
    expect(d2).toMatchObject({ ok: true, completed: false, startedFromS0: false });
    expect(d2.port.getViewModel()).toMatchObject({ dayId: 'D2', phase: 'open' });
    d2.port.advance(6_000);
    dispatch(d2.port, 'd2:accept:1', D1_UI_INTENT.ACCEPT_ORDER, { orderId: 'D2-ORDER-001' });
    expect(serve(d2.port, 'REGULAR_TSUKIOKA', 'beer', 1)).toMatchObject({ ok: true, partial: true });
    expect(serve(d2.port, 'REGULAR_TSUKIOKA', 'momo', 1)).toMatchObject({ ok: true, completedOrder: true });
  });
});
