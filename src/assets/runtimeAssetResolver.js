import {
  D1_RUNTIME_COMPONENT_INVENTORY,
  reportD1RuntimeComponentInventory,
  withD1RuntimeBoundAssetIds,
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
  CUSTOMER_INTERIOR_BACKGROUND: 'BG-INTERIOR-BASE',
  CUSTOMER_SEATING: 'BG-SEATING-6',
  SERVICE_TABLE: 'BG-SERVICE-TABLE-ARTIST009',
  TSUKIOKA_WAITING: 'D1-TSUKIOKA-WAITING',
  TSUKIOKA_PARTIAL_BEER: 'D1-TSUKIOKA-PARTIAL-BEER-WAITING',
  TSUKIOKA_RECEIVED_EATING: 'D1-TSUKIOKA-RECEIVED-EATING',
  COMMUTER_CUSTOMER: 'CH-EXTRA-COMMUTER-SERVICE',
  SOLO_CUSTOMER: 'CH-EXTRA-SOLO-SERVICE',
  SERVICE_COUNTER: 'ST-SERVICE-COUNTER',
  SERVING_PLATE: 'PR-SERVING-PLATE',
  EMPTY_DISH_SET: 'PR-EMPTY-DISH-SET',
  CLEANUP_OVERLAY: 'ST-CLEANUP-OVERLAY',
  ORDER_PANEL: 'UI-CUSTOMER-ORDER-WAIT-PANEL',
  ORDER_NEGIMA: 'UI-CUSTOMER-ORDER-ICON-NEGIMA',
  ORDER_DRAFT_BEER: 'UI-CUSTOMER-ORDER-ICON-DRAFT-BEER',
  DRINK_BACKGROUND: 'BG-WORKSPACE-DRINK',
  DRINK_STATION: 'ST-DRINK-BEER-TIER-1',
  BEER_GLASS: 'MDL-BEER-GLASS',
  BEER_LEVER: 'MDL-BEER-LEVER',
  GRILL_BACKGROUND: 'BG-WORKSPACE-GRILL',
  ASSEMBLY_BACKGROUND: 'BG-WORKSPACE-ASSEMBLY',
  ASSEMBLY_STATION: 'ST-ASSEMBLY-TIER-1',
  ASSEMBLY_TRAY_NEGIMA: 'SPR-ASSEMBLY-TRAY-NEGIMA',
  GRILL_STATION: 'ST-GRILL-TIER-1',
  GRILL_FINISHED_TRAY: 'ST-GRILL-FINISHED-TRAY',
});

export const D1_PENDING_RUNTIME_ASSET_IDS = Object.freeze({
  drink: Object.freeze([]),
  assembly: Object.freeze([
    'MDL-SKEWER-BASE',
    'MDL-INGREDIENT-CHICKEN',
    'MDL-INGREDIENT-NEGI',
  ]),
  grill: Object.freeze([
    'ST-GRILL-WAITING-RACK',
    'MDL-NEGIMA-GRILL-RAW',
    'MDL-NEGIMA-GRILL-COOKING-FIRST-FACE',
    'MDL-NEGIMA-GRILL-PROPER-FIRST-FACE',
    'MDL-NEGIMA-GRILL-PROPER-SECOND-FACE',
    'CMP-GRILL-FINISHED-PROPER-NEGIMA',
  ]),
});

export const D1_RECEIVED_EATING_FRAME_INTERVAL_MS = 1200;

export const D1_RAW_NEGIMA_RUNTIME_ASSET_ID = Object.freeze({
  COMPOSITION: 'MDL-NEGIMA-GRILL-RAW',
  SKEWER_BASE: 'MDL-SKEWER-BASE',
  CHICKEN: 'MDL-INGREDIENT-CHICKEN',
  NEGI: 'MDL-INGREDIENT-NEGI',
});

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
          entry.bindingState === 'pending'
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
  {
    inventory = D1_RUNTIME_COMPONENT_INVENTORY,
    runtimeAssetIds = D1_RUNTIME_ASSET_ID,
    pendingIdsByScene = D1_PENDING_RUNTIME_ASSET_IDS,
  } = {},
) {
  const assetIndex = indexApprovedRuntimeAssets(manifest);
  const componentReport = reportD1RuntimeComponentInventory(manifest, inventory);
  const contractAudit = auditD1RuntimeAssetBindingContract(
    inventory,
    runtimeAssetIds,
    pendingIdsByScene,
  );
  const requiredIds = freezeIdList(
    inventory.map((entry) => entry.requiredAssetId),
  );
  const boundEntries = inventory
    .filter((entry) => entry.bindingState === 'bound');
  const pendingEntries = inventory
    .filter((entry) => entry.bindingState === 'pending');
  const codeNativeEntries = inventory
    .filter((entry) => entry.bindingState === 'code-native');
  const placeholderIds = freezeIdList(componentReport.placeholderRequiredAssetIds);
  const codeNativeIds = new Set(codeNativeEntries.map((entry) => entry.requiredAssetId));
  const missingManifestIds = freezeIdList(requiredIds.filter((id) => (
    !codeNativeIds.has(id) && !assetIndex.has(id)
  )));
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
      .filter((entry) => assetIndex.has(entry.requiredAssetId)).length + codeNativeEntries.length,
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
    sha256: asset.sha256,
    bytes: asset.bytes,
    format: asset.format,
    pivot: asset.pivot,
    anchors: asset.anchors ?? [],
    companions: (asset.companions ?? []).map((companion) => ({
      ...companion,
      url: runtimeAssetUrl(companion.url),
    })),
  });
}

