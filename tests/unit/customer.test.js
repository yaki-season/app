import { describe, it, expect } from 'vitest';
import {
  Customer,
  CUSTOMER_STATE,
  CUSTOMER_TIMERS,
  MOOD,
  SATISFACTION,
} from '../../src/state/customer/customer.js';
import { createSolo } from '../../src/state/customer/types.js';

const T = CUSTOMER_TIMERS;

// 착석 후 대기까지 진행시키는 도우미 (모의 시간)
function advanceToWaiting(c, startMs = 0) {
  c.update(startMs); // stateStartMs 설정, entering
  c.update(startMs + T.entering); // → ordering
  c.update(startMs + T.entering + T.ordering); // → waiting
  return startMs + T.entering + T.ordering;
}

const goodServe = { category: 'skewer', recipeMatched: true, frontResult: 'perfect', backResult: 'perfect' };

describe('손님 base 상태 머신', () => {
  it('혼술족은 순서열 [꼬치]로 시작하고 Entering 상태다', () => {
    const c = createSolo();
    expect(c.orderSequence).toEqual(['skewer']);
    expect(c.state).toBe(CUSTOMER_STATE.ENTERING);
  });

  it('시간에 따라 Entering→Ordering→Waiting으로 전이한다', () => {
    const c = createSolo();
    c.update(0);
    expect(c.state).toBe(CUSTOMER_STATE.ENTERING);
    c.update(T.entering);
    expect(c.state).toBe(CUSTOMER_STATE.ORDERING);
    c.update(T.entering + T.ordering);
    expect(c.state).toBe(CUSTOMER_STATE.WAITING);
  });

  it('한 번의 update는 최대 한 전이만 만든다', () => {
    const c = createSolo();
    c.update(0);
    // 아주 큰 시간을 줘도 entering→ordering 한 번만
    c.update(999999);
    expect(c.state).toBe(CUSTOMER_STATE.ORDERING);
  });

  it('Waiting에서 서빙을 받으면 Eating으로 가고 손님이 판정한다', () => {
    const c = createSolo();
    const now = advanceToWaiting(c);
    const accepted = c.onServed(goodServe, now);
    expect(accepted).toBe(true);
    expect(c.state).toBe(CUSTOMER_STATE.EATING);
    expect(c.satisfaction).toBe(SATISFACTION.GOOD);
    expect(c.mood).toBe(MOOD.HAPPY);
    expect(c.tip).toBeGreaterThan(0);
  });

  it('단일 슬롯은 식사 뒤 Leaving→Done으로 간다', () => {
    const c = createSolo();
    const now = advanceToWaiting(c);
    c.onServed(goodServe, now);
    c.update(now + T.eating); // → leaving
    expect(c.state).toBe(CUSTOMER_STATE.LEAVING);
    c.update(now + T.eating + T.leaving); // → done
    expect(c.state).toBe(CUSTOMER_STATE.DONE);
    expect(c.isDone()).toBe(true);
  });
});

describe('서빙 판정 규칙', () => {
  it('과다면 낮은 품질로 판정한다', () => {
    const c = createSolo();
    const now = advanceToWaiting(c);
    c.onServed({ category: 'skewer', recipeMatched: true, frontResult: 'over', backResult: 'perfect' }, now);
    expect(c.satisfaction).toBe(SATISFACTION.LOW);
    expect(c.mood).toBe(MOOD.MEH);
  });

  it('레시피가 틀리면 실패로 판정한다', () => {
    const c = createSolo();
    const now = advanceToWaiting(c);
    c.onServed({ category: 'skewer', recipeMatched: false, frontResult: 'perfect', backResult: 'perfect' }, now);
    expect(c.satisfaction).toBe(SATISFACTION.FAIL);
    expect(c.mood).toBe(MOOD.ANGRY);
  });
});

describe('서빙 경계', () => {
  it('Waiting이 아니면 서빙을 무시한다', () => {
    const c = createSolo();
    c.update(0); // entering
    const accepted = c.onServed(goodServe, 0);
    expect(accepted).toBe(false);
    expect(c.state).toBe(CUSTOMER_STATE.ENTERING);
  });

  it('대기 슬롯과 다른 카테고리는 무시한다', () => {
    const c = createSolo();
    const now = advanceToWaiting(c);
    const accepted = c.onServed({ ...goodServe, category: 'drink' }, now);
    expect(accepted).toBe(false);
    expect(c.state).toBe(CUSTOMER_STATE.WAITING);
  });

  it('Eating 중 추가 서빙은 무시한다', () => {
    const c = createSolo();
    const now = advanceToWaiting(c);
    c.onServed(goodServe, now);
    const second = c.onServed(goodServe, now);
    expect(second).toBe(false);
  });
});

describe('인내심 게이지 골격', () => {
  it('인내심은 비활성이라 Waiting에서 오래 있어도 퇴장하지 않는다', () => {
    const c = createSolo();
    const now = advanceToWaiting(c);
    expect(c.patienceEnabled).toBe(false);
    c.update(now + 999999);
    expect(c.state).toBe(CUSTOMER_STATE.WAITING);
  });
});

describe('숨김·복귀', () => {
  it('숨김 중 경과 시간은 상태 전이에 누적되지 않는다', () => {
    const c = createSolo();
    c.update(0); // entering 시작
    c.pause(100); // 0.1초 뒤 숨김
    c.update(100000); // 아주 오래 뒤
    expect(c.state).toBe(CUSTOMER_STATE.ENTERING); // 정지 상태 유지
    c.resume(100000);
    c.update(100000 + (T.entering - 100)); // 남은 시간만 채우면 전이
    expect(c.state).toBe(CUSTOMER_STATE.ORDERING);
  });
});
