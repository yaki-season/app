// 프로덕션 영업 화면 설정 단일 원본 (SYS-002 v3 §109).
//
// 손님·조립·그릴·드링크는 **같은 플레이어 기준 위치(PLAYER_EYE)에서 파생한 고정 원근 프리셋**이다
// (§68). 각 화면은 시선(look)만 달리하고, 필요한 객체만 활성화한다(§69). 카메라 포즈·객체 활성/비활성은
// productionRenderer가 이 데이터로 구동한다. 좌표는 정규화 top-left(x·y ∈ 0..1) 또는 월드 단위다.
//
// 증분 1은 더미 도형으로 구조만 세운다. 승인 아트가 오면 색·에셋만 교체한다(작업 022 인계 전 금지).

import {
  D1_GRILL_FINISHED_TRAY,
  D1_PUBLIC_GRILL_LAYOUT,
  D1_GRILL_SLOT_KEYS,
  D1_GRILL_WAITING_TRAY,
  createD1GrillObjects,
} from './d1GrillLayout.js';
import {
  D1_ASSEMBLY_BUILD_SLOT,
  D1_ASSEMBLY_TRAY_SLOTS,
  createD1AssemblyObjects,
} from './d1AssemblyLayout.js';

// 레이어 z 깊이 (카메라는 +z에서 -z를 바라본다. 값이 작을수록 멀다.)
export const LAYER_Z = {
  background: -8,
  fixture: -4, // 카운터·작업대·타워 등 고정물
  actor: -6, // 손님
  interactive: -1.6, // 재료·꼬치·잔 등 조작 대상
  vfx: -1.2,
  foreground: 0.5,
};

// 승인 runtime은 파일명이 아니라 manifest stable ID로만 연결한다.
export const CUSTOMER_ART = {
  background: 'BG-INTERIOR-BASE',
  seating: 'BG-SEATING-6',
  counter: 'BG-SERVICE-TABLE-ARTIST009',
  waiting: 'D1-TSUKIOKA-WAITING',
  partialBeer: 'D1-TSUKIOKA-PARTIAL-BEER-WAITING',
  receivedEating: 'D1-TSUKIOKA-RECEIVED-EATING',
};
// 승인 D1 조리 화면 아트. GLB/JSON 4종은 실제 renderer consumer 전까지 pending이다.
export const COOKING_ART = {
  drinkBackground: 'BG-WORKSPACE-DRINK',
  // 드링크 머신 레이어는 레버 상태를 함께 그리는 MDL-BEER-LEVER가 소비한다.
  // ST-DRINK-BEER-TIER-1은 레버가 구워지지 않은 base로 남는다.
  drinkStation: 'MDL-BEER-LEVER',
  drinkGlass: 'MDL-BEER-GLASS',
  grillBackground: 'BG-WORKSPACE-GRILL',
  assemblyBackground: 'BG-WORKSPACE-ASSEMBLY',
  grillStation: 'ST-GRILL-TIER-1',
  grillFinishedTray: 'ST-GRILL-FINISHED-TRAY',
  assemblyStation: 'ST-ASSEMBLY-TIER-1',
};

// 하나의 stable ID가 여러 상태 래스터를 갖는 경우의 companion role.
// 실제 URL은 manifest companion에서 해석하며, 여기서는 role 이름만 계약으로 고정한다.
export const DRINK_ART_STATE = Object.freeze({
  leverNeutral: null, // MDL-BEER-LEVER 기본 url
  leverBeer: 'lever-beer',
  leverFoam: 'lever-foam',
  glassDeck: 'glass-deck',
});
export const SEAT_ACTOR_TEXTURE = null;
export const SEAT_ACTOR_UV = null;

// BG-SEATING-6 R2 (1672×941 source → FHD placement).
// 승인된 일자형 카운터 R5는 세로 0.78배로 줄이고 아래로 내린다. 의자도 함께 낮춰
// 등받이 상단만 카운터 위로 보이고 하단은 상판 뒤에 가려지도록 맞춘다.
export const D1_SEATING_RECT = Object.freeze({
  x: 10 / 1920,
  y: 190 / 1080,
  width: (1672 * 1.13679424) / 1920,
  height: (941 * 1.13679424) / 1080,
});

