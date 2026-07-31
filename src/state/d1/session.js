// D1 첫 손님 주문의 순수 상태 머신.
//
// 이 모듈은 DOM/Three.js와 분리돼 있으며, 모든 시간은 호출자가 단조 증가 ms로 전달한다.
// 완료품은 주문에 귀속하지 않고 `prepared` 공용 목록에만 보관한다 (GPL-004 §50~52).

export const D1_ORDER_ID = 'D1-ORDER-001';
export const D1_CUSTOMER_ID = 'REGULAR_TSUKIOKA';

export const D1_PHASE = Object.freeze({
  ENTERING: 'entering',
  ORDERING: 'ordering',
  DRINK: 'drink',
  DRINK_SERVE: 'drinkServe',
  ASSEMBLY: 'assembly',
  GRILL: 'grill',
  FOOD_SERVE: 'foodServe',
  REACTION: 'reaction',
  COMPLETE: 'complete',
});

export const QUALITY = Object.freeze({
  PERFECT: 'Perfect',
  GOOD: 'Good',
  OK: 'OK',
  FAIL: 'Fail',
});

export const QUALITY_SCORE = Object.freeze({
  [QUALITY.PERFECT]: 100,
  [QUALITY.GOOD]: 40,
  [QUALITY.OK]: 10,
  [QUALITY.FAIL]: 0,
});

export const QUALITY_SALE_RATE = Object.freeze({
  [QUALITY.PERFECT]: 10,
  [QUALITY.GOOD]: 7,
  [QUALITY.OK]: 4,
  [QUALITY.FAIL]: 1,
});

export const MENU = Object.freeze({
  NEGIMA: 'negima',
  DRAFT_BEER: 'draft-beer',
});

const NEGIMA_RECIPE = Object.freeze(['chicken', 'leek', 'chicken', 'leek', 'chicken']);
const BEER_TARGET_MS = 3000;
const FOAM_TARGET_MS = 1000;
const BEER_TOLERANCE_MS = 700;
const BEER_OVERFLOW_MS = 4700;
const GRILL = Object.freeze({ perfectAtMs: 8000, overAtMs: 16000, burntAtMs: 21000 });

function clonePrepared(prepared) {
  return prepared.map((card) => ({ ...card }));
}

function item(menuId, quantity, preparation) {
  return { menuId, quantity, preparation, delivered: [] };
}

function contentCustomer(bundle) {
  const customer = (bundle?.customers || []).find((record) => record.id === 'regular');
  const recipe = (bundle?.recipes || []).find((record) => record.id === 'negima');
  const grill = (bundle?.processes || []).find((record) => record.id === 'grill-negima');
  if (!customer || !recipe || !grill) {
    throw new Error('D1에 필요한 regular 손님, 네기마 레시피 또는 그릴 콘텐츠가 없습니다.');
  }
  const drinks = customer.orderSequence.filter((entry) => entry === 'drink').length;
  const skewers = customer.orderSequence.filter((entry) => entry === 'skewer').length;
  if (drinks !== 1 || skewers !== 2) {
    throw new Error('D1 regular 손님 콘텐츠는 생맥주 1잔과 네기마 2개여야 합니다.');
  }
  return { customer, recipe, grill };
}

/**
 * D1 콘텐츠에서 첫 주문을 만든다. 콘텐츠 번들을 생략하면 정본과 같은 최소 fixture를 쓴다.
 */
