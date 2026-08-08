// D1 조립대의 승인 3D 에셋 배치 계약.
// ST-ASSEMBLY-TIER-1 위의 지그와 오른쪽 대기 트레이에만 모델을 올린다.

export const D1_ASSEMBLY_BUILD_SLOT = Object.freeze({
  key: 'assemblyBuildSlot',
  rect: Object.freeze({ x: 0.495, y: 0.405, width: 0.10, height: 0.29 }),
  sourceModelTransform: Object.freeze({
    horizontalScale: 1.35,
    verticalScale: 1.08,
    rootRotationRadians: Object.freeze({ x: -0.035, y: 0.055, z: 0 }),
  }),
});

export const D1_ASSEMBLY_TRAY_SLOTS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => Object.freeze({
    key: `assemblyTraySlot${index}`,
    // 오른쪽 트레이 안에서 살짝 겹쳐 쌓여 보이도록 배치한다.
    rect: Object.freeze({
      x: 0.735 + index * 0.036,
      y: 0.425 + (index % 2) * 0.012,
      width: 0.09,
      height: 0.27,
    }),
    sourceModelTransform: Object.freeze({
      horizontalScale: 1.35,
      verticalScale: 1.08,
      rootRotationRadians: Object.freeze({ x: -0.035, y: 0.055, z: 0 }),
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
