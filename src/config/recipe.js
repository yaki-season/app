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
// 이 값은 콘텐츠 데이터(`content/processes/grill.json`)가 원본이며, 여기 리터럴은
// 콘텐츠 로드 실패 시의 안전 기본값이다. 부팅 시 applyBalanceContent가 데이터로 덮어쓴다.
export const COOK_THRESHOLDS_SEC = {
  [DONENESS.UNDER]: 0.0,
  [DONENESS.PERFECT]: 8.0,
  [DONENESS.OVER]: 16.0,
  [DONENESS.BURNT]: 21.0,
};

// 로드·검증된 콘텐츠의 조리 공정 수치를 게임 로직에 반영한다 (DAT-001, GPL-002 데이터 구동).
// bundle: loader.js가 반환한 콘텐츠 번들.
export function applyBalanceContent(bundle) {
  const grill = (bundle?.processes || []).find((p) => p.id === 'grill-negima');
  if (!grill || !grill.faceThresholdsSec) return false;
  const t = grill.faceThresholdsSec;
  COOK_THRESHOLDS_SEC[DONENESS.UNDER] = t.under;
  COOK_THRESHOLDS_SEC[DONENESS.PERFECT] = t.perfect;
  COOK_THRESHOLDS_SEC[DONENESS.OVER] = t.over;
  COOK_THRESHOLDS_SEC[DONENESS.BURNT] = t.burnt;
  return true;
}

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