export function createD1Session(bundle) {
  let source = { customerId: 'regular', recipeId: 'negima', processId: 'grill-negima' };
  if (bundle) {
    const resolved = contentCustomer(bundle);
    source = {
      customerId: resolved.customer.id,
      recipeId: resolved.recipe.id,
      processId: resolved.grill.id,
    };
  }

  return {
    phase: D1_PHASE.ENTERING,
    source,
    customer: {
      id: D1_CUSTOMER_ID,
      state: 'entering',
      reaction: null,
    },
    order: {
      id: D1_ORDER_ID,
      items: [item(MENU.DRAFT_BEER, 1, 'draft'), item(MENU.NEGIMA, 2, 'salt')],
    },
    beer: { beerMs: 0, foamMs: 0, pouring: null, startedAtMs: null, overflowed: false },
    skewers: [1, 2].map((number) => ({
      id: `negima-${number}`,
      assemblyIndex: 0,
      state: 'assembly',
      slot: null,
      side: 'front',
      sideStartedAtMs: null,
      frontResult: null,
      backResult: null,
    })),
    grillSlots: [null, null],
    prepared: [],
    pendingService: null,
    orderSatisfaction: null,
    lastInvalidAction: null,
  };
}

export function enterCustomer(state) {
  if (state.phase !== D1_PHASE.ENTERING) return state;
  return { ...state, phase: D1_PHASE.ORDERING, customer: { ...state.customer, state: 'ordering' } };
}

export function acceptOrder(state) {
  if (state.phase !== D1_PHASE.ORDERING) return state;
  return { ...state, phase: D1_PHASE.DRINK, customer: { ...state.customer, state: 'waiting' } };
}

function invalid(state, action) {
  // 입력 실수는 주문·수량·타이머를 포함한 세션 상태를 전혀 바꾸지 않는다.
  // 화면의 일시적 경고는 DOM 이벤트 계층이 보유한다.
  void action;
  return state;
}

function beerWithinRange(value, target) {
  return value >= target - BEER_TOLERANCE_MS && value <= target + BEER_TOLERANCE_MS;
}

export function gradeBeer({ beerMs, foamMs, overflowed = false }) {
  if (overflowed) return QUALITY.FAIL;
  const misses = Number(!beerWithinRange(beerMs, BEER_TARGET_MS)) + Number(!beerWithinRange(foamMs, FOAM_TARGET_MS));
  return misses === 0 ? QUALITY.PERFECT : misses === 1 ? QUALITY.GOOD : QUALITY.OK;
}

export function gradeNegima(frontResult, backResult) {
  if (frontResult === 'burnt' && backResult === 'burnt') return null; // 완전 탄은 제공 불가
  if (frontResult === 'burnt' || backResult === 'burnt') return QUALITY.FAIL;
  if (frontResult === 'perfect' && backResult === 'perfect') return QUALITY.PERFECT;
  if ((frontResult === 'perfect' && backResult === 'over') || (frontResult === 'over' && backResult === 'perfect')) return QUALITY.GOOD;
  if ((frontResult === 'over' && backResult === 'over') ||
      (frontResult === 'perfect' && backResult === 'under') ||
      (frontResult === 'under' && backResult === 'perfect')) return QUALITY.OK;
  return QUALITY.FAIL;
}

export function donenessAt(elapsedMs) {
  if (elapsedMs >= GRILL.burntAtMs) return 'burnt';
  if (elapsedMs >= GRILL.overAtMs) return 'over';
  if (elapsedMs >= GRILL.perfectAtMs) return 'perfect';
  return 'under';
}

function addPrepared(prepared, { menuId, preparation, quality }) {
  const next = clonePrepared(prepared);
  const existing = next.find((card) => card.menuId === menuId && card.preparation === preparation && card.quality === quality);
  if (existing) existing.quantity += 1;
  else next.push({ id: `${menuId}:${preparation}:${quality}`, menuId, preparation, quality, quantity: 1 });
  return next;
}

function takePrepared(prepared, cardId, quantity) {
  const next = clonePrepared(prepared);
  const index = next.findIndex((card) => card.id === cardId);
  if (index < 0 || next[index].quantity < quantity) return null;
  next[index].quantity -= quantity;
  if (next[index].quantity === 0) next.splice(index, 1);
  return next;
}