function pixelAlbedoFor(asset) {
  return asset?.companions?.find((companion) => companion.role === 'pixel-albedo') ?? null;
}

// RAW composition 자체와 실제로 조립에 쓰이는 세 승인 model/albedo pair를 한 계약으로
// 해석한다. 일부만 있으면 잘못된 fallback 조합을 만들지 않고 전체 bundle을 거부한다.
export function resolveD1RawNegimaRuntimeBundle(assetIndex) {
  const composition = resolveApprovedRuntimeAsset(
    assetIndex,
    D1_RAW_NEGIMA_RUNTIME_ASSET_ID.COMPOSITION,
  );
  if (!composition) return null;

  const skewerBase = resolveApprovedRuntimeAsset(
    assetIndex,
    D1_RAW_NEGIMA_RUNTIME_ASSET_ID.SKEWER_BASE,
  );
  const chicken = resolveApprovedRuntimeAsset(
    assetIndex,
    D1_RAW_NEGIMA_RUNTIME_ASSET_ID.CHICKEN,
  );
  const negi = resolveApprovedRuntimeAsset(
    assetIndex,
    D1_RAW_NEGIMA_RUNTIME_ASSET_ID.NEGI,
  );
  const traySprite = resolveApprovedRuntimeAsset(
    assetIndex,
    D1_RUNTIME_ASSET_ID.ASSEMBLY_TRAY_NEGIMA,
  );
  if (!traySprite) throw new Error('RAW 네기마 조립 트레이 sprite 누락');
  const sources = { skewerBase, chicken, negi };
  for (const [sourceName, asset] of Object.entries(sources)) {
    if (!asset) throw new Error(`RAW 네기마 승인 source model 누락: ${sourceName}`);
    if (!pixelAlbedoFor(asset)) {
      throw new Error(`RAW 네기마 pixel-albedo companion 누락: ${asset.id}`);
    }
  }

  return Object.freeze({
    composition,
    traySprite,
    sources: Object.freeze(Object.fromEntries(
      Object.entries(sources).map(([key, model]) => [key, Object.freeze({
        model,
        albedo: pixelAlbedoFor(model),
      })]),
    )),
  });
}

// 정적 inventory에서 pending인 RAW를 실제 7-file load 뒤에만 bound로 승격해 공개하는
// runtime-only readiness다. 호출 전에는 기존 report가 RAW를 unboundApprovedIds에 유지한다.
export function reportD1RawNegimaExactLoadReadiness(manifest) {
  const inventory = withD1RuntimeBoundAssetIds([
    ...Object.values(D1_RAW_NEGIMA_RUNTIME_ASSET_ID),
  ]);
  const runtimeAssetIds = Object.freeze({
    ...D1_RUNTIME_ASSET_ID,
    GRILL_RAW: D1_RAW_NEGIMA_RUNTIME_ASSET_ID.COMPOSITION,
    ASSEMBLY_SKEWER_BASE: D1_RAW_NEGIMA_RUNTIME_ASSET_ID.SKEWER_BASE,
    ASSEMBLY_CHICKEN: D1_RAW_NEGIMA_RUNTIME_ASSET_ID.CHICKEN,
    ASSEMBLY_NEGI: D1_RAW_NEGIMA_RUNTIME_ASSET_ID.NEGI,
  });
  const pendingIdsByScene = Object.freeze({
    ...D1_PENDING_RUNTIME_ASSET_IDS,
    assembly: Object.freeze([]),
    grill: Object.freeze(D1_PENDING_RUNTIME_ASSET_IDS.grill.filter(
      (id) => id !== D1_RAW_NEGIMA_RUNTIME_ASSET_ID.COMPOSITION,
    )),
  });
  return reportD1RuntimeAssetReadiness(manifest, {
    inventory,
    runtimeAssetIds,
    pendingIdsByScene,
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
  resolved.GRILL_RAW_BUNDLE = resolveD1RawNegimaRuntimeBundle(index);
  resolved.manifest = manifest;
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
