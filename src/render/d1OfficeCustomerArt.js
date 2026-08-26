export const D1_OFFICE_CUSTOMER_FRAME_INTERVAL_MS = 1200;

const OFFICE_IDS = Object.freeze(['a', 'b', 'c', 'd', 'e']);
// commuter 순번 → 승인 변형. office A/B(개발자)와 겹치지 않는 c·d·e만 돌려쓴다.
const COMMUTER_VARIANTS = Object.freeze(['c', 'd', 'e', 'c', 'd']);
const ACTION_PHASES = new Set(['eating', 'done']);

// 승인 라스터의 인물 중심 x(캔버스 정규화 좌표). manifest는 pivot.x=0.5를 선언하지만
// developer A/B(R9) 캔버스만 인물이 오른쪽에 그려져 있다. 좌석 배치는 풀프레임 레이어의
// 캔버스 중심을 좌석 중심에 맞추므로, 이 편심을 보정하지 않으면 두 손님만 의자 오른쪽에 앉는다.
export const D1_OFFICE_ART_FIGURE_CENTER_X = Object.freeze({
  a: 1086.5 / 1920,
  b: 1086.5 / 1920,
  c: 0.5,
  d: 0.5,
  e: 0.5,
});

// d1-game의 extraKind는 D1~D5의 OFFICE·COMMUTER를 모두 office 아트로 보낸다. 여기서 변형을
// 못 읽으면 번들 기본 url(=developer A 라스터)로 조용히 대체되고 좌우 보정도 못 받는다.
// 그래서 날짜 접두사를 D1~D3로 좁히지 않고, 무작위 편성이 뽑는 E 이후 순번도 순환시킨다.
export function d1OfficeCustomerVariant(customerId) {
  const id = customerId ?? '';
  const office = /^D[1-9]\d*-OFFICE-([A-Z])$/.exec(id);
  if (office) return OFFICE_IDS[(office[1].charCodeAt(0) - 65) % OFFICE_IDS.length];
  const commuter = /^D[1-9]\d*-COMMUTER-([A-Z])$/.exec(id);
  if (commuter) return COMMUTER_VARIANTS[(commuter[1].charCodeAt(0) - 65) % COMMUTER_VARIANTS.length];
  return null;
}

function companionFor(bundle, role) {
  return (bundle?.companions ?? []).find((companion) => companion.role === role) ?? null;
}

function frameFor(bundle, variant, state) {
  if (variant === 'a' && state === 'waiting') {
    return Object.freeze({ ...bundle, frameRole: 'office-a-waiting' });
  }
  const frame = companionFor(bundle, `office-${variant}-${state}`);
  return frame ? Object.freeze({ ...frame, frameRole: frame.role }) : null;
}

export function resolveD1OfficeCustomerFrame(
  bundle,
  {
    customerId,
    phase = 'waiting',
    servedNegima = false,
    servedBeer = false,
    nowMs = 0,
  } = {},
) {
  const variant = d1OfficeCustomerVariant(customerId);
  if (!variant || !OFFICE_IDS.includes(variant)) return bundle;

  const waiting = frameFor(bundle, variant, 'waiting') ?? bundle;
  const availableActions = [];
  if (servedNegima) availableActions.push('eating-negima');
  if (servedBeer) availableActions.push('drinking-beer');
  if (availableActions.length === 0) return waiting;

  // A partially served order should visibly use the item already on the table.
  // Once the full order is being eaten, alternate only between actually served items.
  const acting = ACTION_PHASES.has(phase) || servedNegima || servedBeer;
  if (!acting) return waiting;
  const index = availableActions.length === 1
    ? 0
    : Math.floor(Math.max(0, nowMs) / D1_OFFICE_CUSTOMER_FRAME_INTERVAL_MS)
      % availableActions.length;
  return frameFor(bundle, variant, availableActions[index]) ?? waiting;
}

export function isD1OfficeBeerFrame(frame) {
  return frame?.frameRole?.endsWith('-drinking-beer') === true;
}

// 좌석 배치 시 풀프레임 레이어에 더할 정규화 x 보정값. 인물이 캔버스 중앙에 있는
// 라스터는 0을 돌려주므로 기존 배치와 무회귀다.
export function d1OfficeActorOffsetX(customerId) {
  const variant = d1OfficeCustomerVariant(customerId);
  const figureCenterX = variant ? D1_OFFICE_ART_FIGURE_CENTER_X[variant] : undefined;
  return Number.isFinite(figureCenterX) ? 0.5 - figureCenterX : 0;
}
