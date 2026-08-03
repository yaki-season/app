import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  D1_SETTLEMENT_STEPS,
  D1_UI_INTENT,
  MemoryStorageAdapter,
  createBusinessDayDefinition,
} from '../../src/campaign-runtime.js';
import { createD1BusinessDayBrowserSession } from '../../src/application/businessDay/d1BusinessDayBrowserSession.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const definitions = ['d1', 'd2', 'd3'].map((dayId) => createBusinessDayDefinition(
  read(dayId === 'd1' ? 'tests/fixtures/business-days/d1-full-day.json' : `content/releases/${dayId}-business-day-domain.v1.json`),
  { expectedId: dayId, requireD1GuidedOpening: dayId === 'd1' },
));

const dispatch = (port, intentId, type, fields = {}) => port.dispatch({ intentId, type, ...fields });
const advanceTo = (port, elapsedMs) => port.advance(Math.max(0, elapsedMs - port.getViewModel().clock.elapsedMs));

function cleanupAll(port, prefix) {
  const seats = port.getViewModel().seats.filter((seat) => seat.cleanupNeeded);
  seats.forEach((seat) => dispatch(port, `${prefix}:${seat.seatId}`, D1_UI_INTENT.BEGIN_CLEANUP, { seatId: seat.seatId }));
  if (seats.length) port.advance(3_000);
}

function serveOrder(port, order, customerId, prefix) {
  order.lines.forEach((line, lineIndex) => {
    for (let index = 0; index < line.quantity; index += 1) {
      const result = dispatch(port, `${prefix}:${lineIndex}:${line.menuId}:${index}`, D1_UI_INTENT.SERVE_ITEM, {
        customerId,
        menuId: line.menuId,
        quality: 'Perfect',
      });
      expect(result.ok).toBe(true);
    }
  });
}

function playFullDay(port, definition) {
  definition.waves.forEach((wave, waveIndex) => {
    advanceTo(port, wave.atMs);
    port.advance(definition.timingMs.thinkMax);
    const uniqueOrders = new Map();
    wave.customers.forEach((customer) => {
      if (!uniqueOrders.has(customer.order.id)) uniqueOrders.set(customer.order.id, customer);
    });
    uniqueOrders.forEach((customer, orderId) => {
      const accepted = dispatch(port, `${definition.id}:accept:${orderId}`, D1_UI_INTENT.ACCEPT_ORDER, { orderId });
      expect(accepted, `${definition.id}/${orderId}: ${JSON.stringify(accepted)}`).toMatchObject({ ok: true });
      serveOrder(port, customer.order, customer.id, `${definition.id}:serve:${orderId}`);
    });
    port.advance(definition.timingMs.eat + definition.timingMs.leave);
    cleanupAll(port, `${definition.id}:cleanup:${waveIndex}`);
  });

  advanceTo(port, definition.sessionTargetMs);
  cleanupAll(port, `${definition.id}:cleanup:final`);
  const closing = port.getViewModel();
  expect(closing).toMatchObject({
    phase: 'charcoal-down',
    closing: { unfinishedOrderCount: 0, cleanupSeatCount: 0, canLowerCharcoal: true },
  });
  expect(dispatch(port, `${definition.id}:charcoal`, D1_UI_INTENT.LOWER_CHARCOAL).ok).toBe(true);
  D1_SETTLEMENT_STEPS.forEach((_, index) => {
    expect(dispatch(port, `${definition.id}:settlement:${index}`, D1_UI_INTENT.REVEAL_SETTLEMENT_STEP).ok).toBe(true);
  });
  expect(port.getViewModel()).toMatchObject({ phase: 'settlement', settlement: { ready: true } });
}

describe('D1→D3 전체 영업 종단', () => {
  it('각 날짜의 마지막 정리 후 마감하고 D3 정산을 한 번만 저장해 D4-preview로 전환한다', async () => {
    const storage = new MemoryStorageAdapter();
    let d3Session;
    for (const definition of definitions) {
      const session = await createD1BusinessDayBrowserSession({ definition, storagePort: storage });
      expect(session).toMatchObject({ ok: true, completed: false });
      playFullDay(session.port, definition);
      const completed = await session.port.finalize();
      expect(completed).toMatchObject({ ok: true, duplicate: false });
      if (definition.id === 'd3') d3Session = session;
    }

    expect(d3Session.bridge.getState()).toMatchObject({
      campaign: {
        nodeId: 'd4-preview',
        phase: 'preview',
        completedDayIds: ['d1', 'd2', 'd3'],
      },
      story: { flagIds: expect.arrayContaining(['d3-complete', 'tare-introduced']) },
    });
    const settlementsBefore = d3Session.bridge.getState().economy.settlements.length;
    expect(await d3Session.port.finalize()).toMatchObject({ ok: true, duplicate: true });
    expect(d3Session.bridge.getState().economy.settlements).toHaveLength(settlementsBefore);

    const resumed = await createD1BusinessDayBrowserSession({ definition: definitions[2], storagePort: storage });
    expect(resumed).toMatchObject({ ok: true, completed: true, resumed: true });
    expect(resumed.campaign.campaign.nodeId).toBe('d4-preview');

    const beforePreviewCommands = storage.snapshot();
    expect(await resumed.bridge.startDay()).toMatchObject({
      ok: false,
      error: { code: 'CAMPAIGN_PREVIEW_READ_ONLY' },
    });
    expect(resumed.bridge.enterSettlement()).toMatchObject({
      ok: false,
      error: { code: 'CAMPAIGN_PREVIEW_READ_ONLY' },
    });
    expect(await resumed.bridge.completeDay('D4', {
      completionId: 'forbidden-d4',
      reward: { balance: 999, reputation: 999, unlockIds: ['forbidden'] },
    })).toMatchObject({
      ok: false,
      error: { code: 'CAMPAIGN_PREVIEW_READ_ONLY' },
    });
    expect(storage.snapshot()).toEqual(beforePreviewCommands);
    expect(resumed.bridge.getState()).toEqual(d3Session.bridge.getState());
  });
});
