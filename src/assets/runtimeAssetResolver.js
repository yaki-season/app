export const D1_RUNTIME_ASSET_ID = Object.freeze({
  CUSTOMER_BACKGROUND: 'ARTIST-010-BACKGROUND-COMPLETE',
  SERVICE_TABLE: 'BG-SERVICE-TABLE-ARTIST009',
  TSUKIOKA_WAITING: 'D1-TSUKIOKA-WAITING',
  TSUKIOKA_PARTIAL_BEER: 'D1-TSUKIOKA-PARTIAL-BEER-WAITING',
  TSUKIOKA_RECEIVED_EATING: 'D1-TSUKIOKA-RECEIVED-EATING',
  ORDER_PANEL: 'UI-CUSTOMER-ORDER-WAIT-PANEL',
  ORDER_NEGIMA: 'UI-CUSTOMER-ORDER-ICON-NEGIMA',
  ORDER_DRAFT_BEER: 'UI-CUSTOMER-ORDER-ICON-DRAFT-BEER',
});

export const D1_PENDING_RUNTIME_ASSET_IDS = Object.freeze({
  drink: Object.freeze([
    'BG-WORKSPACE-DRINK',
    'ST-DRINK-BEER-TIER-1',
    'MDL-BEER-GLASS',
    'MDL-BEER-LEVER',
  ]),
  assembly: Object.freeze([
    'BG-WORKSPACE-ASSEMBLY',
    'ST-ASSEMBLY-TIER-1',
    'MDL-SKEWER-BASE',
    'MDL-INGREDIENT-CHICKEN',
    'MDL-INGREDIENT-NEGI',
  ]),
  grill: Object.freeze([
    'BG-WORKSPACE-GRILL',
    'ST-GRILL-TIER-1',
    'ST-GRILL-WAITING-RACK',
    'MDL-NEGIMA-GRILL-RAW',
    'MDL-NEGIMA-GRILL-COOKING-FIRST-FACE',
    'MDL-NEGIMA-GRILL-COOKING-SECOND-FACE',
  ]),
});

export function runtimeAssetUrl(url, pathname = globalThis.location?.pathname ?? '/') {
  return pathname.startsWith('/src/') ? `/public${url}` : url;
}

export function indexApprovedRuntimeAssets(manifest) {
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  return new Map(
    assets
      .filter((asset) => asset?.status === 'approved' && asset.id && asset.url)
      .map((asset) => [asset.id, asset]),
  );
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
  const index = indexApprovedRuntimeAssets(await response.json());
  const resolved = {};
  for (const [key, id] of Object.entries(D1_RUNTIME_ASSET_ID)) {
    const asset = resolveApprovedRuntimeAsset(index, id);
    if (!asset) throw new Error(`승인 runtime manifest ID 누락: ${id}`);
    resolved[key] = asset;
  }
  return Object.freeze(resolved);
}

export function resolveD1CustomerAsset(assets, customerState) {
  if (customerState === 'partially-served') return assets.TSUKIOKA_PARTIAL_BEER;
  if (customerState === 'completed') {
    const received = assets.TSUKIOKA_RECEIVED_EATING;
    const drinkFrame = received.companions.find((companion) => companion.role === 'drink-frame');
    return drinkFrame ? Object.freeze({ ...received, url: drinkFrame.url }) : received;
  }
  if (customerState === 'reacting') return assets.TSUKIOKA_RECEIVED_EATING;
  return assets.TSUKIOKA_WAITING;
}
