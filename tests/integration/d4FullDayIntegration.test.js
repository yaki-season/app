import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  D1_SETTLEMENT_STEPS,
  D1_UI_INTENT,
  MemoryStorageAdapter,
  createBusinessDayDefinition,
} from '../../src/campaign-runtime.js';
import { createD1BusinessDayBrowserSession } from '../../src/application/businessDay/d1BusinessDayBrowserSession.js';

const record = JSON.parse(readFileSync(new URL(
  '../../content/releases/d4-business-day-domain.v1.json', import.meta.url,
), 'utf8'));
const definition = createBusinessDayDefinition(record, { expectedId: 'd4' });

const dispatch = (port, intentId, type, fields = {}) => port.dispatch({ intentId, type, ...fields });
const advanceTo = (port, elapsedMs) => port.advance(Math.max(0, elapsedMs - port.getViewModel().clock.elapsedMs));

function cleanupAll(port, prefix) {
  const seats = port.getViewModel().seats.filter((seat) => seat.cleanupNeeded);
  seats.forEach((seat) => dispatch(port, `${prefix}:${seat.seatId}`, D1_UI_INTENT.BEGIN_CLEANUP, {
    seatId: seat.seatId,
  }));
  if (seats.length) port.advance(3_000);
}

describe('D4 전체 영업 종단', () => {
  it('8개 주문을 모두 제공·정리·정산하고 D5 및 카와를 한 번만 해금한다', async () => {
    const storage = new MemoryStorageAdapter();
    const session = await createD1BusinessDayBrowserSession({
      definition,
      storagePort: storage,
      developmentStartDay: 'd4',
    });
    expect(session).toMatchObject({ ok: true, completed: false });
    const { port } = session;

    definition.waves.forEach((wave, waveIndex) => {
      advanceTo(port, wave.atMs);
      port.advance(definition.timingMs.thinkMax);
      for (const customer of wave.customers) {
        expect(dispatch(
          port,
          `d4:accept:${customer.order.id}`,
          D1_UI_INTENT.ACCEPT_ORDER,
          { orderId: customer.order.id },
        ).ok).toBe(true);
        customer.order.lines.forEach((line, lineIndex) => {
          for (let itemIndex = 0; itemIndex < line.quantity; itemIndex += 1) {
            expect(dispatch(
              port,
              `d4:serve:${customer.order.id}:${lineIndex}:${itemIndex}`,
              D1_UI_INTENT.SERVE_ITEM,
              {
                customerId: customer.id,
                menuId: line.menuId,
                seasoning: line.seasoning,
                quality: line.menuId === 'cabbage-salad' ? null : 'Perfect',
              },
            ).ok).toBe(true);
          }
        });
      }
      port.advance(definition.timingMs.eat + definition.timingMs.leave);
      cleanupAll(port, `d4:cleanup:${waveIndex}`);
    });

    advanceTo(port, definition.sessionTargetMs);
    cleanupAll(port, 'd4:cleanup:final');
    expect(port.getViewModel()).toMatchObject({
      phase: 'charcoal-down',
      closing: { unfinishedOrderCount: 0, cleanupSeatCount: 0, canLowerCharcoal: true },
    });
    expect(dispatch(port, 'd4:charcoal', D1_UI_INTENT.LOWER_CHARCOAL).ok).toBe(true);
    D1_SETTLEMENT_STEPS.forEach((_, index) => {
      expect(dispatch(port, `d4:settlement:${index}`, D1_UI_INTENT.REVEAL_SETTLEMENT_STEP).ok).toBe(true);
    });

    const completed = await port.finalize();
    expect(completed).toMatchObject({ ok: true, duplicate: false });
    expect(completed.settlement).toMatchObject({
      customers: { visited: 8, lost: 0, cleanedSeats: 8 },
      orders: { accepted: 8, completed: 8, abandoned: 0 },
      quality: { Perfect: 14, Good: 0, OK: 0, Fail: 0 },
      economy: { revenue: 70, tip: 16, total: 86 },
    });
    expect(session.bridge.getState()).toMatchObject({
      campaign: {
        nodeId: 'd5',
        phase: 'pre-open',
        completedDayIds: ['d1', 'd2', 'd3', 'd4'],
      },
      progression: { unlockIds: expect.arrayContaining(['day-d5', 'menu-kawa']) },
      story: { flagIds: expect.arrayContaining(['d4-complete', 'cabbage-salad-introduced', 'highball-introduced']) },
    });
    expect(await port.finalize()).toMatchObject({ ok: true, duplicate: true });
  });
});
