// 레시피와 조리 임계값의 단일 정의 위치 (GPL-001 §상세요구사항 3, 9 / 비기능요구사항 4)
// 화면·상태 로직 어디에서도 이 값을 다시 정의하지 않는다.

export const INGREDIENT = {
  CHICKEN: 'chicken',
  LEEK: 'leek',
};

// 네기마: 닭다리살-대파-닭다리살-대파-닭다리살 (GPL-001 §범위)
export const RECIPE = [
  INGREDIENT.CHICKEN,
  INGREDIENT.LEEK,
  INGREDIENT.CHICKEN,
  INGREDIENT.LEEK,
  INGREDIENT.CHICKEN,
];

// 면별 조리 판정 (GPL-001 §상세요구사항 9)
export const DONENESS = {
  UNDER: 'under',
  PERFECT: 'perfect',
  OVER: 'over',
  BURNT: 'burnt',
};

// 각 구간의 하한(초). 상한은 다음 구간의 하한, 마지막 구간은 무한대.
export const COOK_THRESHOLDS_SEC = {
  [DONENESS.UNDER]: 0.0,
  [DONENESS.PERFECT]: 2.5,
  [DONENESS.OVER]: 5.5,
  [DONENESS.BURNT]: 7.0,
};

export function classifyDoneness(elapsedSec) {
  if (elapsedSec >= COOK_THRESHOLDS_SEC[DONENESS.BURNT]) return DONENESS.BURNT;
  if (elapsedSec >= COOK_THRESHOLDS_SEC[DONENESS.OVER]) return DONENESS.OVER;
  if (elapsedSec >= COOK_THRESHOLDS_SEC[DONENESS.PERFECT]) return DONENESS.PERFECT;
  return DONENESS.UNDER;
}

// 뒤집기 / 접시 회수를 허용하는 판정 (GPL-001 §상세요구사항 10, 11)
export function canAdvance(doneness) {
  return doneness === DONENESS.PERFECT || doneness === DONENESS.OVER;
}

// 탭 전환 애니메이션 시간 범위 (UI-001 §화면구조 4)
export const TAB_TRANSITION_MS = 450;
