import {
  D1_RUNTIME_COMPONENT_INVENTORY,
  reportD1RuntimeComponentInventory,
} from './d1RuntimeInventory.js';

const D1_INVENTORY_SCREEN_TO_SCENE = Object.freeze({
  'SCR-SVC-CUSTOMERS': 'customer',
  'SCR-SVC-ASSEMBLY': 'assembly',
  'SCR-SVC-GRILL': 'grill',
  'SCR-SVC-DRINK': 'drink',
  'SCR-POST-CLOSING': 'closing',
  'SCR-POST-SETTLEMENT': 'settlement',
});

const D1_COOKING_PLACEHOLDER_SCENES = Object.freeze([
  'assembly',
  'grill',
  'drink',
]);

export const D1_RUNTIME_ASSET_ID = Object.freeze({
  CUSTOMER_BACKGROUND: 'ARTIST-010-BACKGROUND-COMPLETE',
  CUSTOMER_SEATING: 'BG-SEATING-6',
  SERVICE_TABLE: 'BG-SERVICE-TABLE-ARTIST009',
  TSUKIOKA_WAITING: 'D1-TSUKIOKA-WAITING',
  TSUKIOKA_PARTIAL_BEER: 'D1-TSUKIOKA-PARTIAL-BEER-WAITING',
  TSUKIOKA_RECEIVED_EATING: 'D1-TSUKIOKA-RECEIVED-EATING',
  ORDER_PANEL: 'UI-CUSTOMER-ORDER-WAIT-PANEL',
  ORDER_NEGIMA: 'UI-CUSTOMER-ORDER-ICON-NEGIMA',
  ORDER_DRAFT_BEER: 'UI-CUSTOMER-ORDER-ICON-DRAFT-BEER',
  DRINK_BACKGROUND: 'BG-WORKSPACE-DRINK',
  DRINK_STATION: 'ST-DRINK-BEER-TIER-1',
  GRILL_BACKGROUND: 'BG-WORKSPACE-GRILL',
  ASSEMBLY_BACKGROUND: 'BG-WORKSPACE-ASSEMBLY',
  ASSEMBLY_STATION: 'ST-ASSEMBLY-TIER-1',
  GRILL_STATION: 'ST-GRILL-TIER-1',
  GRILL_FINISHED_TRAY: 'ST-GRILL-FINISHED-TRAY',
});

export const D1_PENDING_RUNTIME_ASSET_IDS = Object.freeze({
  drink: Object.freeze([
    'MDL-BEER-GLASS',
    'MDL-BEER-LEVER',
    'TEX-BEER-LIQUID',
    'VFX-BEER-CORE',
  ]),
  assembly: Object.freeze([
    'MDL-SKEWER-BASE',
    'MDL-INGREDIENT-CHICKEN',
    'MDL-INGREDIENT-NEGI',
  ]),
  grill: Object.freeze([
    'ST-GRILL-WAITING-RACK',
    'MDL-NEGIMA-GRILL-RAW',
    'MDL-NEGIMA-GRILL-COOKING-FIRST-FACE',
    'MDL-NEGIMA-GRILL-COOKING-SECOND-FACE',
    'MDL-NEGIMA-GRILL-PROPER-FIRST-FACE',
    'MDL-NEGIMA-GRILL-PROPER-SECOND-FACE',
    'CMP-GRILL-FINISHED-PROPER-NEGIMA',
  ]),
});

export const D1_RECEIVED_EATING_FRAME_INTERVAL_MS = 1200;

export function runtimeAssetUrl(url, pathname = globalThis.location?.pathname ?? '/') {
  if (!pathname.startsWith('/src/') || url.startsWith('/public/')) return url;
  return `/public${url}`;
}

export function indexApprovedRuntimeAssets(manifest) {
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  return new Map(
    assets
      .filter((asset) => asset?.status === 'approved' && asset.id && asset.url)
      .map((asset) => [asset.id, asset]),
  );
}

function freezeIdList(ids) {
  return Object.freeze([...new Set(ids)]);
}

function difference(left, right) {
  const rightSet = new Set(right);
  return freezeIdList(left.filter((id) => !rightSet.has(id)));
}

export function auditD1RuntimeAssetBindingContract(
  inventory = D1_RUNTIME_COMPONENT_INVENTORY,
  runtimeAssetIds = D1_RUNTIME_ASSET_ID,
  pendingIdsByScene = D1_PENDING_RUNTIME_ASSET_IDS,
) {
  const inventoryBoundIds = freezeIdList(
    inventory
      .filter((entry) => entry.bindingState === 'bound')
      .map((entry) => entry.requiredAssetId),
  );
  const resolverBoundIds = freezeIdList(Object.values(runtimeAssetIds));
  const missingResolverBindingIds = difference(inventoryBoundIds, resolverBoundIds);
  const unexpectedResolverBindingIds = difference(resolverBoundIds, inventoryBoundIds);

  const pendingScenes = Object.freeze(Object.fromEntries(
    D1_COOKING_PLACEHOLDER_SCENES.map((scene) => {
      const inventoryPendingIds = freezeIdList(
        inventory
          .filter((entry) => (
            entry.bindingState !== 'bound'
            && D1_INVENTORY_SCREEN_TO_SCENE[entry.screenId] === scene
          ))
          .map((entry) => entry.requiredAssetId),
      );
      const resolverPendingIds = freezeIdList(pendingIdsByScene[scene] ?? []);
      return [scene, Object.freeze({
        inventoryPendingIds,
        resolverPendingIds,
        missingResolverPendingIds: difference(inventoryPendingIds, resolverPendingIds),
        unexpectedResolverPendingIds: difference(resolverPendingIds, inventoryPendingIds),
      })];
    }),
  ));

  const ownersByAssetId = new Map();
  for (const entry of inventory) {
    const owners = ownersByAssetId.get(entry.requiredAssetId) ?? new Set();
    owners.add(entry.semanticOwner);
    ownersByAssetId.set(entry.requiredAssetId, owners);
  }
  const semanticOwnerConflicts = Object.freeze(
    [...ownersByAssetId.entries()]
      .filter(([, owners]) => owners.size > 1)
      .map(([assetId, owners]) => Object.freeze({
        assetId,
        semanticOwners: freezeIdList([...owners]),
      })),
  );

  const pendingSceneMismatch = Object.values(pendingScenes).some((scene) => (
    scene.missingResolverPendingIds.length > 0
    || scene.unexpectedResolverPendingIds.length > 0
  ));
  return Object.freeze({
    valid: (
      missingResolverBindingIds.length === 0
      && unexpectedResolverBindingIds.length === 0
      && !pendingSceneMismatch
      && semanticOwnerConflicts.length === 0
    ),
    inventoryBoundIds,
    resolverBoundIds,
    missingResolverBindingIds,
    unexpectedResolverBindingIds,
    pendingScenes,
    semanticOwnerConflicts,
  });
}