export function startBeerPour(state, part, nowMs) {
  if (state.phase !== D1_PHASE.DRINK || state.beer.overflowed || state.beer.pouring) return invalid(state, 'startBeerPour');
  if (part !== 'beer' && part !== 'foam') return invalid(state, 'unknownPourPart');
  if (part === 'foam' && state.beer.beerMs === 0) return invalid(state, 'foamBeforeBeer');
  return { ...state, beer: { ...state.beer, pouring: part, startedAtMs: nowMs }, lastInvalidAction: null };
}

export function stopBeerPour(state, nowMs) {
  if (!state.beer.pouring || state.beer.startedAtMs == null) return invalid(state, 'stopBeerPour');
  const heldMs = Math.max(0, nowMs - state.beer.startedAtMs);
  const nextBeer = { ...state.beer, pouring: null, startedAtMs: null };
  if (nextBeer.pouring === 'beer') nextBeer.beerMs += heldMs;
  // `pouring` was cleared above; use the old value to decide the layer.
  const pouredPart = state.beer.pouring;
  if (pouredPart === 'beer') nextBeer.beerMs = state.beer.beerMs + heldMs;
  else nextBeer.foamMs = state.beer.foamMs + heldMs;
  if (nextBeer.beerMs + nextBeer.foamMs > BEER_OVERFLOW_MS) nextBeer.overflowed = true;
  return { ...state, beer: nextBeer, lastInvalidAction: null };
}

// 테스트·접근성 대체 입력에서 같은 레버를 특정 시간만 누른 결과를 만들기 위한 편의 함수.
export function pourBeerFor(state, part, durationMs, nowMs = 0) {
  const started = startBeerPour(state, part, nowMs);
  return started === state || !started.beer.pouring ? started : stopBeerPour(started, nowMs + Math.max(0, durationMs));
}

export function finishBeer(state) {
  if (state.phase !== D1_PHASE.DRINK || state.beer.pouring || state.beer.overflowed ||
      state.beer.beerMs === 0 || state.beer.foamMs === 0) return invalid(state, 'finishBeer');
  const quality = gradeBeer(state.beer);
  return {
    ...state,
    phase: D1_PHASE.DRINK_SERVE,
    beer: { beerMs: 0, foamMs: 0, pouring: null, startedAtMs: null, overflowed: false },
    prepared: addPrepared(state.prepared, { menuId: MENU.DRAFT_BEER, preparation: 'draft', quality }),
    lastInvalidAction: null,
  };
}

export function resolveBeerOverflow(state, choice) {
  if (state.phase !== D1_PHASE.DRINK || !state.beer.overflowed) return invalid(state, 'resolveBeerOverflow');
  const resetBeer = { beerMs: 0, foamMs: 0, pouring: null, startedAtMs: null, overflowed: false };
  if (choice === 'discard') return { ...state, beer: resetBeer, lastInvalidAction: null };
  if (choice === 'serve') {
    return {
      ...state,
      phase: D1_PHASE.DRINK_SERVE,
      beer: resetBeer,
      prepared: addPrepared(state.prepared, { menuId: MENU.DRAFT_BEER, preparation: 'draft', quality: QUALITY.FAIL }),
      lastInvalidAction: null,
    };
  }
  return invalid(state, 'unknownOverflowChoice');
}

function findSkewer(state, skewerId) {
  return state.skewers.find((skewer) => skewer.id === skewerId);
}

export function addIngredient(state, skewerId, ingredient) {
  if (state.phase !== D1_PHASE.ASSEMBLY) return invalid(state, 'addIngredientOutsideAssembly');
  const current = findSkewer(state, skewerId);
  if (!current || current.state !== 'assembly') return invalid(state, 'unknownOrFinishedSkewer');
  const expected = NEGIMA_RECIPE[current.assemblyIndex];
  if (ingredient !== expected) return invalid(state, 'recipeMismatch');
  const skewers = state.skewers.map((skewer) => {
    if (skewer.id !== skewerId) return skewer;
    const assemblyIndex = skewer.assemblyIndex + 1;
    return { ...skewer, assemblyIndex, state: assemblyIndex === NEGIMA_RECIPE.length ? 'queue' : 'assembly' };
  });
  return { ...state, skewers, lastInvalidAction: null };
}

