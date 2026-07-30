// Developer 3 작업 011의 구현 전 회귀 계약.
// GPL-004 v1.39.0 · GPL-003 v4.12.0을 구현하는 Developer 1·2가 이 파일을 green으로 만든다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  D1_QUALITY,
  advanceD1BusinessDay,
  createD1BusinessDayDefinition,
  createD1BusinessDayState,
  dispatchD1Command,
} from '../../src/campaign-runtime.js';
import { createCookStations } from '../../src/render/cookStations.js';

const NEGIMA = ['chicken', 'leek', 'chicken', 'leek', 'chicken'];
const businessDayFixture = JSON.parse(readFileSync(fileURLToPath(
  new URL('../fixtures/business-days/d1-full-day.json', import.meta.url),
), 'utf8'));
const definition = createD1BusinessDayDefinition(businessDayFixture);

function activeNegima() {
  const cook = createCookStations({ slots: 1 });
  NEGIMA.forEach((ingredient) => cook.clickIngredient(ingredient));
  expect(cook.placeToGrill(0)).toMatchObject({ ok: true, slot: 0 });
  return cook;
}

function flip(cook, atMs) {
  const result = cook.clickSlot(0, atMs);
  expect(result).toMatchObject({ ok: true, flipped: true });
  return result;
}

function dispatch(state, eventId, type, fields = {}) {
  return dispatchD1Command(state, definition, { eventId, type, ...fields });
}

function completeFirstOrder() {
  let state = createD1BusinessDayState({
    definition,
    runId: 'developer-3:011',
    seed: 11,
  });
  state = advanceD1BusinessDay(state, definition, 6_000);
  state = dispatch(state, 'accept:D1-ORDER-001', 'accept-order', {
    orderId: 'D1-ORDER-001',
  }).state;
  for (const [menuId, index] of [
    ['beer', 1],
    ['negima', 1],
    ['negima', 2],
    ['negima', 3],
  ]) {
    state = dispatch(state, `serve:first:${menuId}:${index}`, 'serve-item', {
      customerId: 'REGULAR_TSUKIOKA',
      menuId,
      quality: D1_QUALITY.PERFECT,
    }).state;
  }
  return state;
}

describe('작업 011 — active 꼬치의 누적 면 시간과 최종 품질', () => {
  it('D3-011-NEXT-ACTION-PROJECTION: 잠금 종료 under 상태는 flip, 양면 준비 상태는 retrieve를 투영한다', () => {
    const underCook = activeNegima();
    const underSnapshot = underCook.snapshot(0);
    underSnapshot.grill[0] = {
      ...underSnapshot.grill[0],
      status: 'back',
      orientationFaceDown: 'back',
      contactFace: 'back',
      elapsedSec: { front: 3, back: 0 },
      lastUpdatedAt: 0,
      flip: null,
      inputLockedUntil: 0,
    };
    expect(underCook.restore(underSnapshot, 0)).toEqual({ ok: true });
    expect(underCook.slotViews(0)[0]).toMatchObject({
      frontElapsedSec: 3,
      backElapsedSec: 0,
      contactFace: 'back',
      flipping: false,
      inputLocked: false,
      nextAction: 'flip',
    });

    const readyCook = activeNegima();
    const readySnapshot = readyCook.snapshot(0);
    readySnapshot.grill[0] = {
      ...readySnapshot.grill[0],
      status: 'back',
      orientationFaceDown: 'back',
      contactFace: 'back',
      elapsedSec: { front: 8, back: 8 },
      lastUpdatedAt: 0,
      flip: null,
      inputLockedUntil: 0,
    };
    expect(readyCook.restore(readySnapshot, 0)).toEqual({ ok: true });
    expect(readyCook.slotViews(0)[0]).toMatchObject({
      frontElapsedSec: 8,
      backElapsedSec: 8,
      contactFace: 'back',
      flipping: false,
      inputLocked: false,
      nextAction: 'retrieve',
    });
  });

  it('D3-011-FLIP-ACCUMULATE-8-8: 앞 3초→뒤 4초→앞 5초→뒤 4초를 누적해 최종 8초/8초가 된다', () => {
    const cook = activeNegima();

    flip(cook, 3_000);
    flip(cook, 7_300);
    flip(cook, 12_600);

    expect(cook.slotViews(16_900)[0]).toMatchObject({
      contactFace: 'back',
      frontElapsedSec: 8,
      backElapsedSec: 8,
    });
  });

  it('D3-011-FINAL-QUALITY-NOT-FROZEN: 최초 앞면 3초의 under를 고정하지 않고 회수 시 최종 8초/8초로 품질을 계산한다', () => {
    const cook = activeNegima();

    flip(cook, 3_000);
    flip(cook, 7_300);
    flip(cook, 12_600);
    const result = cook.clickSlot(0, 16_900);

    expect(result).toMatchObject({
      ok: true,
      retrieved: true,
      quality: {
        grade: 'Perfect',
        frontResult: 'perfect',
        backResult: 'perfect',
      },
    });
  });
});

describe('작업 011 — 선택한 손님 중심 공용 완성품 제공', () => {
  it('D3-011-NEGIMA-BEFORE-BEER: D1-ORDER-001은 네기마를 생맥주보다 먼저 제공해도 적용한다', () => {
    let state = createD1BusinessDayState({
      definition,
      runId: 'developer-3:011',
      seed: 11,
    });
    state = advanceD1BusinessDay(state, definition, 6_000);
    state = dispatch(state, 'accept:first', 'accept-order', {
      orderId: 'D1-ORDER-001',
    }).state;

    const result = dispatch(state, 'serve:first:negima', 'serve-item', {
      customerId: 'REGULAR_TSUKIOKA',
      menuId: 'negima',
      quality: D1_QUALITY.PERFECT,
    });

    expect(result).toMatchObject({
      applied: true,
      partial: true,
      remaining: 3,
    });
    expect(result.state.orders['D1-ORDER-001'].lines).toEqual([
      expect.objectContaining({ menuId: 'beer', servedQualities: [] }),
      expect.objectContaining({ menuId: 'negima', servedQualities: [D1_QUALITY.PERFECT] }),
    ]);
  });

  it('D3-011-LATER-CUSTOMER-FIRST: 먼저 접수한 손님 A를 건너뛰고 나중에 접수한 손님 B에게 먼저 제공해도 적용한다', () => {
    let state = completeFirstOrder();
    state = advanceD1BusinessDay(state, definition, 100_000 - state.clock.elapsedMs);
    state = advanceD1BusinessDay(state, definition, 6_000);
    state = dispatch(state, 'accept:office-a', 'accept-order', {
      orderId: 'D1-ORDER-002-A',
    }).state;
    state = dispatch(state, 'accept:office-b', 'accept-order', {
      orderId: 'D1-ORDER-002-B',
    }).state;

    const result = dispatch(state, 'serve:office-b:first', 'serve-item', {
      customerId: 'D1-OFFICE-B',
      menuId: 'beer',
      quality: D1_QUALITY.PERFECT,
    });

    expect(result).toMatchObject({ applied: true, partial: true, remaining: 1 });
    expect(result.state.orders['D1-ORDER-002-A'].lines)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ menuId: 'beer', servedQualities: [] }),
      ]));
    expect(result.state.orders['D1-ORDER-002-B'].lines)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ menuId: 'beer', servedQualities: [D1_QUALITY.PERFECT] }),
      ]));
    expect(result.state.ledger.at(-1)).toMatchObject({
      customerId: 'D1-OFFICE-B',
      orderId: 'D1-ORDER-002-B',
      menuId: 'beer',
    });
  });
});