export function reportD1RuntimeAssetReadiness(
  manifest,
) {
  const assetIndex = indexApprovedRuntimeAssets(manifest);
  const componentReport = reportD1RuntimeComponentInventory(manifest);
  const contractAudit = auditD1RuntimeAssetBindingContract();
  const requiredIds = freezeIdList(
    D1_RUNTIME_COMPONENT_INVENTORY.map((entry) => entry.requiredAssetId),
  );
  const boundEntries = D1_RUNTIME_COMPONENT_INVENTORY
    .filter((entry) => entry.bindingState === 'bound');
  const pendingEntries = D1_RUNTIME_COMPONENT_INVENTORY
    .filter((entry) => entry.bindingState !== 'bound');
  const placeholderIds = freezeIdList(componentReport.placeholderRequiredAssetIds);
  const missingManifestIds = freezeIdList(requiredIds.filter((id) => !assetIndex.has(id)));
  const unboundApprovedIds = freezeIdList(
    pendingEntries
      .filter((entry) => assetIndex.has(entry.requiredAssetId))
      .map((entry) => entry.requiredAssetId),
  );
  const placeholderIdsByScene = Object.freeze(Object.fromEntries(
    [...new Set(Object.values(D1_INVENTORY_SCREEN_TO_SCENE))].map((scene) => [
      scene,
      freezeIdList(componentReport.entries
        .filter((entry) => (
          entry.placeholder
          && D1_INVENTORY_SCREEN_TO_SCENE[entry.screenId] === scene
        ))
        .map((entry) => entry.requiredAssetId)),
    ]),
  ));

  return Object.freeze({
    ready: componentReport.ready && contractAudit.valid,
    requiredRuntimeCount: requiredIds.length,
    approvedRuntimeCount: requiredIds.filter((id) => assetIndex.has(id)).length,
    boundRuntimeCount: boundEntries
      .filter((entry) => assetIndex.has(entry.requiredAssetId)).length,
    placeholderCount: componentReport.placeholderCount,
    placeholderIds,
    placeholderIdsByScene,
    missingManifestIds,
    unboundApprovedIds,
    components: componentReport.entries,
    contractAudit,
  });
}

export function resolveApprovedRuntimeAsset(assetIndex, assetId) {
  const asset = assetIndex.get(assetId);
  if (!asset) return null;
  return Object.freeze({
    id: asset.id,
    url: runtimeAssetUrl(asset.url),
    sourceRevision: asset.sourceRevision,
    runtimeBuild: asset.runtimeBuild,
    pivot: asset.pivot,
    anchors: asset.anchors ?? [],
    companions: (asset.companions ?? []).map((companion) => ({
      ...companion,
      url: runtimeAssetUrl(companion.url),
    })),
  });
}

export async function loadD1RuntimeAssets(fetchImpl = globalThis.fetch) {
  const manifestUrl = globalThis.location?.pathname?.startsWith('/src/')
    ? '/public/assets/manifest.json'
    : '/assets/manifest.json';
  const response = await fetchImpl(manifestUrl);
  if (!response.ok) throw new Error(`runtime manifest 로드 실패 (${response.status})`);
  const manifest = await response.json();
  const index = indexApprovedRuntimeAssets(manifest);
  const resolved = {};
  for (const [key, id] of Object.entries(D1_RUNTIME_ASSET_ID)) {
    const asset = resolveApprovedRuntimeAsset(index, id);
    if (!asset) throw new Error(`승인 runtime manifest ID 누락: ${id}`);
    resolved[key] = asset;
  }
  resolved.readiness = reportD1RuntimeAssetReadiness(manifest);
  return Object.freeze(resolved);
}

export function resolveD1ReceivedEatingFrame(assets, nowMs = 0) {
  const received = assets.TSUKIOKA_RECEIVED_EATING;
  const drinkFrame = (received.companions ?? []).find((companion) => companion.role === 'drink-frame');
  if (!drinkFrame) return received;
  const frameIndex = Math.floor(Math.max(0, nowMs) / D1_RECEIVED_EATING_FRAME_INTERVAL_MS) % 2;
  return frameIndex === 0
    ? received
    : Object.freeze({ ...received, url: drinkFrame.url, frameRole: drinkFrame.role });
}

export function resolveD1CustomerAsset(assets, customerState, nowMs = 0) {
  if (customerState === 'partially-served') return assets.TSUKIOKA_PARTIAL_BEER;
  if (customerState === 'completed' || customerState === 'reacting') {
    return resolveD1ReceivedEatingFrame(assets, nowMs);
  }
  return assets.TSUKIOKA_WAITING;
}
