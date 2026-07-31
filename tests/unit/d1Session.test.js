import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  D1_PHASE,
  MENU,
  QUALITY,
  QUALITY_SALE_RATE,
  QUALITY_SCORE,
  acceptOrder,
  addIngredient,
  advanceFromPreparedFood,
  beginFoodAssembly,
  beginGrill,
  beginServing,
  calculateOrderSatisfaction,
  collectSkewer,
  completeReaction,
  confirmServing,
  createD1Session,
  enterCustomer,
  finishBeer,
  gradeBeer,
  gradeNegima,
  orderItemProgress,
  placeOnGrill,
  pourBeerFor,
  turnSkewer,
} from '../../src/state/d1/session.js';

const root = new URL('../../', import.meta.url);
const read = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, root), 'utf8'));

function productionBundle() {
  return {
    customers: read('content/customers/types.json'),
    recipes: [read('content/recipes/negima.json')],
    processes: [read('content/processes/grill.json')],
  };
}

function ordered() {
  return acceptOrder(enterCustomer(createD1Session()));
}

function preparedBeer(state, beerMs = 3000, foamMs = 1000) {
  return finishBeer(pourBeerFor(pourBeerFor(state, 'beer', beerMs), 'foam', foamMs));
}

function withBeerServed() {
  const s = preparedBeer(ordered());
  const selected = beginServing(s, 'draft-beer:draft:Perfect');
  return confirmServing(selected, 'all');
}

function assembled(state) {
  let next = beginFoodAssembly(state);
  for (const skewer of next.skewers) {
    for (const ingredient of ['chicken', 'leek', 'chicken', 'leek', 'chicken']) {
      next = addIngredient(next, skewer.id, ingredient);
    }
  }
  return next;
}

function foodPrepared(state, timings = [[8000, 8000], [8000, 8000]]) {
  let next = beginGrill(assembled(state));
  next = placeOnGrill(next, 'negima-1', 0, 0);
  next = placeOnGrill(next, 'negima-2', 1, 0);
  for (const [id, timing] of [['negima-1', timings[0]], ['negima-2', timings[1]]]) {
    next = turnSkewer(next, id, timing[0]);
    next = collectSkewer(next, id, timing[0] + timing[1]);
  }
  return advanceFromPreparedFood(next);
}

describe('D1 주문 콘텐츠·입장', () => {
  it('production content bundle로 생맥주 1·네기마 2 세션을 생성한다', () => {
    const state = createD1Session(productionBundle());
    expect(state.source).toEqual({
      customerId: 'regular',
      recipeId: 'negima',
      processId: 'grill-negima',
    });
    expect(state.order.items).toEqual([
      expect.objectContaining({ menuId: MENU.DRAFT_BEER, quantity: 1 }),
      expect.objectContaining({ menuId: MENU.NEGIMA, quantity: 2 }),
    ]);
    expect(state.skewers.map(({ id }) => id)).toEqual(['negima-1', 'negima-2']);
  });

  it('첫 손님은 입장→주문 접수 후 생맥주 1·네기마 2 주문으로 대기한다', () => {
    const entering = createD1Session();
    expect(entering.phase).toBe(D1_PHASE.ENTERING);
    const waiting = ordered();
    expect(waiting.customer.state).toBe('waiting');
    expect(waiting.phase).toBe(D1_PHASE.DRINK);
    expect(orderItemProgress(waiting, MENU.DRAFT_BEER)).toEqual({ delivered: 0, total: 1, remaining: 1 });
    expect(orderItemProgress(waiting, MENU.NEGIMA)).toEqual({ delivered: 0, total: 2, remaining: 2 });
  });
});

describe('생맥주 단일 레버·부분 제공', () => {
  it('3초 맥주와 1초 거품은 Perfect 완성품이 되어 공용 준비 목록으로 이동한다', () => {
    const state = preparedBeer(ordered());
    expect(state.prepared).toEqual([{ id: 'draft-beer:draft:Perfect', menuId: 'draft-beer', preparation: 'draft', quality: QUALITY.PERFECT, quantity: 1 }]);
    expect(state.phase).toBe(D1_PHASE.DRINK_SERVE);
  });

  it('부분 제공 뒤 생맥주만 완료되고 네기마 2개는 주문에 남는다', () => {
    const state = withBeerServed();
    expect(state.customer.state).toBe('partially-served');
    expect(state.customer.reaction).toBe('drinking');
    expect(orderItemProgress(state, MENU.DRAFT_BEER).remaining).toBe(0);
    expect(orderItemProgress(state, MENU.NEGIMA).remaining).toBe(2);
  });

  it('각 단계 이탈 수에 따라 Perfect·Good·OK를 판정한다', () => {
    expect(gradeBeer({ beerMs: 3000, foamMs: 1000 })).toBe(QUALITY.PERFECT);
    expect(gradeBeer({ beerMs: 2000, foamMs: 1000 })).toBe(QUALITY.GOOD);
    expect(gradeBeer({ beerMs: 2000, foamMs: 2000 })).toBe(QUALITY.OK);
  });
});

