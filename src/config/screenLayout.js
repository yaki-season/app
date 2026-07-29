// 프로덕션 영업 화면 설정 단일 원본 (SYS-002 v3 §109).
//
// 손님·조립·그릴·드링크는 **같은 플레이어 기준 위치(PLAYER_EYE)에서 파생한 고정 원근 프리셋**이다
// (§68). 각 화면은 시선(look)만 달리하고, 필요한 객체만 활성화한다(§69). 카메라 포즈·객체 활성/비활성은
// productionRenderer가 이 데이터로 구동한다. 좌표는 정규화 top-left(x·y ∈ 0..1) 또는 월드 단위다.
//
// 증분 1은 더미 도형으로 구조만 세운다. 승인 아트가 오면 색·에셋만 교체한다(작업 022 인계 전 금지).

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
  eatingNegima: `${A}/d1-tsukioka-received-eating-negima-r1-b1.png`,
  eatingBeer: `${A}/d1-tsukioka-received-eating-beer-r1-b1.png`,
};
// 좌석 손님 액터에 입힐 텍스처(대기). 풀프레임 아트라 인물 영역만 UV로 잘라 쓴다.
export const SEAT_ACTOR_TEXTURE = CUSTOMER_ART.waiting;
export const SEAT_ACTOR_UV = { u0: 0.485, u1: 0.655, v0: 0.05, v1: 0.85 }; // 인물 bbox (하단 원점 v)

// 바 안쪽 주인공의 공유 기준 위치. 모든 화면 프리셋이 여기서 파생한다(§68).
export const PLAYER_EYE = { x: 0, y: 2.6, z: 12.0 };
export const SCREEN_TRANSITION_MS = 300;

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
  grillWaitTray: { rect: { x: 0.13, y: 0.50, width: 0.14, height: 0.14 }, layer: 'interactive', color: 0xc9a86a, kind: 'plane' },
  grillSlot0: { rect: { x: 0.40, y: 0.42, width: 0.10, height: 0.26 }, layer: 'interactive', color: 0xd98a5f, kind: 'grill' },
  grillSlot1: { rect: { x: 0.56, y: 0.42, width: 0.10, height: 0.26 }, layer: 'interactive', color: 0xd98a5f, kind: 'grill' },

  // 드링크 화면 (단일 레버: 위=거품, 아래=맥주. 잔 채움은 DOM 패널)
  drinkTower: { rect: { x: 0.44, y: 0.30, width: 0.12, height: 0.24 }, layer: 'fixture', color: 0x6b6f72, kind: 'plane' },
  glassRack: { rect: { x: 0.16, y: 0.58, width: 0.26, height: 0.14 }, layer: 'fixture', color: 0x3a2d20, kind: 'plane' },
  drinkLeverUpper: { rect: { x: 0.60, y: 0.40, width: 0.09, height: 0.08 }, layer: 'interactive', color: 0xe8d8a0, kind: 'plane' },
  drinkLeverLower: { rect: { x: 0.60, y: 0.49, width: 0.09, height: 0.08 }, layer: 'interactive', color: 0xc79a3a, kind: 'plane' },
};

// 6석 좌석 (손님 화면). 각 좌석은 카운터 뒤 손님 액터, 좌석 위 말풍선(DOM), 카운터 위 serve 대상을 갖는다.
// 006/GPL-003이 실제 손님·주문 데이터를 이 인터페이스로 꽂는다. 좌표는 정규화(top-left rect / center point).
const SEAT_X = [0.12, 0.268, 0.416, 0.564, 0.712, 0.86]; // 6석 중심 x
export const SEATS = SEAT_X.map((cx, i) => ({
  id: `seat-0${i + 1}`,
  actor: { x: cx - 0.055, y: 0.15, width: 0.11, height: 0.40 }, // 카운터 뒤 상반신
  bubble: { x: cx, y: 0.10 }, // 말풍선·게이지 DOM 앵커 (좌석 위, 정규화 center)
  serve: { x: cx - 0.045, y: 0.55, width: 0.09, height: 0.10 }, // 카운터 위 serve 대상
}));
export const SEAT_IDS = SEATS.map((s) => s.id);
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
    objects: ['bg', 'grillBody', 'grillWaitTray', 'grillSlot0', 'grillSlot1'],
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
