// D1 프로덕션 그릴의 화면 독립 레이아웃 계약.
// visualRect는 렌더 대상, hitRect는 투명 레이캐스트 대상이다. 둘을 별도 mesh로 소비해 hitRect를
// 확장해도 승인 visual을 이동·변형하지 않는다. 모든 값은 1920×1080 기준 top-left 정규화 좌표다.

export const D1_GRILL_REFERENCE_VIEWPORT = Object.freeze({ width: 1920, height: 1080 });

function normalizedRect({ x, y, width, height }) {
  return Object.freeze({
    x: x / D1_GRILL_REFERENCE_VIEWPORT.width,
    y: y / D1_GRILL_REFERENCE_VIEWPORT.height,
    width: width / D1_GRILL_REFERENCE_VIEWPORT.width,
    height: height / D1_GRILL_REFERENCE_VIEWPORT.height,
  });
}

function normalizedPoint({ x, y }) {
  return Object.freeze({
    x: x / D1_GRILL_REFERENCE_VIEWPORT.width,
    y: y / D1_GRILL_REFERENCE_VIEWPORT.height,
  });
}

export const D1_GRILL_SLOT_KEYS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => `grillSlot${index}`),
);

export const D1_GRILL_FOOD_STATE_KEYS = Object.freeze([
  'raw',
  'cooking',
  'flipped',
  'proper',
  'burnt',
]);

const RAW_R3_ALPHA_BBOX_FHD = Object.freeze({ x: 545, y: 257, width: 131, height: 516 });
const RAW_R3_ALPHA_BBOX_720 = Object.freeze({ x: 363, y: 171, width: 88, height: 344 });
const RAW_R3_SLOT0_ANCHOR_FHD = Object.freeze({ x: 609.6, y: 515 });
const RAW_R3_SLOT0_VISUAL_RECT = normalizedRect(RAW_R3_ALPHA_BBOX_FHD);
const RAW_R3_SLOT0_ANCHOR = normalizedPoint(RAW_R3_SLOT0_ANCHOR_FHD);
const SLOT_LANE_STEP_FHD = 153.6;
const SLOT_HIT_LEFT = Object.freeze([0.285, 0.365, 0.445, 0.525, 0.605, 0.685]);
const RAW_R3_SOURCE_MODEL_TRANSFORM = Object.freeze({
  // The grill consumes the whole skewer as one prop. Preserve its authored aspect ratio;
  // stretching or tilting the root turns chicken into blocks and makes the sprite feel pasted on.
  fit: 'contain',
  horizontalScale: 1,
  verticalScale: 1,
  rootRotationRadians: Object.freeze({ x: 0, y: 0, z: 0 }),
});

// Artist 1의 사용자 승인 station consumption R3를 runtime screen-space 계약으로만 소비한다.
// 승인 모델의 runtime 등록은 finalizer gate 전까지 계속 금지되며 이 계약은 manifest를 변경하지 않는다.
export const D1_GRILL_FOOD_FOOTPRINT = Object.freeze({
  stableAssetId: 'MDL-NEGIMA-GRILL-RAW',
  sourceRevision: 1,
  reviewRevision: 3,
  approvedReviewSha256: 'f13b3808b56c9462854c863c6b8843206aebfbbf2bf5669b1fb86d5bbc5a1579',
  runtimeRegistrationAllowed: false,
  sourceMasterId: 'CM-GRILL-STATION-QUEUED-SELECTION',
  sourceMasterRevision: 3,
  approvedAlphaBBoxFhd: RAW_R3_ALPHA_BBOX_FHD,
  approvedAlphaBBox720: RAW_R3_ALPHA_BBOX_720,
  slot0VisualRect: RAW_R3_SLOT0_VISUAL_RECT,
  slot0Anchor: RAW_R3_SLOT0_ANCHOR,
  laneStep: normalizedPoint({ x: SLOT_LANE_STEP_FHD, y: 0 }),
  sourceModelTransform: RAW_R3_SOURCE_MODEL_TRANSFORM,
});

