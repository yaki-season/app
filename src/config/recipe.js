// 레시피와 조리 임계값의 단일 정의 위치 (GPL-001 §상세요구사항 3, 9 / 비기능요구사항 4)
// 화면·상태 로직 어디에서도 이 값을 다시 정의하지 않는다.

export const INGREDIENT = {
  CHICKEN: 'chicken',
  LEEK: 'leek',
  FOLDED_CHICKEN_SKIN: 'foldedChickenSkin',
};

// 네기마: 닭다리살-대파-닭다리살-대파-닭다리살 (GPL-001 §범위)
export const RECIPE = [
  INGREDIENT.CHICKEN,
  INGREDIENT.LEEK,
  INGREDIENT.CHICKEN,
  INGREDIENT.LEEK,
  INGREDIENT.CHICKEN,
];

// 모모: 같은 닭다리살 모듈 다섯 조각을 빈 꼬치 중심에 차례로 끼운다.
// D2도 네기마와 동일한 양면 접촉 조리 공정을 쓰며 재료 조합만 다르다.
export const MOMO_RECIPE = [
  INGREDIENT.CHICKEN,
  INGREDIENT.CHICKEN,
  INGREDIENT.CHICKEN,
  INGREDIENT.CHICKEN,
  INGREDIENT.CHICKEN,
];

// 토리카와: 접은 닭껍질 다섯 조각. 전용 원본 기반 조립·굽기 아트를 사용하며
// 도메인 재료 ID도 분리해 아트 단계와 조리 규칙이 서로 침범하지 않게 한다.
export const KAWA_RECIPE = Array(5).fill(INGREDIENT.FOLDED_CHICKEN_SKIN);

export const EARLY_CAMPAIGN_RECIPES = Object.freeze({
  negima: RECIPE,
  momo: MOMO_RECIPE,
  kawa: KAWA_RECIPE,
});

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

export function classifyDoneness(elapsedSec, thresholds = COOK_THRESHOLDS_SEC) {
  if (elapsedSec >= thresholds[DONENESS.BURNT]) return DONENESS.BURNT;
  if (elapsedSec >= thresholds[DONENESS.OVER]) return DONENESS.OVER;
  if (elapsedSec >= thresholds[DONENESS.PERFECT]) return DONENESS.PERFECT;
  return DONENESS.UNDER;
}

// 뒤집기 / 접시 회수를 허용하는 판정 (GPL-001 §상세요구사항 10, 11)
export function canAdvance(doneness) {
  return doneness === DONENESS.PERFECT || doneness === DONENESS.OVER;
}

// 탭 전환 애니메이션 시간 범위 (UI-001 §화면구조 4)
export const TAB_TRANSITION_MS = 450;