export function beginFoodAssembly(state) {
  if (state.phase !== D1_PHASE.DRINK_SERVE || remainingQuantity(state.order, MENU.DRAFT_BEER) !== 0) {
    return invalid(state, 'beginFoodAssembly');
  }
  return { ...state, phase: D1_PHASE.ASSEMBLY, lastInvalidAction: null };
}

export function placeOnGrill(state, skewerId, slotIndex, nowMs) {
  if (state.phase !== D1_PHASE.GRILL || slotIndex < 0 || slotIndex >= state.grillSlots.length || state.grillSlots[slotIndex] != null) {
    return invalid(state, 'placeOnGrill');
  }
  const current = findSkewer(state, skewerId);
  if (!current || current.state !== 'queue') return invalid(state, 'placeNonQueuedSkewer');
  const skewers = state.skewers.map((skewer) => skewer.id === skewerId
    ? { ...skewer, state: 'grilling', slot: slotIndex, side: 'front', sideStartedAtMs: nowMs }
    : skewer);
  const grillSlots = [...state.grillSlots];
  grillSlots[slotIndex] = skewerId;
  return { ...state, skewers, grillSlots, lastInvalidAction: null };
}

function sideDoneness(skewer, nowMs) {
  return donenessAt(Math.max(0, nowMs - skewer.sideStartedAtMs));
}

export function turnSkewer(state, skewerId, nowMs, { confirmEarly = false } = {}) {
  if (state.phase !== D1_PHASE.GRILL) return invalid(state, 'turnOutsideGrill');
  const current = findSkewer(state, skewerId);
  if (!current || current.state !== 'grilling' || current.side !== 'front') return invalid(state, 'turnInvalidSkewer');
  const result = sideDoneness(current, nowMs);
  if (result === 'under' && !confirmEarly) return invalid(state, 'turnTooEarly');
  const skewers = state.skewers.map((skewer) => skewer.id === skewerId
    ? { ...skewer, side: 'back', sideStartedAtMs: nowMs, frontResult: result }
    : skewer);
  return { ...state, skewers, lastInvalidAction: null };
}

export function collectSkewer(state, skewerId, nowMs, { confirmEarly = false } = {}) {
  if (state.phase !== D1_PHASE.GRILL) return invalid(state, 'collectOutsideGrill');
  const current = findSkewer(state, skewerId);
  if (!current || current.state !== 'grilling' || current.side !== 'back') return invalid(state, 'collectInvalidSkewer');
  const backResult = sideDoneness(current, nowMs);
  if (backResult === 'under' && !confirmEarly) return invalid(state, 'collectTooEarly');
  const quality = gradeNegima(current.frontResult, backResult);
  const skewers = state.skewers.map((skewer) => skewer.id === skewerId
    ? { ...skewer, state: quality ? 'prepared' : 'discarded', slot: null, backResult, sideStartedAtMs: null }
    : skewer);
  const grillSlots = state.grillSlots.map((id) => id === skewerId ? null : id);
  return {
    ...state,
    skewers,
    grillSlots,
    prepared: quality ? addPrepared(state.prepared, { menuId: MENU.NEGIMA, preparation: 'salt', quality }) : state.prepared,
    lastInvalidAction: null,
  };
}

export function readyForGrill(state) {
  return state.skewers.every((skewer) => skewer.state === 'queue' || skewer.state === 'grilling' || skewer.state === 'prepared');
}

export function beginGrill(state) {
  if (state.phase !== D1_PHASE.ASSEMBLY || !state.skewers.every((skewer) => skewer.state === 'queue')) return invalid(state, 'beginGrill');
  return { ...state, phase: D1_PHASE.GRILL, lastInvalidAction: null };
}

function remainingQuantity(order, menuId) {
  const orderItem = order.items.find((entry) => entry.menuId === menuId);
  return orderItem ? orderItem.quantity - orderItem.delivered.length : 0;
}