export const D1_GRILL_SLOTS = Object.freeze(SLOT_HIT_LEFT.map((hitX, index) => {
  const visualRect = index === 0
    ? RAW_R3_SLOT0_VISUAL_RECT
    : normalizedRect({
        ...RAW_R3_ALPHA_BBOX_FHD,
        x: RAW_R3_ALPHA_BBOX_FHD.x + SLOT_LANE_STEP_FHD * index,
      });
  const anchor = index === 0
    ? RAW_R3_SLOT0_ANCHOR
    : normalizedPoint({
        x: RAW_R3_SLOT0_ANCHOR_FHD.x + SLOT_LANE_STEP_FHD * index,
        y: RAW_R3_SLOT0_ANCHOR_FHD.y,
      });
  // R3는 시각 footprint만 확장한다. 기존 raycast 면적은 입력 회귀가 없어 그대로 유지한다.
  const hitRect = Object.freeze({ x: hitX, y: 0.42, width: 0.065, height: 0.30 });
  // 모든 조리 상태는 같은 screen-space 위치·크기와 source model scale을 소비한다.
  const sharedStateTransform = Object.freeze({
    visualRect,
    anchor,
    sourceModelTransform: RAW_R3_SOURCE_MODEL_TRANSFORM,
  });
  const stateTransforms = Object.freeze(Object.fromEntries(
    D1_GRILL_FOOD_STATE_KEYS.map((state) => [state, sharedStateTransform]),
  ));

  return Object.freeze({
    index,
    key: D1_GRILL_SLOT_KEYS[index],
    visualRect,
    hitRect,
    anchor,
    stateTransforms,
  });
}));

// setGrillSlots의 legacy placeBillboard는 화면 중심에서 벗어날수록 camera depth 대신 대각선
// 거리를 써 mesh를 키운다. renderer 공용 경로를 바꾸지 않고 D1 실제 투영을 승인 rect에 맞추기
// 위해 중심을 고정한 채 그 배율의 역수만큼 요청 rect를 줄인다(FOV 42°, 16:9 고정 계약).
function rendererCompensatedRect(rect) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const tanHalf = Math.tan((42 / 2) * (Math.PI / 180));
  const rayX = (centerX * 2 - 1) * (16 / 9) * tanHalf;
  const rayY = -(centerY * 2 - 1) * tanHalf;
  const offAxisScale = Math.hypot(1, rayX, rayY);
  const width = rect.width / offAxisScale;
  const height = rect.height / offAxisScale;
  return Object.freeze({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  });
}

// Public D1은 명성 해금형 game.html과 달리 첫 주문 batch의 두 칸만 사용한다. pgSlot*는
// 단일 mesh가 visual과 raycast를 함께 맡으므로 실제 투영된 두 면 모두 approvedVisualRect다.
export const D1_PUBLIC_GRILL_LAYOUT = Object.freeze({
  contractId: 'D1-FIRST-BATCH-R3',
  initialPlacementSlots: Object.freeze([1, 2]),
  // Two-skewer D1 composition on the new full-width grate. Both lanes sit around the ember
  // core, with the rear/right lane slightly shorter and higher to follow the tabletop depth.
  slots: Object.freeze([
    { x: 744, y: 274, width: 132, height: 438 },
    { x: 1052, y: 262, width: 126, height: 420 },
  ].map((fhdRect, index) => {
    const visualRect = normalizedRect(fhdRect);
    return Object.freeze({
      key: `pgSlot${index}`,
      rect: rendererCompensatedRect(visualRect),
      approvedVisualRect: visualRect,
    });
  })),
});

// D4부터 명성 업그레이드를 적용했을 때 사용하는 3칸 구성. 기존 두 칸과 같은 승인
// footprint를 유지하면서 석쇠 안쪽에 세 꼬치가 같은 간격으로 놓이도록 별도 계약으로 둔다.
// 자동 균등 배치(computeGrillSlots(3))는 꼬치가 지나치게 작아지므로 공개 영업 화면에서는
// 이 명시 레이아웃만 사용한다.
export const D4_PUBLIC_GRILL_LAYOUT = Object.freeze({
  contractId: 'D4-REPUTATION-THREE-SLOTS-R1',
  initialPlacementSlots: Object.freeze([1, 2, 3]),
  slots: Object.freeze([
    { x: 640, y: 278, width: 124, height: 412 },
    { x: 896, y: 266, width: 128, height: 426 },
    { x: 1152, y: 278, width: 124, height: 412 },
  ].map((fhdRect, index) => {
    const visualRect = normalizedRect(fhdRect);
    return Object.freeze({
      key: `pgSlot${index}`,
      rect: rendererCompensatedRect(visualRect),
      approvedVisualRect: visualRect,
    });
  })),
});