describe('네기마 2개·2칸 독립 그릴', () => {
  it('두 꼬치를 독립 타이머로 회수한다', () => {
    const state = foodPrepared(withBeerServed());
    expect(state.phase).toBe(D1_PHASE.FOOD_SERVE);
    expect(state.grillSlots).toEqual([null, null]);
    expect(state.skewers.map((skewer) => skewer.state)).toEqual(['prepared', 'prepared']);
    expect(state.prepared).toEqual([{ id: 'negima:salt:Perfect', menuId: 'negima', preparation: 'salt', quality: QUALITY.PERFECT, quantity: 2 }]);
  });

  it('네기마 면 조합에 따라 Perfect·Good·OK를 만든다', () => {
    expect(gradeNegima('perfect', 'perfect')).toBe(QUALITY.PERFECT);
    expect(gradeNegima('perfect', 'over')).toBe(QUALITY.GOOD);
    expect(gradeNegima('over', 'over')).toBe(QUALITY.OK);
    expect(gradeNegima('perfect', 'under')).toBe(QUALITY.OK);
  });

  it('이른 회수·잘못된 재료·존재하지 않는 3번째 배치는 주문과 타이머를 훼손하지 않는다', () => {
    let state = beginFoodAssembly(withBeerServed());
    const beforeRecipe = state;
    state = addIngredient(state, 'negima-1', 'leek');
    expect(state.skewers[0].assemblyIndex).toBe(beforeRecipe.skewers[0].assemblyIndex);

    state = assembled(withBeerServed());
    state = beginGrill(state);
    state = placeOnGrill(state, 'negima-1', 0, 0);
    state = placeOnGrill(state, 'negima-2', 1, 0);
    const full = state;
    state = placeOnGrill(state, 'negima-3', 0, 100);
    expect(state.grillSlots).toEqual(full.grillSlots);
    state = turnSkewer(full, 'negima-1', 1000);
    expect(state.skewers[0].side).toBe('front');
    expect(state.skewers[0].sideStartedAtMs).toBe(0);
  });
});

describe('공용 완성품 수량 배정·최종 반응', () => {
  it('맞지 않는 완성품·취소·중복 확정은 공용 수량과 주문을 바꾸지 않는다', () => {
    const state = preparedBeer(ordered());
    const invalid = beginServing(state, 'negima:salt:Perfect');
    expect(invalid.prepared).toEqual(state.prepared);
    expect(invalid.order).toEqual(state.order);
    const selected = beginServing(state, 'draft-beer:draft:Perfect');
    const served = confirmServing(selected, 'all');
    const duplicated = confirmServing(served, 'all');
    expect(duplicated).toBe(served);
  });

  it('네기마 2개 전량 제공 뒤 수량 가중 만족도와 손님 반응을 완성한다', () => {
    const food = foodPrepared(withBeerServed());
    const selected = beginServing(food, 'negima:salt:Perfect');
    const reacting = confirmServing(selected, 'all');
    expect(reacting.phase).toBe(D1_PHASE.REACTION);
    const complete = completeReaction(reacting);
    expect(complete.phase).toBe(D1_PHASE.COMPLETE);
    expect(complete.orderSatisfaction).toBe(100);
    expect(complete.customer.reaction).toBe('satisfied');
  });

  it('만족도는 제공된 항목 수량으로 가중하고 품질 계약의 판매율·점수를 그대로 사용한다', () => {
    const order = { items: [
      { delivered: [QUALITY.PERFECT, QUALITY.PERFECT, QUALITY.PERFECT] },
      { delivered: [QUALITY.OK] },
    ] };
    expect(calculateOrderSatisfaction(order)).toBe(77.5);
    expect(QUALITY_SCORE).toEqual({ Perfect: 100, Good: 40, OK: 10, Fail: 0 });
    expect(QUALITY_SALE_RATE).toEqual({ Perfect: 10, Good: 7, OK: 4, Fail: 1 });
  });
});
