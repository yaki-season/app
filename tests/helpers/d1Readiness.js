// D1 아트 준비도 기대값을 inventory 선언 하나에서 파생한다.
//
// 아트가 하나 승인될 때마다 단위·통합·E2E 여러 곳의 숫자를 손으로 고쳐야 했다. 이제 inventory
// 행의 bindingState만 바꾸면 모든 기대값이 따라온다.
//
// 집계 규칙은 runtimeAssetResolver 구현을 import하지 않고 여기서 독립으로 다시 쓴다. 그래야
// 구현이 규칙을 어겼을 때 테스트가 잡아낸다. 구현을 그대로 불러오면 자기 자신을 검증하게 된다.
import { D1_RUNTIME_COMPONENT_INVENTORY } from '../../src/assets/d1RuntimeInventory.js';

// 구현의 private 매핑을 그대로 참조하지 않고 계약으로 다시 선언한다.
export const D1_SCENE_BY_SCREEN = Object.freeze({
  'SCR-SVC-CUSTOMERS': 'customer',
  'SCR-SVC-ASSEMBLY': 'assembly',
  'SCR-SVC-GRILL': 'grill',
  'SCR-SVC-DRINK': 'drink',
  'SCR-POST-CLOSING': 'closing',
  'SCR-POST-SETTLEMENT': 'settlement',
});

// placeholder 판정: code-native는 등록할 파일이 없으므로 제외하고, bound인데 manifest 승인이
// 없으면 아직 placeholder다.
function isPlaceholder(row, approved) {
  if (row.bindingState === 'code-native') return false;
  return row.bindingState !== 'bound' || !approved.has(row.requiredAssetId);
}

export function approvedIdsFromManifest(manifest) {
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  return new Set(
    assets
      .filter((asset) => asset?.status === 'approved' && asset.id && asset.url)
      .map((asset) => asset.id),
  );
}

export function d1ReadinessExpectation(approvedIds, inventory = D1_RUNTIME_COMPONENT_INVENTORY) {
  const approved = approvedIds instanceof Set ? approvedIds : new Set(approvedIds ?? []);
  const placeholders = inventory.filter((row) => isPlaceholder(row, approved));
  const byScene = Object.fromEntries(
    [...new Set(Object.values(D1_SCENE_BY_SCREEN))].map((scene) => [scene, 0]),
  );
  for (const row of placeholders) byScene[D1_SCENE_BY_SCREEN[row.screenId]] += 1;

  const withState = (state) => inventory.filter((row) => row.bindingState === state);
  return Object.freeze({
    requiredRuntimeCount: inventory.length,
    approvedRuntimeCount: inventory.filter((row) => approved.has(row.requiredAssetId)).length,
    boundRuntimeCount:
      withState('bound').filter((row) => approved.has(row.requiredAssetId)).length
      + withState('code-native').length,
    placeholderCount: placeholders.length,
    unboundApprovedCount:
      withState('pending').filter((row) => approved.has(row.requiredAssetId)).length,
    boundRowCount: withState('bound').length,
    placeholderCountByScene: Object.freeze(byScene),
    placeholderIds: Object.freeze(placeholders.map((row) => row.requiredAssetId)),
  });
}
