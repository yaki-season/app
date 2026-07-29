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

// 바 안쪽 주인공의 공유 기준 위치. 모든 화면 프리셋이 여기서 파생한다(§68).
export const PLAYER_EYE = { x: 0, y: 2.6, z: 12.0 };
export const SCREEN_TRANSITION_MS = 300;

// 더미 오브젝트 레지스트리: key → { rect(정규화 top-left), layer, color, kind }.
// productionRenderer가 한 번 만들어두고 화면별로 visible 토글한다(단일 렌더러, §33).
export const OBJECTS = {
  // 공용 배경 (전 화면)
  bg: { rect: { x: 0, y: 0, width: 1, height: 1 }, layer: 'background', color: 0x241c15, kind: 'fullframe' },

  // 손님 화면
  seating: { rect: { x: 0.06, y: 0.10, width: 0.88, height: 0.40 }, layer: 'background', color: 0x2c2118, kind: 'plane' },
  counter: { rect: { x: 0.02, y: 0.52, width: 0.96, height: 0.26 }, layer: 'fixture', color: 0x4a3826, kind: 'plane' },
  customer: { rect: { x: 0.42, y: 0.16, width: 0.16, height: 0.42 }, layer: 'actor', color: 0x8a7563, kind: 'plane' },
  serveMat: { rect: { x: 0.40, y: 0.60, width: 0.20, height: 0.10 }, layer: 'interactive', color: 0x584636, kind: 'plane' },

  // 조립 화면
  workbench: { rect: { x: 0.08, y: 0.44, width: 0.84, height: 0.50 }, layer: 'fixture', color: 0x5c4630, kind: 'plane' },
  binChicken: { rect: { x: 0.20, y: 0.60, width: 0.14, height: 0.16 }, layer: 'interactive', color: 0xd98a5f, kind: 'plane' },
  binLeek: { rect: { x: 0.40, y: 0.60, width: 0.14, height: 0.16 }, layer: 'interactive', color: 0x8fc06a, kind: 'plane' },
  jigSkewer: { rect: { x: 0.62, y: 0.55, width: 0.24, height: 0.08 }, layer: 'interactive', color: 0xc9a86a, kind: 'plane' },

  // 그릴 화면
  grillBody: { rect: { x: 0.10, y: 0.46, width: 0.80, height: 0.46 }, layer: 'fixture', color: 0x3a3330, kind: 'plane' },
  grillSkewer: { rect: { x: 0.46, y: 0.44, width: 0.10, height: 0.26 }, layer: 'interactive', color: 0xd98a5f, kind: 'grill' },
  grillPlate: { rect: { x: 0.66, y: 0.60, width: 0.12, height: 0.12 }, layer: 'interactive', color: 0xe8e0d0, kind: 'plane' },

  // 드링크 화면
  drinkTower: { rect: { x: 0.44, y: 0.30, width: 0.12, height: 0.30 }, layer: 'fixture', color: 0x6b6f72, kind: 'plane' },
  glassRack: { rect: { x: 0.18, y: 0.58, width: 0.28, height: 0.14 }, layer: 'fixture', color: 0x3a2d20, kind: 'plane' },
  drinkLever: { rect: { x: 0.56, y: 0.44, width: 0.06, height: 0.14 }, layer: 'interactive', color: 0xb8862c, kind: 'plane' },
  drinkGlass: { rect: { x: 0.46, y: 0.62, width: 0.08, height: 0.12 }, layer: 'interactive', color: 0xdcc98a, kind: 'plane' },
};

// 화면 레지스트리. 좌·우 순서 = 배열 순서. 각 화면은 같은 PLAYER_EYE에서 look만 달리한다.
// look: 월드 단위 시선 지점 (손님=정면·위, 스테이션=아래, 드링크=옆).
export const SCREENS = [
  {
    id: 'SCR-SVC-CUSTOMERS',
    name: '손님',
    look: { x: 0.0, y: 0.4, z: -6.0 }, // 정면·위 (손님·카운터)
    objects: ['bg', 'seating', 'counter', 'customer', 'serveMat'],
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
    objects: ['bg', 'grillBody', 'grillSkewer', 'grillPlate'],
  },
  {
    id: 'SCR-SVC-DRINK',
    name: '드링크',
    look: { x: 1.8, y: -1.4, z: -4.4 }, // 옆(오른쪽) 주류
    objects: ['bg', 'drinkTower', 'glassRack', 'drinkLever', 'drinkGlass'],
  },
];

export const SCREEN_IDS = SCREENS.map((s) => s.id);
export const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s]));
export const INITIAL_SCREEN = 'SCR-SVC-CUSTOMERS';
