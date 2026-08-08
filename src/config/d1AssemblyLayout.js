// D1 조립대의 승인 3D 에셋 배치 계약.
// ST-ASSEMBLY-TIER-1 위의 지그와 오른쪽 대기 트레이에만 모델을 올린다.

export const D1_ASSEMBLY_BUILD_SLOT = Object.freeze({
  key: 'assemblyBuildSlot',
  // 승인 검토본의 중심 (1042, 565)과 가로 꼬치 footprint를 따른다.
  rect: Object.freeze({ x: 0.425, y: 0.445, width: 0.235, height: 0.16 }),
  sourceModelTransform: Object.freeze({
    horizontalScale: 1,
    verticalScale: 1,
    fit: 'contain',
    // Local +Y is the skewer length axis. -90° maps handle→tip to left→right.
    rootRotationRadians: Object.freeze({ x: 0, y: 0, z: -Math.PI / 2 }),
  }),
});

export const D1_ASSEMBLY_TRAY_SLOTS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => Object.freeze({
    key: `assemblyTraySlot${index}`,
    // 오른쪽 전달 트레이 안에서 평행한 가로 꼬치가 아래로 겹쳐 쌓인다.
    rect: Object.freeze({
      x: 0.755 + (index % 2) * 0.004,
      y: 0.435 + index * 0.035,
      width: 0.19,
      height: 0.095,
    }),
    sourceModelTransform: Object.freeze({
      horizontalScale: 1,
      verticalScale: 1,
      fit: 'contain',
      rootRotationRadians: Object.freeze({ x: 0, y: 0, z: -Math.PI / 2 }),
    }),
  })),
);

export function createD1AssemblyObjects() {
  return Object.fromEntries([
    D1_ASSEMBLY_BUILD_SLOT,
    ...D1_ASSEMBLY_TRAY_SLOTS,
  ].map(({ key, rect }) => [key, {
    rect,
    layer: 'interactive',
    kind: 'hotspot',
    decorative: true,
  }]));
}
