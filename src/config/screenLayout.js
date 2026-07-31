// 프로덕션 영업 화면 설정 단일 원본 (SYS-002 v3 §109).
//
// 손님·조립·그릴·드링크는 **같은 플레이어 기준 위치(PLAYER_EYE)에서 파생한 고정 원근 프리셋**이다
// (§68). 각 화면은 시선(look)만 달리하고, 필요한 객체만 활성화한다(§69). 카메라 포즈·객체 활성/비활성은
// productionRenderer가 이 데이터로 구동한다. 좌표는 정규화 top-left(x·y ∈ 0..1) 또는 월드 단위다.
//
// 증분 1은 더미 도형으로 구조만 세운다. 승인 아트가 오면 색·에셋만 교체한다(작업 022 인계 전 금지).

import {
  D1_GRILL_FINISHED_TRAY,
  D1_GRILL_SLOT_KEYS,
  D1_GRILL_WAITING_TRAY,
  createD1GrillObjects,
} from './d1GrillLayout.js';

// 레이어 z 깊이 (카메라는 +z에서 -z를 바라본다. 값이 작을수록 멀다.)
export const LAYER_Z = {
  background: -8,
  fixture: -4, // 카운터·작업대·타워 등 고정물
  actor: -6, // 손님
  interactive: -1.6, // 재료·꼬치·잔 등 조작 대상
  vfx: -1.2,
  foreground: 0.5,
};

// 승인 D1 손님 화면 아트(public/assets, manifest.json). 아트가 없는 스테이션은 더미로 남는다.
const A = '/assets/core/customer';
export const CUSTOMER_ART = {
  background: `${A}/background-complete-r3-b1.png`,
  counter: `${A}/service-table-complete-r1-b1.png`,
  waiting: `${A}/d1-tsukioka-waiting-r2-b1.png`,
  partialBeer: `${A}/d1-tsukioka-partial-beer-waiting-r1-b1.png`,
  eatingNegima: `${A}/d1-tsukioka-received-eating-negima-r1-b1.png`,
  eatingBeer: `${A}/d1-tsukioka-received-eating-beer-r1-b1.png`,
};
// 좌석 손님 액터에 입힐 텍스처(대기). 풀프레임 아트에서 테이블 위로 보여야 하는 상체만 잘라 쓴다.
export const SEAT_ACTOR_TEXTURE = CUSTOMER_ART.waiting;
export const SEAT_ACTOR_UV = { u0: 0.485, u1: 0.655, v0: 0.48, v1: 0.85 }; // 상체 bbox (하단 원점 v)

// 바 안쪽 주인공의 공유 기준 위치. 모든 화면 프리셋이 여기서 파생한다(§68).
export const PLAYER_EYE = { x: 0, y: 2.6, z: 12.0 };
export const SCREEN_TRANSITION_MS = 300;

// game.html 전용 프로덕션 그릴 칸(명성 해금, 최대 8). d1-game의 고정 6칸 D1 계약과 분리한 별도 키(pgSlot*).
// count개의 칸을 그릴 바디 폭에 균등 배치한다(seat과 같은 방식). renderer가 setGrillSlots로 재배치한다.
export const GRILL_MAX_SLOTS = 8;
export const DEFAULT_GRILL_SLOTS = 2;
export function computeGrillSlots(count) {
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
  custBg: { kind: 'image', full: true, layer: 'background', order: 0, url: CUSTOMER_ART.background, opaque: true },
  custCounter: { kind: 'image', full: true, layer: 'foreground', order: 50, url: CUSTOMER_ART.counter, opaque: false },

  // 조립 화면
  workbench: { rect: { x: 0.08, y: 0.44, width: 0.84, height: 0.50 }, layer: 'fixture', color: 0x5c4630, kind: 'plane' },
  binChicken: { rect: { x: 0.20, y: 0.60, width: 0.14, height: 0.16 }, layer: 'interactive', color: 0xd98a5f, kind: 'plane' },
  binLeek: { rect: { x: 0.40, y: 0.60, width: 0.14, height: 0.16 }, layer: 'interactive', color: 0x8fc06a, kind: 'plane' },
  jigSkewer: { rect: { x: 0.62, y: 0.55, width: 0.24, height: 0.08 }, layer: 'interactive', color: 0xc9a86a, kind: 'plane' },

  // 그릴 화면 (다중 칸). 대기 트레이의 꼬치를 빈 칸에 올려 각각 독립적으로 굽는다.
  grillBody: { rect: { x: 0.10, y: 0.42, width: 0.80, height: 0.50 }, layer: 'fixture', color: 0x3a3330, kind: 'plane' },
  grillWaitTray: { rect: D1_GRILL_WAITING_TRAY.rect, anchor: D1_GRILL_WAITING_TRAY.anchor, layer: 'interactive', color: 0xc9a86a, kind: 'plane' },
  ...createD1GrillObjects(), // d1-game용 D1 고정 6칸 (grillSlot0~5)
  ...productionGrillObjects(), // game.html용 프로덕션 그릴 8칸 (pgSlot0~7)
  grillFinishedTray: {
    key: D1_GRILL_FINISHED_TRAY.key,
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
    layer: 'fixture',
    color: 0x6f5437,
    kind: 'plane',
  },

  // 드링크 화면 (단일 레버: 위=거품, 아래=맥주. 잔 채움은 DOM 패널)
  drinkTower: { rect: { x: 0.44, y: 0.30, width: 0.12, height: 0.24 }, layer: 'fixture', color: 0x6b6f72, kind: 'plane' },
  glassRack: { rect: { x: 0.16, y: 0.58, width: 0.26, height: 0.14 }, layer: 'fixture', color: 0x3a2d20, kind: 'plane' },
  drinkLeverUpper: { rect: { x: 0.60, y: 0.40, width: 0.09, height: 0.08 }, layer: 'interactive', color: 0xe8d8a0, kind: 'plane' },
  drinkLeverLower: { rect: { x: 0.60, y: 0.49, width: 0.09, height: 0.08 }, layer: 'interactive', color: 0xc79a3a, kind: 'plane' },
};

