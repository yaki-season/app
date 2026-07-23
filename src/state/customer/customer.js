// GPL-002 손님 상태와 유형 — base 손님 엔티티.
// 요리사(조리 리듀서)와 분리된 자율 상태 머신. 렌더링·DOM에 의존하지 않고
// 모든 시간 값은 호출자가 단조 증가 밀리초로 넘긴다 (GPL-002 §상세요구사항 14).

export const CUSTOMER_STATE = {
  ENTERING: 'entering',
  ORDERING: 'ordering',
  WAITING: 'waiting',
  EATING: 'eating',
  LEAVING: 'leaving',
  DONE: 'done',
};

export const MOOD = { HAPPY: 'happy', MEH: 'meh', ANGRY: 'angry' };
export const SATISFACTION = { GOOD: 'good', LOW: 'low', FAIL: 'fail' };

// 상태 체류 시간(ms). GPL-002 미해결(타이머 값)의 잠정 기본값.
export const CUSTOMER_TIMERS = {
  entering: 600,
  ordering: 400,
  eating: 1500,
  leaving: 600,
};

// 유형별 팁 배율. GPL-002 미해결(팁 배율)의 잠정 기본값.
const BASE_TIP = 10;

export class Customer {
  constructor({ type, orderSequence, patience = 'normal', tipMultiplier = 1 }) {
    this.type = type;
    this.orderSequence = orderSequence;
    this.slotIndex = 0;

    this.state = CUSTOMER_STATE.ENTERING;
    this.stateStartMs = null; // 첫 update에서 설정
    this.pausedAtMs = null;

    // 인내심 게이지 골격 — 이번 범위에서는 감소하지 않는다 (GPL-002 §상세요구사항 8).
    this.patience = patience;
    this.patienceEnabled = false;

    this.tipMultiplier = tipMultiplier;
    this.mood = null;
    this.tip = 0;
    this.satisfaction = null; // 마지막 슬롯 판정
    this.review = null; // 미식블로거만 사용
    this.results = []; // 슬롯별 { category, satisfaction }
  }

  currentCategory() {
    return this.orderSequence[this.slotIndex] ?? null;
  }

  isDone() {
    return this.state === CUSTOMER_STATE.DONE;
  }

  hasMoreSlots() {
    return this.slotIndex + 1 < this.orderSequence.length;
  }

  elapsed(nowMs) {
    if (this.stateStartMs == null) return 0;
    const ref = this.pausedAtMs != null ? this.pausedAtMs : nowMs;
    return Math.max(0, ref - this.stateStartMs);
  }

  // 시간 구동 전이. 한 번의 호출은 최대 한 번의 전이만 만든다.
  // Waiting → Eating 만 외부 서빙 이벤트로 발생한다 (GPL-002 §상세요구사항 3).
  update(nowMs) {
    if (this.stateStartMs == null) this.stateStartMs = nowMs;
    if (this.pausedAtMs != null) return;

    const t = this.elapsed(nowMs);
    switch (this.state) {
      case CUSTOMER_STATE.ENTERING:
        if (t >= CUSTOMER_TIMERS.entering) this._setState(CUSTOMER_STATE.ORDERING, nowMs);
        break;
      case CUSTOMER_STATE.ORDERING:
        if (t >= CUSTOMER_TIMERS.ordering) this._setState(CUSTOMER_STATE.WAITING, nowMs);
        break;
      case CUSTOMER_STATE.WAITING:
        // 서빙은 외부 이벤트. 인내심 감소는 비활성.
        break;
      case CUSTOMER_STATE.EATING:
        if (t >= CUSTOMER_TIMERS.eating) this._afterEating(nowMs);
        break;
      case CUSTOMER_STATE.LEAVING:
        if (t >= CUSTOMER_TIMERS.leaving) this._setState(CUSTOMER_STATE.DONE, nowMs);
        break;
      default:
        break;
    }
  }

  // 서빙 수령. 손님이 판정을 소유한다 (GPL-002 §상세요구사항 5).
  // payload: { category, recipeMatched, frontResult, backResult }
  onServed(payload, nowMs) {
    if (this.state !== CUSTOMER_STATE.WAITING) return false;
    if (payload.category !== this.currentCategory()) return false; // 다른 메뉴 → 무시

    const satisfaction = this.judge(payload);
    this.satisfaction = satisfaction; // 마지막 슬롯 판정
    this.results.push({ category: payload.category, satisfaction });
    // mood는 누적 경험을 반영한다. 한 슬롯이라도 나빴으면 완전히 만족하지 않는다.
    this.mood = moodFor(this.overallSatisfaction());
    this.tip += this.tipFor(satisfaction);
    this._setState(CUSTOMER_STATE.EATING, nowMs);
    return true;
  }

  // 지금까지 받은 슬롯 전체의 종합 판정. 가장 나쁜 결과가 전체를 대표한다.
  overallSatisfaction() {
    if (this.results.length === 0) return null;
    if (this.results.some((r) => r.satisfaction === SATISFACTION.FAIL)) return SATISFACTION.FAIL;
    if (this.results.some((r) => r.satisfaction === SATISFACTION.LOW)) return SATISFACTION.LOW;
    return SATISFACTION.GOOD;
  }

  // base 판정. 유형별 차이는 서브클래스가 override 한다.
  judge(payload) {
    return baseJudge(payload);
  }

  tipFor(satisfaction) {
    const base = satisfaction === SATISFACTION.GOOD ? BASE_TIP : satisfaction === SATISFACTION.LOW ? BASE_TIP / 2 : 0;
    return Math.round(base * this.tipMultiplier);
  }

  _afterEating(nowMs) {
    if (this.hasMoreSlots()) {
      this.slotIndex++;
      this._setState(CUSTOMER_STATE.ORDERING, nowMs); // 다음 슬롯 = 재주문
    } else {
      this._setState(CUSTOMER_STATE.LEAVING, nowMs);
    }
  }

  _setState(next, nowMs) {
    this.state = next;
    this.stateStartMs = nowMs;
  }

  // 가시성 (숨김/복귀) — SYS-001 백그라운드 처리와 정합.
  pause(nowMs) {
    if (this.pausedAtMs == null) this.pausedAtMs = nowMs;
  }

  resume(nowMs) {
    if (this.pausedAtMs == null) return;
    this.stateStartMs += nowMs - this.pausedAtMs;
    this.pausedAtMs = null;
  }
}

// 조리 결과 → 만족도. 손님 엔티티와 영업일 루프(businessDay)가 공유하는 단일 판정 규칙.
// 레시피가 맞고 과다가 없으면 GOOD, 과다면 LOW, 레시피가 틀리면 FAIL.
export function baseJudge(payload) {
  if (!payload.recipeMatched) return SATISFACTION.FAIL;
  if (payload.frontResult === 'over' || payload.backResult === 'over') return SATISFACTION.LOW;
  return SATISFACTION.GOOD;
}

export function moodFor(satisfaction) {
  if (satisfaction === SATISFACTION.GOOD) return MOOD.HAPPY;
  if (satisfaction === SATISFACTION.FAIL) return MOOD.ANGRY;
  return MOOD.MEH;
}
