// GPL-002 손님 유형. 값만 다르면 데이터, 판정·상태가 다르면 파생 (§상세요구사항 10).
//
// 이번 범위(작업 006) 유형 4종:
//   혼술족 · 퇴근직장인  → 데이터 (순서열·인내심·팁 배율만 다름)
//   미식블로거 · 커플    → 파생 (judge() override)
// 취객(Disturbing 상태 추가)은 멀티 손님 전제라 2차.

import { Customer, SATISFACTION } from './customer.js';
import { reduceToImplemented } from '../../config/menu.js';

// 구현되지 않은 스테이션 슬롯은 제거한다 (GPL-002 §예외).
// 드링크 스테이션이 없으므로 음료 슬롯은 이 단계에서 빠진다.
function playable(sequence) {
  return reduceToImplemented(sequence);
}

function bothPerfect(payload) {
  return payload.recipeMatched && payload.frontResult === 'perfect' && payload.backResult === 'perfect';
}

// ── 데이터 유형 ────────────────────────────────────────────────

// 혼술족 — 순서열 [꼬치], 인내심 높음, 소량 주문.
export function createSolo() {
  return new Customer({
    type: 'solo',
    orderSequence: playable(['skewer']),
    patience: 'high',
    tipMultiplier: 1,
  });
}

// 퇴근직장인 — 설계상 [음료, 꼬치, 꼬치]. 드링크 스테이션이 없어 이번 범위에서는
// [꼬치, 꼬치]로 동작하며 다중 슬롯 재주문을 이 순서열로 검증한다 (GPL-002 §예외).
export function createOfficeWorker() {
  return new Customer({
    type: 'office',
    orderSequence: playable(['drink', 'skewer', 'skewer']),
    patience: 'normal',
    tipMultiplier: 1.1,
  });
}

// ── 파생 유형 (판정만 다름) ──────────────────────────────────────

// 미식블로거 — 양면 perfect가 아니면 낮게 판정하고 리뷰를 산출한다.
export class FoodBlogger extends Customer {
  constructor() {
    super({
      type: 'blogger',
      orderSequence: playable(['skewer']),
      patience: 'normal',
      tipMultiplier: 0.9,
    });
  }

  judge(payload) {
    if (!payload.recipeMatched) return SATISFACTION.FAIL;
    return bothPerfect(payload) ? SATISFACTION.GOOD : SATISFACTION.LOW;
  }

  onServed(payload, nowMs) {
    const accepted = super.onServed(payload, nowMs);
    if (accepted) {
      // 리뷰 결과값만 기록한다. 다음 영업일 반영은 이번 범위 밖 (GPL-002 §11).
      this.review = this.satisfaction === SATISFACTION.GOOD ? 5 : 2;
    }
    return accepted;
  }
}

// 커플 — 양면 perfect일 때 팁 보너스. 기본 판정은 base와 같다.
// 플레이팅 기반 정식 판정은 플레이팅 스테이션 도입 시 교체 (GPL-002 §12).
const COUPLE_PERFECT_BONUS = 1.5;

export class CoupleGuest extends Customer {
  constructor() {
    super({
      type: 'couple',
      orderSequence: playable(['skewer']),
      patience: 'normal',
      tipMultiplier: 1.2,
    });
    this.perfectBonusApplied = false;
  }

  onServed(payload, nowMs) {
    const perfect = bothPerfect(payload);
    const accepted = super.onServed(payload, nowMs);
    if (accepted && perfect) {
      const base = this.tipFor(this.satisfaction);
      this.tip += Math.round(base * (COUPLE_PERFECT_BONUS - 1));
      this.perfectBonusApplied = true;
    }
    return accepted;
  }
}

export function createFoodBlogger() {
  return new FoodBlogger();
}

export function createCouple() {
  return new CoupleGuest();
}

export const CUSTOMER_TYPE_LABEL = {
  solo: '혼술족',
  office: '퇴근직장인',
  blogger: '미식블로거',
  couple: '커플',
};

// 유형별 생성기. 손님 스폰이 유형을 순환한다.
export const CUSTOMER_FACTORIES = [createSolo, createOfficeWorker, createFoodBlogger, createCouple];

export function createCustomerByIndex(index) {
  const factory = CUSTOMER_FACTORIES[index % CUSTOMER_FACTORIES.length];
  return factory();
}