// 좌석 (손님 화면). 좌석 수는 좌석 확장 업그레이드(seatCap 6→8→12)로 늘어난다. 좌석은 카운터 뒤 손님
// 액터, 좌석 위 말풍선(DOM), 카운터 위 serve 대상을 갖는다. 좌표는 정규화(top-left rect / center point).
export const MAX_SEATS = 12;
export const DEFAULT_SEAT_CAP = 6;
// cap개의 좌석을 카운터 폭에 균등 배치한다. cap=6은 기존 좌표(0.12~0.86)와 동일해 무회귀.
export function computeSeats(cap) {
  const n = Math.max(1, Math.min(MAX_SEATS, cap));
  const left = n <= 6 ? 0.12 : 0.06;
  const right = n <= 6 ? 0.86 : 0.94;
  const step = n > 1 ? (right - left) / (n - 1) : 0;
  const halfW = Math.min(0.055, step > 0 ? step * 0.42 : 0.055); // 액터 반폭(밀집 시 축소)
  return Array.from({ length: n }, (_, i) => {
    const cx = n === 1 ? 0.5 : left + step * i;
    return {
      id: `seat-${String(i + 1).padStart(2, '0')}`,
      actor: { x: cx - halfW, y: 0.15, width: halfW * 2, height: 0.40 }, // 카운터 뒤 상반신
      bubble: { x: cx, y: 0.10 }, // 말풍선·게이지 DOM 앵커 (좌석 위, 정규화 center)
      serve: { x: cx - halfW * 0.82, y: 0.55, width: halfW * 1.64, height: 0.10 }, // 카운터 위 serve 대상
      hit: { x: cx - halfW, y: 0.13, width: halfW * 2, height: 0.52 }, // 손님과 빈 좌석 정리용 투명 조작 영역
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
    objects: ['custBg', 'custCounter'], // 승인 아트 배경·카운터
    seats: SEAT_IDS, // 좌석 액터·serve는 렌더러가 SEATS로 생성
  },
  {
    id: 'SCR-SVC-ASSEMBLY',
    name: '조립',
    look: { x: 0.0, y: -2.6, z: -3.6 }, // 아래 작업대
    objects: ['bg', 'workbench', 'binChicken', 'binLeek', 'jigSkewer'],
  },
  {
    id: 'SCR-SVC-GRILL',
    name: '그릴',
    look: { x: 0.0, y: -2.4, z: -3.0 }, // 아래 그릴 (더 가까이)
    objects: ['bg', 'grillBody', 'grillWaitTray', ...D1_GRILL_SLOT_KEYS, ...GRILL_SLOT_KEYS, 'grillFinishedTray'],
  },
  {
    id: 'SCR-SVC-DRINK',
    name: '드링크',
    look: { x: 1.8, y: -1.4, z: -4.4 }, // 옆(오른쪽) 주류
    objects: ['bg', 'drinkTower', 'glassRack', 'drinkLeverUpper', 'drinkLeverLower'],
  },
];

export const SCREEN_IDS = SCREENS.map((s) => s.id);
export const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s]));
export const INITIAL_SCREEN = 'SCR-SVC-CUSTOMERS';
