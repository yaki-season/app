// SYS-002 2.5D 장면 레이아웃 계약.
//
// 레이어 깊이, 앵커(정규화 top-left), 카메라 프리셋, 그리고 더미 도형이 대신할 실제 에셋 ID를
// 한 곳에 고정한다. 아트가 승인되면 각 슬롯의 assetId 텍스처만 갈아끼우면 된다.
// 좌표는 `public/assets/core/metadata/p0-environment-layout.json`(desktop-16x9)에서 가져왔다.

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
  // 접시 전달 경로: 플레이어측 작업 anchor → 주문 매트 → 손님측 도착 (SYS-002 §20)
  handoffPath: [
    { x: 0.5, y: 0.78 },
    { x: 0.5, y: 0.56 },
    { x: 0.5, y: 0.47 },
  ],
};

// 츠키오카(단일 손님)는 seat-03 근처에 앉는다. 상태 이름으로만 텍스처 교체 (SYS-002 §13).
export const CUSTOMER_SEAT = 'seat-03';
export const CUSTOMER_STATES = ['waiting', 'tasting', 'satisfied', 'neutral', 'retry'];
export const CUSTOMER_ASSET_ID = {
  waiting: 'CH-TSUKIOKA-WAITING',
  tasting: 'CH-TSUKIOKA-TASTING',
  satisfied: 'CH-TSUKIOKA-SATISFIED',
  neutral: 'CH-TSUKIOKA-NEUTRAL',
  retry: 'CH-TSUKIOKA-RETRY',
};

// 셰프측 고정 원근 카메라의 공정별 프리셋. 배경·손님·카운터는 유지하고 하단만 바꾼다 (SYS-002 §5,6).
// 짧은 좌우 이동 + 작업대 push-in. 전환은 0.25~0.45초 ease-out.
export const CAMERA_PRESETS = {
  assembly: { x: -0.6, z: 6.0, targetX: -0.3 },
  grill: { x: 0.0, z: 5.4, targetX: 0.0 }, // 그릴은 살짝 push-in
  counter: { x: 0.6, z: 6.0, targetX: 0.3 },
};
export const CAMERA_TRANSITION_MS = 350;

// 더미 도형이 대신하는 에셋 슬롯. layer·assetId·색(더미)·앵커를 고정한다.
// 아트 승인 시 assetId 텍스처로 교체하면 배치가 그대로 유지된다.
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