// CM-GRILL-STATION-QUEUED-SELECTION R3에서 연속 석쇠 안쪽만 보수적으로 잡은 검증 경계.
// 아트 추출/등록용 bbox가 아니라 슬롯 overlay가 물리 석쇠를 벗어나지 않는지 검사하는 runtime 경계다.
export const D1_GRILL_MASTER_GRATE_SAFE_RECT = normalizedRect({
  x: 500,
  y: 210,
  width: 960,
  height: 580,
});

export const D1_GRILL_WAITING_TRAY = Object.freeze({
  key: 'grillWaitTray',
  rect: Object.freeze({ x: 0.105, y: 0.49, width: 0.14, height: 0.17 }),
  anchor: Object.freeze({ x: 0.175, y: 0.575 }),
});

const FINISHED_TRAY_VISUAL_RECT = normalizedRect({ x: 1534, y: 123, width: 266, height: 354 });
const FINISHED_TRAY_HIT_RECT = normalizedRect({ x: 1534, y: 123, width: 266, height: 354 });

export const D1_GRILL_FINISHED_TRAY = Object.freeze({
  key: 'grillFinishedTray',
  componentId: 'grill.finished',
  stableAssetId: 'ST-GRILL-FINISHED-TRAY',
  sourceRevision: 6,
  approvedAssetSha256: '51abf390cbf31d40b50a7d99f08a5d37a2da70df6cf94d405788538bad7d9184',
  runtimeRegistrationAllowed: false,
  sourceMasterId: 'CM-GRILL-STATION-QUEUED-SELECTION',
  sourceMasterRevision: 3,
  // rect는 기존 소비자를 위한 visualRect alias다. 클릭 판정은 반드시 hitRect/hitTarget을 사용한다.
  rect: FINISHED_TRAY_VISUAL_RECT,
  visualRect: FINISHED_TRAY_VISUAL_RECT,
  // R6 alphaBBox 전체가 클릭되도록 현재 hitRect는 visualRect와 같다. 추후 확장하더라도
  // visualRect와 reservedBounds는 승인 좌표에 고정한다.
  hitRect: FINISHED_TRAY_HIT_RECT,
  reservedBounds: FINISHED_TRAY_VISUAL_RECT,
  anchor: normalizedPoint({ x: 1643, y: 301 }),
});

export const D1_GRILL_LAYER_OWNERSHIP = Object.freeze({
  background: Object.freeze({
    owner: 'artist-1',
    responsibility: '승인 master와 같은 full-frame 카메라·원근·프레임·작업면',
  }),
  grate: Object.freeze({
    owner: 'artist-1',
    responsibility: 'master-aligned empty grill base의 석쇠·숯불 고정 raster',
  }),
  finishedTray: Object.freeze({
    owner: 'artist-1',
    responsibility: 'ST-GRILL-FINISHED-TRAY 시각 자산; visualRect/reservedBounds는 runtime 계약에 고정',
  }),
  foodOverlay: Object.freeze({
    owner: 'developer-1',
    responsibility: 'grillSlot0~5 visualRect, 접촉면·방향·익힘 상태와 finished 전달',
  }),
});

export function rectAtViewport(rect, width, height) {
  return {
    x: rect.x * width,
    y: rect.y * height,
    width: rect.width * width,
    height: rect.height * height,
  };
}

export function createD1GrillObjects() {
  return Object.fromEntries(D1_GRILL_SLOTS.map(({
    key,
    visualRect,
    hitRect,
    anchor,
    stateTransforms,
    index,
  }) => [key, {
    rect: visualRect,
    visualRect,
    hitRect,
    hitTarget: hitRect,
    anchor,
    stateTransforms,
    foodFootprint: D1_GRILL_FOOD_FOOTPRINT,
    slotIndex: index,
    layer: 'interactive',
    color: 0xd98a5f,
    kind: 'grill',
  }]));
}