// 바 안쪽 주인공의 공유 기준 위치. 모든 화면 프리셋이 여기서 파생한다(§68).
export const PLAYER_EYE = { x: 0, y: 2.6, z: 12.0 };
export const SCREEN_TRANSITION_MS = 300;

// game.html 전용 프로덕션 그릴 칸(명성 해금, 최대 8). d1-game의 고정 6칸 D1 계약과 분리한 별도 키(pgSlot*).
// count개의 칸을 그릴 바디 폭에 균등 배치한다(seat과 같은 방식). renderer가 setGrillSlots로 재배치한다.
export const GRILL_MAX_SLOTS = 8;
export const DEFAULT_GRILL_SLOTS = 2;
export function computeGrillSlots(count = DEFAULT_GRILL_SLOTS) {
  if (count === D1_PUBLIC_GRILL_LAYOUT) return D1_PUBLIC_GRILL_LAYOUT.slots;
  const n = Math.max(1, Math.min(GRILL_MAX_SLOTS, count));
  // 좌우 트레이 예약 영역(대기 끝 x=0.245)을 침범하지 않는 그릴 본체 레인.
  const left = 0.285;
  const right = 0.715;
  const step = n > 1 ? (right - left) / (n - 1) : 0;
  const w = Math.min(0.085, step > 0 ? step * 0.62 : 0.085);
  return Array.from({ length: n }, (_, i) => {
    const cx = n === 1 ? 0.5 : left + step * i;
    return { key: `pgSlot${i}`, rect: { x: cx - w / 2, y: 0.46, width: w, height: 0.24 } };
  });
}
export const GRILL_SLOT_KEYS = Array.from({ length: GRILL_MAX_SLOTS }, (_, i) => `pgSlot${i}`);
function productionGrillObjects() {
  return Object.fromEntries(
    computeGrillSlots(GRILL_MAX_SLOTS).map(({ key, rect }) => [key, { rect, layer: 'interactive', color: 0xd98a5f, kind: 'grill', prodGrillSlot: true }]),
  );
}

