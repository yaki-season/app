// D1 단일 손님 플레이 화면 설정 (game.html의 6석 프로덕션과 별개). 승인 D1 아트가 있는 손님 화면은
// 실제 이미지 레이어로, 아직 아트가 없는 조립·그릴·드링크는 더미 도형으로 구성한다.
//
// 화면 프리셋은 game.html과 같은 방식(같은 PLAYER_EYE에서 시선만 달리)으로, 조립/그릴/드링크 더미 좌표는
// screenLayout과 동일하게 맞춰 조작감이 이어지게 한다. 손님 화면만 정면·수평 시선으로 풀프레임 아트를 합성한다.

import {
  D1_GRILL_FINISHED_TRAY,
  D1_GRILL_SLOT_KEYS,
  D1_GRILL_WAITING_TRAY,
  createD1GrillObjects,
} from './d1GrillLayout.js';

export const LAYER_Z = {
  background: -8,
  fixture: -4,
  actor: -6,
  interactive: -1.6,
  foreground: 0.5,
  // 손님 화면 아트 레이어 깊이 (배경 멀리·손님 중간·카운터 앞)
  artBg: -9,
  artCustomer: -6,
  artCounter: -3.5,
};

export const PLAYER_EYE = { x: 0, y: 2.6, z: 12.0 };
export const SCREEN_TRANSITION_MS = 300;

const A = '/assets/core/customer';
export const CUSTOMER_ART = {
  waiting: `${A}/d1-tsukioka-waiting-r2-b1.png`,
  partialBeer: `${A}/d1-tsukioka-partial-beer-waiting-r1-b1.png`,
  eatingNegima: `${A}/d1-tsukioka-received-eating-negima-r1-b1.png`,
  eatingBeer: `${A}/d1-tsukioka-received-eating-beer-r1-b1.png`,
};

export const OBJECTS = {
  // 비손님 화면 공용 더미 배경
  sbg: { kind: 'fullframe', layer: 'background', color: 0x241c15 },

  // ── 손님 화면: 승인 D1 아트 (풀프레임 이미지 레이어) ──
  custBg: { kind: 'image', full: true, z: 'artBg', url: `${A}/background-complete-r3-b1.png`, opaque: true },
  custCustomer: { kind: 'image', full: true, z: 'artCustomer', url: CUSTOMER_ART.waiting, opaque: false, swappable: true },
  custCounter: { kind: 'image', full: true, z: 'artCounter', url: `${A}/service-table-complete-r1-b1.png`, opaque: false },
  // 손님 클릭 영역(주문 접수·서빙). 손님 아트 위 투명 히트존.
  custServe: { rect: { x: 0.45, y: 0.24, width: 0.18, height: 0.34 }, layer: 'interactive', color: 0x8fd47a, kind: 'hotspot' },

  // ── 조립 화면 (더미, screenLayout와 동일 좌표) ──
  workbench: { rect: { x: 0.08, y: 0.44, width: 0.84, height: 0.50 }, layer: 'fixture', color: 0x5c4630, kind: 'plane' },
  binChicken: { rect: { x: 0.20, y: 0.60, width: 0.14, height: 0.16 }, layer: 'interactive', color: 0xd98a5f, kind: 'plane' },
  binLeek: { rect: { x: 0.40, y: 0.60, width: 0.14, height: 0.16 }, layer: 'interactive', color: 0x8fc06a, kind: 'plane' },
  jigSkewer: { rect: { x: 0.62, y: 0.55, width: 0.24, height: 0.08 }, layer: 'interactive', color: 0xc9a86a, kind: 'plane' },

  // ── 그릴 화면 (더미 + 익힘 셰이더) ──
  grillBody: { rect: { x: 0.10, y: 0.42, width: 0.80, height: 0.50 }, layer: 'fixture', color: 0x3a3330, kind: 'plane' },
  grillWaitTray: { rect: D1_GRILL_WAITING_TRAY.rect, anchor: D1_GRILL_WAITING_TRAY.anchor, layer: 'interactive', color: 0xc9a86a, kind: 'plane' },
  ...createD1GrillObjects(),
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

  // ── 드링크 화면 (더미) ──
  drinkTower: { rect: { x: 0.44, y: 0.30, width: 0.12, height: 0.24 }, layer: 'fixture', color: 0x6b6f72, kind: 'plane' },
  glassRack: { rect: { x: 0.16, y: 0.58, width: 0.26, height: 0.14 }, layer: 'fixture', color: 0x3a2d20, kind: 'plane' },
  drinkLeverUpper: { rect: { x: 0.60, y: 0.40, width: 0.09, height: 0.08 }, layer: 'interactive', color: 0xe8d8a0, kind: 'plane' },
  drinkLeverLower: { rect: { x: 0.60, y: 0.49, width: 0.09, height: 0.08 }, layer: 'interactive', color: 0xc79a3a, kind: 'plane' },
};

export const SCREENS = [
  {
    id: 'SCR-SVC-CUSTOMERS',
    name: '손님',
    look: { x: 0.0, y: PLAYER_EYE.y, z: -6.0 }, // 정면·수평 (풀프레임 아트 키스톤 방지)
    objects: ['custBg', 'custCustomer', 'custCounter', 'custServe'],
  },
  { id: 'SCR-SVC-ASSEMBLY', name: '조립', look: { x: 0.0, y: -2.6, z: -3.6 }, objects: ['sbg', 'workbench', 'binChicken', 'binLeek', 'jigSkewer'] },
  { id: 'SCR-SVC-GRILL', name: '그릴', look: { x: 0.0, y: -2.4, z: -3.0 }, objects: ['sbg', 'grillBody', 'grillWaitTray', ...D1_GRILL_SLOT_KEYS, 'grillFinishedTray'] },
  { id: 'SCR-SVC-DRINK', name: '드링크', look: { x: 1.8, y: -1.4, z: -4.4 }, objects: ['sbg', 'drinkTower', 'glassRack', 'drinkLeverUpper', 'drinkLeverLower'] },
];

export const SCREEN_IDS = SCREENS.map((s) => s.id);
export const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s]));
export const INITIAL_SCREEN = 'SCR-SVC-CUSTOMERS';
