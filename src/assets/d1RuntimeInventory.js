import { ART_SEMANTIC_OWNER_ID } from './artSemanticOwnerIds.js';

const row = (
  screenId,
  stateId,
  componentId,
  requiredAssetId,
  semanticOwner,
  bindingState = 'pending',
  stateVariants = null,
) => Object.freeze({
  screenId,
  stateId,
  componentId,
  requiredAssetId,
  semanticOwner,
  bindingState,
  ...(stateVariants ? { stateVariants: Object.freeze(stateVariants) } : {}),
});

// D1 화면 구현자와 아트 제작자가 함께 소비하는 단일 상태/에셋 계약이다.
// `bound`는 현재 런타임 binding이 존재한다는 뜻이며 manifest 승인 여부는 보고 시점에 별도로 판정한다.
export const D1_RUNTIME_COMPONENT_INVENTORY = Object.freeze([
  row('SCR-SVC-CUSTOMERS', 'D1-service-base', 'customers.scene.background', 'ARTIST-010-BACKGROUND-COMPLETE', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-CUSTOMERS', 'D1-service-six-seats', 'customers.seating', 'BG-SEATING-6', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-CUSTOMERS', 'D1-service-base', 'customers.scene.counter', 'BG-SERVICE-TABLE-ARTIST009', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-CUSTOMERS', 'D1-tsukioka-waiting', 'customers.actor.tsukioka', 'D1-TSUKIOKA-WAITING', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-CUSTOMERS', 'D1-tsukioka-partial-beer', 'customers.actor.tsukioka', 'D1-TSUKIOKA-PARTIAL-BEER-WAITING', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-CUSTOMERS', 'D1-tsukioka-eating', 'customers.actor.tsukioka', 'D1-TSUKIOKA-RECEIVED-EATING', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-CUSTOMERS', 'D1-order-card', 'customers.order', 'UI-CUSTOMER-ORDER-WAIT-PANEL', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-CUSTOMERS', 'D1-order-negima', 'customers.order.menu', 'UI-CUSTOMER-ORDER-ICON-NEGIMA', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-CUSTOMERS', 'D1-order-beer', 'customers.order.menu', 'UI-CUSTOMER-ORDER-ICON-DRAFT-BEER', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),

  row('SCR-SVC-CUSTOMERS', 'D1-service-environment', 'customers.scene.interior', 'BG-INTERIOR-BASE', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-CUSTOMERS', 'D1-service-counter', 'customers.table', 'BG-BAR-COUNTER-BASE', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE),
  row('SCR-SVC-CUSTOMERS', 'D1-service-module', 'customers.preparedDock', 'ST-SERVICE-COUNTER', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound', ['empty', 'occupied']),
  row('SCR-SVC-CUSTOMERS', 'D1-extra-commuter', 'customers.actor.commuter', 'CH-EXTRA-COMMUTER-SERVICE', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound', ['office-a', 'office-b', 'office-c', 'office-d', 'office-e', 'waiting', 'eating-negima', 'drinking-beer']),
  row('SCR-SVC-CUSTOMERS', 'D1-extra-solo', 'customers.actor.solo', 'CH-EXTRA-SOLO-SERVICE', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound', ['waiting']),
  row('SCR-SVC-CUSTOMERS', 'D1-table-serving', 'customers.table.serving', 'PR-SERVING-PLATE', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound', ['occupied']),
  row('SCR-SVC-CUSTOMERS', 'D1-table-empty-dishes', 'customers.table.empty', 'PR-EMPTY-DISH-SET', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound', ['cleanup-needed']),
  row('SCR-SVC-CUSTOMERS', 'D1-seat-cleanup', 'customers.cleanup', 'ST-CLEANUP-OVERLAY', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound', ['wiping-left', 'wiping-right']),
  row('SCR-SVC-ASSEMBLY', 'D1-assembly-base', 'assembly.scene', 'BG-WORKSPACE-ASSEMBLY', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING, 'bound'),
  row('SCR-SVC-ASSEMBLY', 'D1-assembly-base', 'assembly.station', 'ST-ASSEMBLY-TIER-1', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING, 'bound'),
  row('SCR-SVC-ASSEMBLY', 'D1-assembly-empty-skewer', 'assembly.skewer', 'MDL-SKEWER-BASE', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING),
  row('SCR-SVC-ASSEMBLY', 'D1-assembly-chicken', 'assembly.bins.chicken', 'MDL-INGREDIENT-CHICKEN', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING),
  row('SCR-SVC-ASSEMBLY', 'D1-assembly-negi', 'assembly.bins.negi', 'MDL-INGREDIENT-NEGI', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING),
  row('SCR-SVC-ASSEMBLY', 'D1-assembly-finished-negima', 'assembly.finished.tray', 'SPR-ASSEMBLY-TRAY-NEGIMA', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING, 'bound', ['waiting-tray']),

  row('SCR-SVC-GRILL', 'D1-grill-base', 'grill.scene', 'BG-WORKSPACE-GRILL', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING, 'bound'),
  row('SCR-SVC-GRILL', 'D1-grill-six-slots', 'grill.slot', 'ST-GRILL-TIER-1', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING, 'bound'),
  row('SCR-SVC-GRILL', 'D1-grill-waiting', 'grill.waiting', 'ST-GRILL-WAITING-RACK', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING),
  row('SCR-SVC-GRILL', 'D1-grill-raw', 'grill.skewer', 'MDL-NEGIMA-GRILL-RAW', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING),
  row('SCR-SVC-GRILL', 'D1-grill-cooking-front', 'grill.skewer', 'MDL-NEGIMA-GRILL-COOKING-FIRST-FACE', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING),
  // 승인 산출물이 래스터·GLB가 아니라 런타임 색 계약(d1SecondFaceR3.js)이라 manifest 등록 대상이
  // 아니다. d1-game이 굽는 면에 직접 적용한다. TEX-BEER-LIQUID·VFX-BEER-CORE와 같은 code-native다.
  row('SCR-SVC-GRILL', 'D1-grill-cooking-back', 'grill.skewer', 'MDL-NEGIMA-GRILL-COOKING-SECOND-FACE', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING, 'code-native', ['cooking-back']),
  row('SCR-SVC-GRILL', 'D1-grill-proper-front', 'grill.skewer', 'MDL-NEGIMA-GRILL-PROPER-FIRST-FACE', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING),
  row('SCR-SVC-GRILL', 'D1-grill-proper-back', 'grill.skewer', 'MDL-NEGIMA-GRILL-PROPER-SECOND-FACE', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING),
  row('SCR-SVC-GRILL', 'D1-grill-finished', 'grill.finished.tray', 'ST-GRILL-FINISHED-TRAY', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING, 'bound'),
  row('SCR-SVC-GRILL', 'D1-grill-finished-perfect', 'grill.finished.item', 'CMP-GRILL-FINISHED-PROPER-NEGIMA', ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING),

  row('SCR-SVC-DRINK', 'D1-drink-base', 'drink.scene', 'BG-WORKSPACE-DRINK', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-DRINK', 'D1-drink-base', 'drink.station', 'ST-DRINK-BEER-TIER-1', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-DRINK', 'D1-drink-glass', 'drink.glass', 'MDL-BEER-GLASS', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-DRINK', 'D1-drink-lever', 'drink.lever', 'MDL-BEER-LEVER', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'bound'),
  row('SCR-SVC-DRINK', 'D1-drink-visual-variants', 'drink.liquid', 'TEX-BEER-LIQUID', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'code-native', ['hidden', 'liquid-70-with-foam', 'liquid-100-with-foam']),
  row('SCR-SVC-DRINK', 'D1-drink-visual-variants', 'drink.vfx', 'VFX-BEER-CORE', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE, 'code-native', ['none', 'foam-settling', 'foam-crown', 'overflow', 'finished-steam']),

  row('SCR-POST-CLOSING', 'D1-closing-charcoal', 'closing.charcoal', 'ST-CHARCOAL-CORE', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE),
  row('SCR-POST-CLOSING', 'D1-closing-ember', 'closing.charcoal.vfx', 'VFX-EMBER-CORE', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE),
  row('SCR-POST-SETTLEMENT', 'D1-settlement-quality', 'settlement.ledger.quality', 'UI-QUALITY-ICONS', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE),
  row('SCR-POST-SETTLEMENT', 'D1-settlement-economy', 'settlement.ledger.economy', 'UI-ECONOMY-ICONS', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE),
  row('SCR-POST-SETTLEMENT', 'D1-settlement-state', 'settlement.reward', 'UI-STATE-ICONS', ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE),
]);

// 모델 bundle처럼 비동기 exact-load가 끝난 뒤에만 binding이 성립하는 consumer가 런타임
// readiness를 다시 계산할 때 사용한다. 정적 inventory 원본은 pending을 보존하므로 manifest
// 등록만으로 placeholder가 사라지지 않는다.
export function withD1RuntimeBoundAssetIds(
  boundAssetIds,
  inventory = D1_RUNTIME_COMPONENT_INVENTORY,
) {
  const bound = new Set(boundAssetIds);
  return Object.freeze(inventory.map((entry) => (
    bound.has(entry.requiredAssetId)
      ? Object.freeze({ ...entry, bindingState: 'bound' })
      : entry
  )));
}

export function reportD1RuntimeComponentInventory(
  manifest,
  inventory = D1_RUNTIME_COMPONENT_INVENTORY,
) {
  const approvedIds = new Set(
    (Array.isArray(manifest?.assets) ? manifest.assets : [])
      .filter((asset) => asset?.status === 'approved' && asset.id && asset.url)
      .map((asset) => asset.id),
  );
  const entries = inventory.map((entry) => Object.freeze({
    ...entry,
    placeholder: entry.bindingState === 'code-native'
      ? false
      : entry.bindingState !== 'bound' || !approvedIds.has(entry.requiredAssetId),
  }));
  const placeholderEntries = entries.filter((entry) => entry.placeholder);
  const byOwner = Object.freeze(Object.fromEntries(
    [...new Set(entries.map((entry) => entry.semanticOwner))]
      .map((owner) => [
        owner,
        Object.freeze(placeholderEntries
          .filter((entry) => entry.semanticOwner === owner)
          .map((entry) => entry.requiredAssetId)),
      ]),
  ));
  return Object.freeze({
    ready: placeholderEntries.length === 0,
    totalCount: entries.length,
    placeholderCount: placeholderEntries.length,
    entries: Object.freeze(entries),
    placeholderRequiredAssetIds: Object.freeze(
      placeholderEntries.map((entry) => entry.requiredAssetId),
    ),
    placeholderRequiredAssetIdsByOwner: byOwner,
  });
}
