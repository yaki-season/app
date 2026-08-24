// D1 이름 없는 엑스트라 actor 제작·소비 계약.
//
// 이 모듈은 CH-EXTRA-COMMUTER-SERVICE의 픽셀, atlas manifest 또는 runtime binding을
// 만들지 않는다. Developer 1 handoff v1.0.0의 배치 입력과 D1BusinessDay의 실제 손님
// 상태를 Artist 3가 추측 없이 소비할 수 있는 versioned app contract로만 고정한다.

export const D1_EXTRA_ACTOR_CONTRACT_VERSION = 'v1.1.0';

export const D1_EXTRA_ACTOR_BASELINE_CLIPS = Object.freeze([
  'enter',
  'considering',
  'order-ready',
  'waiting',
  'urgent',
  'receiving',
  'tasting',
  'eating',
  'drinking',
  'satisfied',
  'disappointed',
  'angry',
  'mismatch',
  'retry',
  'checkout',
  'leave',
]);

export const D1_EXTRA_ACTOR_RUNTIME_CLIPS = Object.freeze([
  'considering',
  'order-ready',
  'waiting',
  'urgent',
  'receiving',
  'eating',
  'drinking',
  'angry',
  'checkout',
  'leave',
]);

export const D1_EXTRA_ACTOR_COVERAGE_ONLY_CLIPS = Object.freeze([
  'enter',
  'tasting',
  'satisfied',
  'disappointed',
  'mismatch',
  'retry',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const REFERENCE_VIEWPORTS = {
  fhd: { width: 1920, height: 1080 },
  hd: { width: 1280, height: 720 },
};

const SEAT_CENTERS_X = [0.12, 0.268, 0.416, 0.564, 0.712, 0.86];
const roundPixel = (value) => Math.round(value * 100) / 100;
const scaleRect = (rect, viewport) => ({
  x: roundPixel(rect.x * viewport.width),
  y: roundPixel(rect.y * viewport.height),
  width: roundPixel(rect.width * viewport.width),
  height: roundPixel(rect.height * viewport.height),
});
const scalePoint = (point, viewport) => ({
  x: roundPixel(point.x * viewport.width),
  y: roundPixel(point.y * viewport.height),
});

const seats = SEAT_CENTERS_X.map((centerX, index) => {
  const visualBounds = {
    x: centerX - 0.065,
    y: 0.13,
    width: 0.13,
    height: 0.42,
  };
  const pivot = { x: centerX, y: 0.55 };
  const hitBounds = {
    x: centerX - 0.07,
    y: 0.13,
    width: 0.14,
    height: 0.52,
  };
  return {
    seatId: `seat-${String(index + 1).padStart(2, '0')}`,
    normalized: { visualBounds, pivot, hitBounds },
    fhd: {
      visualBounds: scaleRect(visualBounds, REFERENCE_VIEWPORTS.fhd),
      pivot: scalePoint(pivot, REFERENCE_VIEWPORTS.fhd),
    },
    hd: {
      visualBounds: scaleRect(visualBounds, REFERENCE_VIEWPORTS.hd),
      pivot: scalePoint(pivot, REFERENCE_VIEWPORTS.hd),
    },
  };
});

export const D1_EXTRA_ACTOR_GEOMETRY = deepFreeze({
  coordinateSpace: 'normalized-top-left',
  placementRule: 'multiply-normalized-values-by-viewport-without-cropping-to-hit-bounds',
  clipConsistency: 'same-lower-centre-pivot-eye-line-and-seat-scale-for-every-clip',
  authority: {
    artistPreflightInput: true,
    inferFromGenericSeatLayout: false,
    runtimeBindingStatus: 'not-bound',
  },
  referenceViewports: REFERENCE_VIEWPORTS,
  seats,
  actorLayer: { name: 'actor', z: -6 },
  occlusion: {
    normalizedY: 0.55,
    fhdY: 594,
    hdY: 396,
    kind: 'layout-line',
    isRasterMask: false,
    pixelOwner: {
      objectKey: 'custCounter',
      layer: 'foreground',
      order: 50,
      method: 'full-frame-foreground-alpha',
    },
  },
  interaction: {
    actorRasterInteractive: false,
    targetKeyPattern: 'seatServe:<seatId>',
    targetOwner: 'runtime-transparent-raycast-mesh',
    targetIsTransparent: true,
    artistPixelScope: false,
    rasterMustNotContain: ['button', 'hit-zone', 'table', 'seat-number', 'order-text', 'gauge'],
  },
});

export const D1_EXTRA_ACTOR_ROLE_SEMANTICS = deepFreeze({
  role: 'nameless-commuter-extra-category',
  fixedCharacterBoundary: {
    onlyNamedCharacters: ['CHAR-AKI', 'CHAR-TSUKIOKA'],
    extraMustNotBecomeFixedCharacter: true,
  },
  allowed: [
    'ordinary-contemporary-commuter-styling',
    'general-commute-fatigue-without-personal-backstory',
    'quick-decisive-ordering',
    'ordinary-relief-after-a-correct-item-is-received',
    'shared-service-waiting-urgency-quality-and-departure-reactions',
  ],
  forbidden: [
    'personal-name-or-diegetic-display-name',
    'fixed-biography-employer-relationship-or-personal-history',
    'individual-memory-recurrence-or-story-arc',
    'named-office-a-or-office-b-identity',
    'tsukioka-or-aki-lookalike',
    'order-number-fifo-arrow-queue-priority-or-first-customer-claim',
    'baked-button-hit-zone-table-seat-number-order-text-or-gauge',
  ],
  servingMeaning: 'shared-prepared-item-to-player-selected-customer-to-that-customers-outstanding-order',
  runtimeInstanceIdsAreDiegeticNames: false,
});

// 위에서 아래로 먼저 일치하는 selector가 이긴다. 특히 urgent는 부분 생맥주 반응보다 우선한다.
export const D1_EXTRA_ACTOR_STATE_TO_CLIP = deepFreeze([
  { phase: 'thinking', when: 'always', clip: 'considering' },
  { phase: 'order-ready', when: 'always', clip: 'order-ready' },
  { phase: 'waiting', when: 'urgent=true', clip: 'urgent' },
  {
    phase: 'waiting',
    when: 'urgent=false and servedItemMenuIds contains beer and remainingItemCount>0',
    clip: 'drinking',
  },
  { phase: 'waiting', when: 'otherwise', clip: 'waiting' },
  { phase: 'received-waiting-group', when: 'always', clip: 'receiving' },
  { phase: 'eating', when: 'always', clip: 'eating' },
  { phase: 'meal-complete', when: 'always', clip: 'checkout' },
  { phase: 'leaving', when: 'departureCause is present', clip: 'angry' },
  { phase: 'leaving', when: 'departureCause is absent', clip: 'leave' },
  { phase: 'cleanup', when: 'always', clip: null },
  { phase: 'done', when: 'always', clip: null },
  { phase: 'empty', when: 'always', clip: null },
]);

const SUPPORTED_PHASES = new Set(D1_EXTRA_ACTOR_STATE_TO_CLIP.map(({ phase }) => phase));

export function resolveD1ExtraActorClip({
  phase,
  urgent = false,
  servedItemMenuIds = [],
  remainingItemCount = 0,
  departureCause = null,
} = {}) {
  if (!SUPPORTED_PHASES.has(phase)) {
    throw new TypeError(`지원하지 않는 D1 엑스트라 actor phase입니다: ${String(phase)}`);
  }
  if (phase === 'thinking') return 'considering';
  if (phase === 'order-ready') return 'order-ready';
  if (phase === 'waiting') {
    if (urgent) return 'urgent';
    if (remainingItemCount > 0 && servedItemMenuIds.includes('beer')) return 'drinking';
    return 'waiting';
  }
  if (phase === 'received-waiting-group') return 'receiving';
  if (phase === 'eating') return 'eating';
  if (phase === 'meal-complete') return 'checkout';
  if (phase === 'leaving') return departureCause ? 'angry' : 'leave';
  return null;
}

export const D1_EXTRA_ACTOR_CONTRACT = deepFreeze({
  version: D1_EXTRA_ACTOR_CONTRACT_VERSION,
  sources: {
    developer1Task: 'v3.25.0',
    artist3Task: 'v1.1.1',
    artAssetContract: 'ART-003 v5.9.0',
    geometryHandoff: 'v1.0.0',
  },
  identity: {
    screenId: 'SCR-SVC-CUSTOMERS',
    stateId: 'D1-extra-commuter',
    componentId: 'customers.actor.commuter',
    requiredAssetId: 'CH-EXTRA-COMMUTER-SERVICE',
    semanticOwner: 'artist-3.d1-drink-service-cleanup-customer-settlement',
  },
  baselineClips: D1_EXTRA_ACTOR_BASELINE_CLIPS,
  runtimeClips: D1_EXTRA_ACTOR_RUNTIME_CLIPS,
  coverageOnlyClips: D1_EXTRA_ACTOR_COVERAGE_ONLY_CLIPS,
  clipPolicy: {
    allBaselineClipsRequiredForArtDelivery: true,
    runtimeSubsetIsNotAnArtDeliveryWaiver: true,
    coverageOnlyMeansNotSelectedByCurrentD1Gameplay: true,
  },
  stateToClip: D1_EXTRA_ACTOR_STATE_TO_CLIP,
  roleSemantics: D1_EXTRA_ACTOR_ROLE_SEMANTICS,
  geometry: D1_EXTRA_ACTOR_GEOMETRY,
  registration: {
    createsPixels: false,
    createsManifestEntry: false,
    promotesRuntimeAsset: false,
    bindsRuntimeSelector: false,
  },
});