// 더미 오브젝트 레지스트리: key → { rect(정규화 top-left), layer, color, kind }.
// productionRenderer가 한 번 만들어두고 화면별로 visible 토글한다(단일 렌더러, §33).
export const OBJECTS = {
  // 공용 배경 (조립·그릴·드링크 등 아트 없는 화면)
  bg: { rect: { x: 0, y: 0, width: 1, height: 1 }, layer: 'background', color: 0x241c15, kind: 'fullframe' },

  // 손님 화면 승인 아트 레이어 (풀프레임 이미지). 좌석 액터·serve는 SEATS에서 동적 생성.
  // 배경은 1:1 원경으로 유지하고, 일자형 카운터만 전경에서 축소·하강한다.
  custBg: { kind: 'image', full: true, imageScale: 1, layer: 'background', order: 0, stableAssetId: CUSTOMER_ART.background, opaque: true },
  custSeating: { kind: 'image', rect: D1_SEATING_RECT, layer: 'fixture', order: 10, stableAssetId: CUSTOMER_ART.seating, opaque: false },
  // 츠키오카 full-frame 아트는 기존 좌석 앵커를 유지하되, 하단이 낮춘 일자형 카운터
  // 뒤에 자연스럽게 가려지도록 승인 위치를 그대로 사용한다.
  custTsukioka: { kind: 'image', full: true, imageOffsetY: 256 / 1080, layer: 'actor', order: 20, stableAssetId: CUSTOMER_ART.waiting, opaque: false },
  custCounter: { kind: 'image', full: true, imageScale: 1, imageScaleY: 0.78, imageOffsetY: 0.25, layer: 'foreground', order: 50, stableAssetId: CUSTOMER_ART.counter, opaque: false },

  // 조리 화면 승인 배경 아트 (풀프레임 이미지, 불투명). 화면별 배경. dummy `bg`를 대체한다.
  drinkBg: { kind: 'image', full: true, layer: 'background', order: 0, stableAssetId: COOKING_ART.drinkBackground, opaque: true },
  // 승인 원본은 FHD 투명 캔버스다. cover 확대 없이 한 걸음 물러난 rect로 합성한다.
  drinkStation: { kind: 'image', rect: { x: 0.10, y: 0.07, width: 0.80, height: 0.80 }, layer: 'fixture', order: 10, stableAssetId: COOKING_ART.drinkStation, opaque: false },
  // 빈잔 덱은 상시 표시, 노즐 아래 배치 잔은 덱 클릭 뒤에만 표시한다.
  drinkGlassDeck: { kind: 'image', rect: { x: 0.12, y: 0.43, width: 0.34, height: 0.30 }, layer: 'interactive', order: 20, stableAssetId: COOKING_ART.drinkGlass, companionRole: DRINK_ART_STATE.glassDeck, opaque: false },
  // 잔 PNG 전체 bounds가 아니라 실제 원통형 몸통 안쪽만 사용한다(손잡이·투명 여백 제외).
  drinkBeerLiquid: { rect: { x: 0.468, y: 0.525, width: 0.055, height: 0.105 }, layer: 'interactive', color: 0xffffff, kind: 'plane', decorative: true },
  drinkPlacedGlass: { kind: 'image', rect: { x: 0.43, y: 0.43, width: 0.14, height: 0.25 }, layer: 'interactive', order: 21, stableAssetId: COOKING_ART.drinkGlass, opaque: false },
  // 노즐 끝→잔 입구/몸통만 덮는 좁은 VFX 영역. 화면 전체 포말 blob을 방지한다.
  drinkBeerVfx: { rect: { x: 0.455, y: 0.365, width: 0.09, height: 0.315 }, layer: 'vfx', color: 0xffffff, kind: 'plane', decorative: true },
  grillBg: { kind: 'image', full: true, layer: 'background', order: 0, stableAssetId: COOKING_ART.grillBackground, opaque: true },
  assemblyBg: { kind: 'image', full: true, layer: 'background', order: 0, stableAssetId: COOKING_ART.assemblyBackground, opaque: true },

  // 조립 화면. 재료통·지그 입력은 투명 핫스팟이고 실제 꼬치/재료는 승인 GLB overlay가 맡는다.
  workbench: { kind: 'image', full: true, layer: 'fixture', order: 1, stableAssetId: COOKING_ART.assemblyStation, opaque: false },
  binChicken: { rect: { x: 0.03, y: 0.38, width: 0.135, height: 0.34 }, hitRect: { x: 0.025, y: 0.36, width: 0.15, height: 0.38 }, layer: 'interactive', color: 0xd98a5f, kind: 'hotspot' },
  binLeek: { rect: { x: 0.165, y: 0.38, width: 0.11, height: 0.34 }, hitRect: { x: 0.155, y: 0.36, width: 0.13, height: 0.38 }, layer: 'interactive', color: 0x8fc06a, kind: 'hotspot' },
  jigSkewer: { rect: { x: 0.39, y: 0.40, width: 0.305, height: 0.31 }, hitRect: { x: 0.38, y: 0.38, width: 0.325, height: 0.35 }, layer: 'interactive', color: 0xc9a86a, kind: 'hotspot' },
  ...createD1AssemblyObjects(),

  // 그릴 화면 (다중 칸). 대기 트레이의 꼬치를 빈 칸에 올려 각각 독립적으로 굽는다.
  grillBody: { kind: 'image', full: true, layer: 'fixture', order: 1, stableAssetId: COOKING_ART.grillStation, opaque: false },
  grillWaitTray: { rect: D1_GRILL_WAITING_TRAY.rect, anchor: D1_GRILL_WAITING_TRAY.anchor, layer: 'interactive', color: 0xc9a86a, kind: 'plane' },
  ...createD1GrillObjects(), // d1-game용 D1 고정 6칸 (grillSlot0~5)
  ...productionGrillObjects(), // game.html용 프로덕션 그릴 8칸 (pgSlot0~7)
  // 완료 트레이: 시각은 승인 아트(풀프레임 이미지), 클릭 판정은 hitRect 기반 별도 투명 interactionMesh로 유지.
  // (buildObject가 image를 objectMesh에서 제외해도 buildInteraction이 hitRect로 hit target을 만들어 클릭 보존.)
  grillFinishedTray: {
    key: D1_GRILL_FINISHED_TRAY.key,
    kind: 'image',
    full: true,
    layer: 'fixture',
    order: 1.25,
    stableAssetId: COOKING_ART.grillFinishedTray,
    opaque: false,
    rect: D1_GRILL_FINISHED_TRAY.visualRect,
    visualRect: D1_GRILL_FINISHED_TRAY.visualRect,
    hitRect: D1_GRILL_FINISHED_TRAY.hitRect,
    hitTarget: D1_GRILL_FINISHED_TRAY.hitRect,
    reservedBounds: D1_GRILL_FINISHED_TRAY.reservedBounds,
    anchor: D1_GRILL_FINISHED_TRAY.anchor,
    componentId: D1_GRILL_FINISHED_TRAY.componentId,
    stableAssetId: D1_GRILL_FINISHED_TRAY.stableAssetId,
    sourceMasterId: D1_GRILL_FINISHED_TRAY.sourceMasterId,
    sourceMasterRevision: D1_GRILL_FINISHED_TRAY.sourceMasterRevision,
    color: 0x6f5437,
  },

  // 드링크 화면 (단일 레버: 위=거품, 아래=맥주. 잔 채움은 DOM 패널)
  drinkTower: { rect: { x: 0.44, y: 0.30, width: 0.12, height: 0.24 }, layer: 'fixture', color: 0x6b6f72, kind: 'plane' },
  // 빈잔을 선택해 노즐 아래에 놓는 실제 클릭 슬롯. 승인 머신의 중앙 노즐과 정렬한다.
  glassRack: { rect: { x: 0.12, y: 0.43, width: 0.34, height: 0.30 }, hitRect: { x: 0.12, y: 0.43, width: 0.34, height: 0.30 }, layer: 'interactive', color: 0xc9a86a, kind: 'plane', invisible: true },
  drinkLeverUpper: { rect: { x: 0.48, y: 0.25, width: 0.08, height: 0.13 }, hitRect: { x: 0.46, y: 0.23, width: 0.12, height: 0.17 }, layer: 'interactive', color: 0xe8d8a0, kind: 'plane', invisible: true },
  drinkLeverLower: { rect: { x: 0.48, y: 0.38, width: 0.08, height: 0.10 }, hitRect: { x: 0.46, y: 0.36, width: 0.12, height: 0.14 }, layer: 'interactive', color: 0xc79a3a, kind: 'plane', invisible: true },
};