function matchingUnservedItem(order, card) {
  return order.items.find((entry) => entry.menuId === card.menuId && entry.preparation === card.preparation && entry.delivered.length < entry.quantity);
}

export function beginServing(state, cardId) {
  if (state.pendingService || state.customer.state === 'left') return invalid(state, 'beginServing');
  const card = state.prepared.find((entry) => entry.id === cardId);
  const target = card && matchingUnservedItem(state.order, card);
  if (!card || !target) return invalid(state, 'mismatchedPreparedItem');
  return {
    ...state,
    pendingService: { cardId, menuId: card.menuId, quantity: Math.min(card.quantity, target.quantity - target.delivered.length) },
    lastInvalidAction: null,
  };
}

export function cancelServing(state) {
  if (!state.pendingService) return state;
  return { ...state, pendingService: null };
}

export function confirmServing(state, choice) {
  const pending = state.pendingService;
  if (!pending || (choice !== 'one' && choice !== 'all')) return invalid(state, 'confirmServing');
  const card = state.prepared.find((entry) => entry.id === pending.cardId);
  const target = card && matchingUnservedItem(state.order, card);
  if (!card || !target) return { ...state, pendingService: null, lastInvalidAction: 'staleServing' };
  const quantity = choice === 'one' ? 1 : Math.min(pending.quantity, card.quantity, target.quantity - target.delivered.length);
  if (quantity < 1) return { ...state, pendingService: null, lastInvalidAction: 'emptyServing' };
  const prepared = takePrepared(state.prepared, card.id, quantity);
  const order = {
    ...state.order,
    items: state.order.items.map((entry) => entry === target
      ? { ...entry, delivered: [...entry.delivered, ...Array(quantity).fill(card.quality)] }
      : entry),
  };
  const allFoodDelivered = remainingQuantity(order, MENU.NEGIMA) === 0;
  const drinkDelivered = remainingQuantity(order, MENU.DRAFT_BEER) === 0;
  let phase = state.phase;
  let customer = state.customer;
  if (drinkDelivered && !allFoodDelivered) {
    phase = D1_PHASE.DRINK_SERVE;
    customer = { ...customer, state: 'partially-served', reaction: 'drinking' };
  }
  if (allFoodDelivered && drinkDelivered) {
    phase = D1_PHASE.REACTION;
    customer = { ...customer, state: 'reacting' };
  }
  return { ...state, order, prepared, pendingService: null, phase, customer, lastInvalidAction: null };
}

export function calculateOrderSatisfaction(order) {
  const values = order.items.flatMap((entry) => entry.delivered.map((quality) => QUALITY_SCORE[quality]));
  if (values.length === 0) return null;
  return values.reduce((sum, score) => sum + score, 0) / values.length;
}

export function completeReaction(state) {
  if (state.phase !== D1_PHASE.REACTION) return invalid(state, 'completeReaction');
  const orderSatisfaction = calculateOrderSatisfaction(state.order);
  const reaction = orderSatisfaction >= 70 ? 'satisfied' : orderSatisfaction >= 10 ? 'neutral' : 'angry';
  return {
    ...state,
    phase: D1_PHASE.COMPLETE,
    customer: { ...state.customer, state: 'completed', reaction },
    orderSatisfaction,
    lastInvalidAction: null,
  };
}

export function advanceFromPreparedFood(state) {
  if (state.phase !== D1_PHASE.GRILL || !state.skewers.every((skewer) => skewer.state === 'prepared' || skewer.state === 'discarded')) {
    return invalid(state, 'advanceFromPreparedFood');
  }
  return { ...state, phase: D1_PHASE.FOOD_SERVE, lastInvalidAction: null };
}

export function orderItemProgress(state, menuId) {
  const target = state.order.items.find((entry) => entry.menuId === menuId);
  return target ? { delivered: target.delivered.length, total: target.quantity, remaining: target.quantity - target.delivered.length } : null;
}
