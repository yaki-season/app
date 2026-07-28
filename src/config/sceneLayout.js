// SCN-001 단일 손님 회귀·통합 테스트 화면 레이아웃.
//
// 이 파일의 지속 카운터 구도와 더미 슬롯은 최신 SYS-002 v3 프로덕션 화면 계약이 아니다.
// 프로덕션은 같은 플레이어 기준 공간에서 독립 손님 정보/조립/그릴/드링크/서빙 프리셋을
// 활성화해야 한다. 아래 좌표는 아트와 무관한 테스트 화면용 고정 정규화 좌표다.

export const SCENE_MODE = 'single-customer-test';

// 레이어 z 깊이 (카메라는 +z에서 -z를 바라본다. 값이 작을수록 멀다.)
export const LAYER_Z = {
  background: -8, // 0 배경
  customer: -6, // 1 손님 (카운터 뒤)
  counter: -4, // 2 고정 카운터
  station: -2, // 3 스테이션 (플레이어측)
  interactive: -1.5, // 4 재료·꼬치·접시
  vfx: -1.2, // 5 연기·발광
  foreground: 0.5, // 6 전경 프레임
};

// 정규화 top-left 앵커 (x,y ∈ 0..1). 화면 매핑은 sceneRenderer가 한다.
export const ANCHORS = {
  hudSafeRect: { x: 0.06, y: 0.02, width: 0.88, height: 0.15 },
  customerSafeRect: { x: 0.08, y: 0.12, width: 0.84, height: 0.36 },
  stationSafeRect: { x: 0.04, y: 0.52, width: 0.92, height: 0.46 },
  barCounterBounds: { x: 0.02, y: 0.455, width: 0.96, height: 0.22 },
  playerWorkBounds: { x: 0.12, y: 0.52, width: 0.76, height: 0.46 },
  customerOcclusionLine: { fromY: 0.48, toY: 0.48 }, // 이 아래는 카운터가 손님 하체를 가린다
  seats: {
    'seat-01': { x: 0.12, y: 0.48 },
    'seat-02': { x: 0.272, y: 0.48 },
    'seat-03': { x: 0.424, y: 0.48 },
    'seat-04': { x: 0.576, y: 0.48 },
    'seat-05': { x: 0.728, y: 0.48 },
    'seat-06': { x: 0.88, y: 0.48 },
  },
  // 테스트 접시 전달 경로: 플레이어측 작업 anchor → 주문 매트 → 손님측 도착.
  handoffPath: [
    { x: 0.5, y: 0.78 },
    { x: 0.5, y: 0.56 },
    { x: 0.5, y: 0.47 },
  ],
};

// 츠키오카(단일 손님)는 테스트 화면에서만 seat-03 근처에 앉는다.
export const CUSTOMER_SEAT = 'seat-03';
export const CUSTOMER_STATES = ['waiting', 'tasting', 'satisfied', 'neutral', 'retry'];
export const CUSTOMER_ASSET_ID = {
  waiting: 'CH-TSUKIOKA-WAITING',
  tasting: 'CH-TSUKIOKA-TASTING',
  satisfied: 'CH-TSUKIOKA-SATISFIED',
  neutral: 'CH-TSUKIOKA-NEUTRAL',
  retry: 'CH-TSUKIOKA-RETRY',
};

// 테스트 전용 공정 프리셋. 배경·손님·카운터를 유지하고 하단만 바꾼다.
// 최신 프로덕션 SYS-002는 이 좌우 이동을 재사용하지 않는다.
export const CAMERA_PRESETS = {
  assembly: { x: -1.1, z: 6.0, targetX: -0.5 },
  grill: { x: 0.0, z: 4.6, targetX: 0.0 }, // 그릴은 확실히 push-in
  counter: { x: 1.1, z: 6.0, targetX: 0.5 },
};
export const CAMERA_TRANSITION_MS = 350;

// 더미 도형이 대신하는 테스트 에셋 슬롯. 프로덕션 아트 승인이나 독립 화면 인수의 근거가 아니다.
export const DUMMY_SLOTS = [
  { key: 'bg', layer: 'background', assetId: 'BG-INTERIOR-BASE', color: 0x241c15 },
  { key: 'seating', layer: 'background', assetId: 'BG-SEATING-6', color: 0x2c2118 },
  { key: 'customer', layer: 'customer', assetId: 'CH-TSUKIOKA-WAITING', color: 0x6f5a49 },
  { key: 'counter', layer: 'counter', assetId: 'BG-BAR-COUNTER-BASE', color: 0x4a3826 },
  { key: 'st-assembly', layer: 'station', assetId: 'ST-ASSEMBLY-TIER-1', color: 0x5c4630, process: 'assembly' },
  { key: 'st-grill', layer: 'station', assetId: 'ST-GRILL-TIER-1', color: 0x3a3330, process: 'grill' },
  { key: 'st-service', layer: 'station', assetId: 'ST-SERVICE-COUNTER', color: 0x584636, process: 'counter' },
  { key: 'foreground', layer: 'foreground', assetId: 'BG-FOREGROUND-FRAME', color: 0x140f0b },
];