// 좌석 (손님 화면). 좌석 수는 좌석 확장 업그레이드(seatCap 6→8→12)로 늘어난다. 좌석은 카운터 뒤 손님
// 액터, 좌석 위 말풍선(DOM), 카운터 위 serve 대상을 갖는다. 좌표는 정규화(top-left rect / center point).
export const MAX_SEATS = 12;
export const DEFAULT_SEAT_CAP = 6;
const D1_APPROVED_SEAT_CENTERS_FHD = Object.freeze([210.1, 512.5, 809.2, 1108.7, 1404.8, 1710.1]);
// 첫 domain 좌석(seat-01)의 츠키오카를 승인 소비 화면의 물리 4번 좌석에 놓는다.
const D1_LOGICAL_TO_VISUAL_SEAT = Object.freeze([3, 0, 1, 2, 4, 5]);
// cap개의 좌석을 카운터 폭에 균등 배치한다. cap=6은 기존 좌표(0.12~0.86)와 동일해 무회귀.
export function computeSeats(cap) {
  const n = Math.max(1, Math.min(MAX_SEATS, cap));
  const left = n <= 6 ? 0.25 : 0.12;
  const right = n <= 6 ? 0.75 : 0.88;
  const step = n > 1 ? (right - left) / (n - 1) : 0;
  const halfW = Math.min(0.055, step > 0 ? step * 0.42 : 0.055); // 액터 반폭(밀집 시 축소)
  // 초상 원본은 세로로 긴 0.8 안팎 비율이다. 좌석 hit 폭을 액터 폭으로 재사용하면 6석에서도
  // 지나치게 홀쭉해지므로 표시 폭을 분리한다. 확장 좌석에서만 겹침 방지를 위해 축소한다.
  const actorWidth = n <= 6 ? 0.16 : Math.min(0.11, step * 0.9);
  return Array.from({ length: n }, (_, i) => {
    const cx = n === 6
      ? D1_APPROVED_SEAT_CENTERS_FHD[D1_LOGICAL_TO_VISUAL_SEAT[i]] / 1920
      : n === 1 ? 0.5 : left + step * i;
    return {
      id: `seat-${String(i + 1).padStart(2, '0')}`,
      actor: { x: cx - actorWidth / 2, y: 0.355, width: actorWidth, height: 0.40 }, // 원본 비율 복원 + 상판 하단 정렬
      bubble: { x: cx, y: 0.305 }, // 내려간 손님 머리 위 말풍선·게이지 DOM 앵커
      serve: { x: cx - halfW * 0.82, y: 0.55, width: halfW * 1.64, height: 0.10 }, // 카운터 위 serve 대상
      hit: { x: cx - halfW, y: 0.295, width: halfW * 2, height: 0.52 }, // 하강한 액터 중심과 정렬한 투명 조작 영역
    };
  });
}
// 최대 좌석 id·기본 배치. 렌더러는 MAX_SEATS를 만들고 capacity에 맞춰 재배치·표시한다.
export const SEAT_IDS = Array.from({ length: MAX_SEATS }, (_, i) => `seat-${String(i + 1).padStart(2, '0')}`);
export const SEATS = computeSeats(DEFAULT_SEAT_CAP);
export const SEAT_ACTOR_MOOD = { waiting: 0x8a7563, tasting: 0x9c826a, satisfied: 0x8fd47a, neutral: 0xc2b3a3, retry: 0xef6a58 };

