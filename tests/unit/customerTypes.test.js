import { describe, it, expect } from 'vitest';
import { CUSTOMER_STATE, CUSTOMER_TIMERS, MOOD, SATISFACTION } from '../../src/state/customer/customer.js';
import {
  createSolo,
  createOfficeWorker,
  createFoodBlogger,
  createCouple,
  createCustomerByIndex,
  CUSTOMER_FACTORIES,
} from '../../src/state/customer/types.js';

const T = CUSTOMER_TIMERS;

function advanceToWaiting(c, startMs = 0) {
  c.update(startMs);
  c.update(startMs + T.entering);
  c.update(startMs + T.entering + T.ordering);
  return startMs + T.entering + T.ordering;
}

// 식사 종료까지 진행시켜 다음 슬롯(재주문) 또는 퇴장으로 넘긴다
function finishEating(c, servedAtMs) {
  c.update(servedAtMs + T.eating);
  return servedAtMs + T.eating;
}

const perfectServe = { category: 'skewer', recipeMatched: true, frontResult: 'perfect', backResult: 'perfect' };
const overServe = { category: 'skewer', recipeMatched: true, frontResult: 'over', backResult: 'perfect' };

describe('유형별 주문 순서열', () => {
  it('혼술족은 [꼬치] 단일 슬롯이다', () => {
    expect(createSolo().orderSequence).toEqual(['skewer']);
  });

  it('퇴근직장인은 음료 슬롯이 빠져 [꼬치, 꼬치] 다중 슬롯이 된다', () => {
    // 드링크 스테이션 미구현 → 음료 제거, 재주문 검증은 이 순서열로 (GPL-002 §예외)
    expect(createOfficeWorker().orderSequence).toEqual(['skewer', 'skewer']);
  });

  it('미식블로거·커플은 [꼬치] 단일 슬롯이다', () => {
    expect(createFoodBlogger().orderSequence).toEqual(['skewer']);
    expect(createCouple().orderSequence).toEqual(['skewer']);
  });
});

describe('다중 슬롯 재주문 (퇴근직장인)', () => {
  it('첫 슬롯 식사 후 재주문으로 Ordering에 복귀한다', () => {
    const c = createOfficeWorker();
    const served = advanceToWaiting(c);
    c.onServed(perfectServe, served);
    expect(c.slotIndex).toBe(0);

    const ate = finishEating(c, served);
    expect(c.state).toBe(CUSTOMER_STATE.ORDERING); // 재주문
    expect(c.slotIndex).toBe(1);

    // 두 번째 슬롯도 같은 흐름을 거친다
    c.update(ate + T.ordering);
    expect(c.state).toBe(CUSTOMER_STATE.WAITING);
    const accepted = c.onServed(perfectServe, ate + T.ordering);
    expect(accepted).toBe(true);
    expect(c.results).toHaveLength(2);
  });

  it('마지막 슬롯 식사 후에는 퇴장한다', () => {
    const c = createOfficeWorker();
    const served = advanceToWaiting(c);
    c.onServed(perfectServe, served);
    const ate = finishEating(c, served);

    c.update(ate + T.ordering);
    c.onServed(perfectServe, ate + T.ordering);
    const ate2 = finishEating(c, ate + T.ordering);

    expect(c.state).toBe(CUSTOMER_STATE.LEAVING);
    c.update(ate2 + T.leaving);
    expect(c.state).toBe(CUSTOMER_STATE.DONE);
  });
});

describe('미식블로거 판정', () => {
  it('양면 perfect면 좋은 판정과 높은 리뷰를 남긴다', () => {
    const c = createFoodBlogger();
    const now = advanceToWaiting(c);
    c.onServed(perfectServe, now);
    expect(c.satisfaction).toBe(SATISFACTION.GOOD);
    expect(c.review).toBe(5);
  });

  it('perfect가 아니면 낮게 판정한다 — base보다 엄격하다', () => {
    const blogger = createFoodBlogger();
    const solo = createSolo();
    const b = advanceToWaiting(blogger);
    const s = advanceToWaiting(solo);

    const almost = { category: 'skewer', recipeMatched: true, frontResult: 'perfect', backResult: 'under' };
    blogger.onServed(almost, b);
    solo.onServed(almost, s);

    expect(blogger.satisfaction).toBe(SATISFACTION.LOW); // 엄격
    expect(solo.satisfaction).toBe(SATISFACTION.GOOD); // base는 통과
    expect(blogger.review).toBe(2);
    expect(blogger.mood).toBe(MOOD.MEH);
  });
});

describe('커플 판정', () => {
  it('양면 perfect면 팁 보너스를 받는다', () => {
    const couple = createCouple();
    const now = advanceToWaiting(couple);
    couple.onServed(perfectServe, now);
    expect(couple.satisfaction).toBe(SATISFACTION.GOOD);
    expect(couple.perfectBonusApplied).toBe(true);

    // 같은 서빙에서 base 유형보다 팁이 많다
    const solo = createSolo();
    const t = advanceToWaiting(solo);
    solo.onServed(perfectServe, t);
    expect(couple.tip).toBeGreaterThan(solo.tip);
  });

  it('perfect가 아니면 보너스가 없고 base와 같은 판정이다', () => {
    const couple = createCouple();
    const now = advanceToWaiting(couple);
    couple.onServed(overServe, now);
    expect(couple.satisfaction).toBe(SATISFACTION.LOW);
    expect(couple.perfectBonusApplied).toBe(false);
  });
});

describe('유형 스폰', () => {
  it('유형 4종을 순환 생성한다', () => {
    expect(CUSTOMER_FACTORIES).toHaveLength(4);
    const types = [0, 1, 2, 3, 4].map((i) => createCustomerByIndex(i).type);
    expect(types).toEqual(['solo', 'office', 'blogger', 'couple', 'solo']);
  });

  it('모든 유형이 유효한 순서열을 가진다', () => {
    for (const factory of CUSTOMER_FACTORIES) {
      const c = factory();
      expect(c.orderSequence.length).toBeGreaterThan(0);
      expect(c.state).toBe(CUSTOMER_STATE.ENTERING);
    }
  });
});