// 화면 레지스트리. 좌·우 순서 = 배열 순서. 각 화면은 같은 PLAYER_EYE에서 look만 달리한다.
// look: 월드 단위 시선 지점 (손님=정면·위, 스테이션=아래, 드링크=옆).
export const SCREENS = [
  {
    id: 'SCR-SVC-CUSTOMERS',
    name: '손님',
    look: { x: 0.0, y: 0.4, z: -6.0 }, // 정면·위 (손님·카운터)
    objects: ['custBg', 'custSeating', 'custTsukioka', 'custCounter'],
    seats: SEAT_IDS, // 좌석 액터·serve는 렌더러가 SEATS로 생성
  },
  {
    id: 'SCR-SVC-ASSEMBLY',
    name: '조립',
    look: { x: 0.0, y: -2.6, z: -3.6 }, // 아래 작업대
    objects: [
      'assemblyBg',
      'workbench',
      'binChicken',
      'binLeek',
      'jigSkewer',
      D1_ASSEMBLY_BUILD_SLOT.key,
      ...D1_ASSEMBLY_TRAY_SLOTS.map(({ key }) => key),
    ],
  },
  {
    id: 'SCR-SVC-GRILL',
    name: '그릴',
    look: { x: 0.0, y: -2.4, z: -3.0 }, // 아래 그릴 (더 가까이)
    // BG-WORKSPACE-GRILL R2가 중앙 석쇠까지 포함한다. 좌우 tray는 DOM 재고 카드가 대체한다.
    objects: ['grillBg', ...D1_GRILL_SLOT_KEYS, ...GRILL_SLOT_KEYS],
  },
  {
    id: 'SCR-SVC-DRINK',
    name: '드링크',
    look: { x: 1.8, y: -1.4, z: -4.4 }, // 옆(오른쪽) 주류
    objects: ['drinkBg', 'glassRack', 'drinkStation', 'drinkGlassDeck', 'drinkBeerLiquid', 'drinkPlacedGlass', 'drinkBeerVfx', 'drinkLeverUpper', 'drinkLeverLower'],
  },
];

export const SCREEN_IDS = SCREENS.map((s) => s.id);
export const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s]));
export const INITIAL_SCREEN = 'SCR-SVC-CUSTOMERS';
