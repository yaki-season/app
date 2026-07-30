import { S0_INTERACTIONS } from '../scenario/s0-d3-content.js';

export const S0_D1_ART_BINDING_CONTRACT_VERSION = '1.1.0';
export const S0_BRAZIER_LAYER_CONTRACT_VERSION = '1.0.0';
export const ART_BINDING_LOGICAL_VIEWPORT = Object.freeze({ width: 1920, height: 1080 });
export const ART_BINDING_VIEWPORTS = Object.freeze({
  fhd: Object.freeze({ width: 1920, height: 1080, scale: 1 }),
  hd: Object.freeze({ width: 1280, height: 720, scale: 2 / 3 }),
});

export const ART_BINDING_CAMERA = Object.freeze({
  S0_EXTERIOR_FIXED_V1: Object.freeze({
    cameraId: 'S0-EXTERIOR-FIXED-V1',
    projection: 'fixed-16:9',
    crop: 'contain',
  }),
  S0_BRAZIER_FIXED_V1: Object.freeze({
    cameraId: 'S0-BRAZIER-FIXED-V1',
    projection: 'fixed-16:9',
    crop: 'contain',
  }),
  D1_DRINK_FIXED_V1: Object.freeze({
    cameraId: 'D1-DRINK-FIXED-V1',
    projection: 'fixed-16:9',
    playerEye: Object.freeze({ x: 0, y: 2.6, z: 12 }),
    look: Object.freeze({ x: 1.8, y: -1.4, z: -4.4 }),
    crop: 'contain',
  }),
});

const freezeRect = ({ x, y, width, height }) => Object.freeze({ x, y, width, height });
const scaleRect = (rect, scale) => freezeRect({
  x: Math.round(rect.x * scale),
  y: Math.round(rect.y * scale),
  width: Math.round(rect.width * scale),
  height: Math.round(rect.height * scale),
});
const viewportRects = ({ visualBounds, interactionBounds = null, domSafeRect, additionalDomSafeRects = [] }) => (
  Object.freeze(Object.fromEntries(
    Object.entries(ART_BINDING_VIEWPORTS).map(([viewportId, viewport]) => [
      viewportId,
      Object.freeze({
        visualBounds: scaleRect(visualBounds, viewport.scale),
        interactionBounds: interactionBounds ? scaleRect(interactionBounds, viewport.scale) : null,
        domSafeRect: scaleRect(domSafeRect, viewport.scale),
        additionalDomSafeRects: Object.freeze(
          additionalDomSafeRects.map((rect) => scaleRect(rect, viewport.scale)),
        ),
      }),
    ]),
  ))
);

const GENERAL_ACTION_SAFE_RECT = freezeRect({ x: 128, y: 936, width: 1664, height: 104 });
const SERVICE_RECEIPT_SAFE_RECT = freezeRect({ x: 176, y: 104, width: 1568, height: 144 });
const SERVICE_PREPARED_SAFE_RECT = freezeRect({ x: 104, y: 872, width: 1712, height: 168 });

const BRAZIER_COMPONENT_VISUAL_BOUNDS = freezeRect({
  x: 648,
  y: 376,
  width: 624,
  height: 432,
});
const BRAZIER_INTERACTION_BOUNDS = freezeRect({
  x: 752,
  y: 480,
  width: 416,
  height: 288,
});
const CHARCOAL_IGNITION_VISUAL_BOUNDS = freezeRect({
  x: 736,
  y: 408,
  width: 448,
  height: 224,
});

const scaledVisualBounds = (visualBounds) => Object.freeze(Object.fromEntries(
  Object.entries(ART_BINDING_VIEWPORTS).map(([viewportId, viewport]) => [
    viewportId,
    Object.freeze({ visualBounds: scaleRect(visualBounds, viewport.scale) }),
  ]),
));

export const S0_BRAZIER_LAYER_CONTRACT = Object.freeze({
  version: S0_BRAZIER_LAYER_CONTRACT_VERSION,
  sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
  camera: ART_BINDING_CAMERA.S0_BRAZIER_FIXED_V1,
  semanticOwner: 'artist-2.s0-prologue-story',
  bodyPartCount: 0,
  primary: Object.freeze({
    componentId: 'prologue.brazier-and-charcoal',
    requiredAssetId: 'ST-S0-BRAZIER',
    stateVariant: 'cold-to-ignited',
    bounds: scaledVisualBounds(BRAZIER_COMPONENT_VISUAL_BOUNDS),
    interactionBounds: Object.freeze({
      fhd: BRAZIER_INTERACTION_BOUNDS,
      hd: scaleRect(BRAZIER_INTERACTION_BOUNDS, ART_BINDING_VIEWPORTS.hd.scale),
    }),
    layer: Object.freeze({ name: 'architecture', zOrder: 20 }),
    pixelOwnership: Object.freeze([
      '차가운 화로 몸체·테두리·손잡이·다리',
      '숯을 받치는 내부 구조와 비시각 contact anchor metadata',
    ]),
    forbiddenPixels: Object.freeze([
      '보이는 숯 조각',
      '불씨·발광·불꽃·연기·재·spark·ignition mask',
    ]),
  }),
  companion: Object.freeze({
    componentId: 'prologue.ignitionVfx',
    requiredAssetId: 'PR-CHARCOAL-IGNITION',
    stateVariant: 'off-to-stable',
    bounds: scaledVisualBounds(CHARCOAL_IGNITION_VISUAL_BOUNDS),
    interactionBounds: null,
    layer: Object.freeze({ name: 'vfx', zOrder: 50 }),
    pixelOwnership: Object.freeze([
      '꺼짐 상태를 포함한 모든 보이는 숯 조각',
      '불씨·발광·불꽃·연기·재·spark·ignition mask',
    ]),
  }),
  domSafeRect: Object.freeze({
    fhd: GENERAL_ACTION_SAFE_RECT,
    hd: scaleRect(GENERAL_ACTION_SAFE_RECT, ART_BINDING_VIEWPORTS.hd.scale),
  }),
  compositionPolicy: Object.freeze({
    runtimeVisualLayerCount: 2,
    primaryMayContainCompanionPixels: false,
    companionMayContainPrimaryPixels: false,
    childBoundsDerivedFromInteractionBounds: false,
    exactMissingLayerUsesPlaceholder: true,
    noNearestApprovedSubstitute: true,
    noDoubleRender: true,
  }),
});

const binding = ({
  screenId,
  stateId,
  phaseId = null,
  interactionId = null,
  componentId,
  requiredAssetId,
  stateVariant,
  semanticOwner,
  camera,
  visualBounds,
  interactionBounds = null,
  domSafeRect,
  additionalDomSafeRects = [],
  layer,
  zOrder,
  bodyPartCount = 0,
  companionLayers = [],
}) => Object.freeze({
  screenId,
  stateId,
  phaseId,
  interactionId,
  componentId,
  requiredAssetId,
  stateVariant,
  semanticOwner,
  camera,
  bounds: viewportRects({
    visualBounds,
    interactionBounds,
    domSafeRect,
    additionalDomSafeRects,
  }),
  layer: Object.freeze({ name: layer, zOrder }),
  bodyPartCount,
  companionLayers: Object.freeze(companionLayers.map(Object.freeze)),
});

export const S0_ART_BINDING_INVENTORY = Object.freeze([
  binding({
    screenId: 'SCR-STORY-PROLOGUE',
    stateId: 'S0-STATE-KEY',
    phaseId: 'exterior-key',
    interactionId: 'S0-KEY-SELECT',
    componentId: 'prologue.key',
    requiredAssetId: 'PR-SHOP-KEY',
    stateVariant: 'placed',
    semanticOwner: 'artist-2.s0-prologue-story',
    camera: ART_BINDING_CAMERA.S0_EXTERIOR_FIXED_V1,
    visualBounds: { x: 256, y: 650, width: 224, height: 150 },
    interactionBounds: { x: 224, y: 614, width: 288, height: 222 },
    domSafeRect: GENERAL_ACTION_SAFE_RECT,
    layer: 'interactable',
    zOrder: 40,
  }),
  binding({
    screenId: 'SCR-STORY-PROLOGUE',
    stateId: 'S0-STATE-GATE',
    phaseId: 'gate-open',
    interactionId: 'S0-GATE-OPEN',
    componentId: 'prologue.gate',
    requiredAssetId: 'PR-SHOP-GATE-S0',
    stateVariant: 'open',
    semanticOwner: 'artist-2.s0-prologue-story',
    camera: ART_BINDING_CAMERA.S0_EXTERIOR_FIXED_V1,
    visualBounds: { x: 656, y: 176, width: 608, height: 704 },
    interactionBounds: { x: 720, y: 224, width: 480, height: 624 },
    domSafeRect: GENERAL_ACTION_SAFE_RECT,
    layer: 'architecture',
    zOrder: 20,
  }),
  binding({
    screenId: 'SCR-STORY-PROLOGUE',
    stateId: 'S0-STATE-CHARCOAL',
    phaseId: 'ignite',
    interactionId: 'S0-CHARCOAL-IGNITE',
    componentId: 'prologue.brazier-and-charcoal',
    requiredAssetId: 'ST-S0-BRAZIER',
    stateVariant: 'cold-to-ignited',
    semanticOwner: 'artist-2.s0-prologue-story',
    camera: ART_BINDING_CAMERA.S0_BRAZIER_FIXED_V1,
    visualBounds: BRAZIER_COMPONENT_VISUAL_BOUNDS,
    interactionBounds: BRAZIER_INTERACTION_BOUNDS,
    domSafeRect: GENERAL_ACTION_SAFE_RECT,
    layer: 'architecture',
    zOrder: 20,
    companionLayers: [
      {
        componentId: 'prologue.ignitionVfx',
        requiredAssetId: 'PR-CHARCOAL-IGNITION',
        stateVariant: 'off-to-stable',
        layer: 'vfx',
        zOrder: 50,
        bounds: S0_BRAZIER_LAYER_CONTRACT.companion.bounds,
        interactionBounds: null,
      },
    ],
  }),
]);

export const D1_DRINK_ART_BINDING_INVENTORY = Object.freeze([
  binding({
    screenId: 'SCR-SVC-DRINK',
    stateId: 'D1-drink-base',
    componentId: 'drink.scene',
    requiredAssetId: 'BG-WORKSPACE-DRINK',
    stateVariant: 'base-empty-workspace',
    semanticOwner: 'artist-3.d1-drink-service-cleanup-customer-settlement',
    camera: ART_BINDING_CAMERA.D1_DRINK_FIXED_V1,
    visualBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    domSafeRect: SERVICE_RECEIPT_SAFE_RECT,
    additionalDomSafeRects: [SERVICE_PREPARED_SAFE_RECT],
    layer: 'background',
    zOrder: 0,
  }),
  binding({
    screenId: 'SCR-SVC-DRINK',
    stateId: 'D1-drink-base',
    componentId: 'drink.station',
    requiredAssetId: 'ST-DRINK-BEER-TIER-1',
    stateVariant: 'single-lever-empty',
    semanticOwner: 'artist-3.d1-drink-service-cleanup-customer-settlement',
    camera: ART_BINDING_CAMERA.D1_DRINK_FIXED_V1,
    visualBounds: { x: 240, y: 288, width: 1152, height: 528 },
    domSafeRect: SERVICE_RECEIPT_SAFE_RECT,
    additionalDomSafeRects: [SERVICE_PREPARED_SAFE_RECT],
    layer: 'architecture',
    zOrder: 20,
  }),
  binding({
    screenId: 'SCR-SVC-DRINK',
    stateId: 'D1-drink-glass',
    componentId: 'drink.glass',
    requiredAssetId: 'MDL-BEER-GLASS',
    stateVariant: 'empty',
    semanticOwner: 'artist-3.d1-drink-service-cleanup-customer-settlement',
    camera: ART_BINDING_CAMERA.D1_DRINK_FIXED_V1,
    visualBounds: { x: 792, y: 424, width: 224, height: 336 },
    interactionBounds: { x: 752, y: 392, width: 304, height: 400 },
    domSafeRect: SERVICE_RECEIPT_SAFE_RECT,
    additionalDomSafeRects: [SERVICE_PREPARED_SAFE_RECT],
    layer: 'interactable',
    zOrder: 40,
  }),
  binding({
    screenId: 'SCR-SVC-DRINK',
    stateId: 'D1-drink-lever',
    componentId: 'drink.lever',
    requiredAssetId: 'MDL-BEER-LEVER',
    stateVariant: 'idle',
    semanticOwner: 'artist-3.d1-drink-service-cleanup-customer-settlement',
    camera: ART_BINDING_CAMERA.D1_DRINK_FIXED_V1,
    visualBounds: { x: 1152, y: 432, width: 176, height: 184 },
    interactionBounds: { x: 1120, y: 400, width: 240, height: 248 },
    domSafeRect: SERVICE_RECEIPT_SAFE_RECT,
    additionalDomSafeRects: [SERVICE_PREPARED_SAFE_RECT],
    layer: 'interactable',
    zOrder: 42,
  }),
]);

const drinkVisualVariant = (stateVariant, liquidVariant, vfxVariant) => Object.freeze({
  stateVariant,
  layers: Object.freeze([
    Object.freeze({
      componentId: 'drink.glass',
      requiredAssetId: 'MDL-BEER-GLASS',
      stateVariant,
      semanticOwner: 'artist-3.d1-drink-service-cleanup-customer-settlement',
      layer: 'interactable',
      zOrder: 40,
    }),
    Object.freeze({
      componentId: 'drink.liquid',
      requiredAssetId: 'TEX-BEER-LIQUID',
      stateVariant: liquidVariant,
      semanticOwner: 'artist-3.d1-drink-service-cleanup-customer-settlement',
      layer: 'state-overlay',
      zOrder: 44,
    }),
    Object.freeze({
      componentId: 'drink.vfx',
      requiredAssetId: 'VFX-BEER-CORE',
      stateVariant: vfxVariant,
      semanticOwner: 'artist-3.d1-drink-service-cleanup-customer-settlement',
      layer: 'vfx',
      zOrder: 50,
    }),
  ]),
});

// 이 목록은 시각 조립만 소유한다. 품질·시간·제공 가능 여부 같은 gameplay 판정은 포함하지 않는다.
export const D1_DRINK_VISUAL_VARIANTS = Object.freeze([
  drinkVisualVariant('empty', 'hidden', 'none'),
  drinkVisualVariant('fill-70', 'liquid-70-with-foam', 'foam-settling'),
  drinkVisualVariant('fill-100', 'liquid-100-with-foam', 'foam-crown'),
  drinkVisualVariant('overflow', 'liquid-100-with-foam', 'overflow'),
  drinkVisualVariant('finished', 'liquid-100-with-foam', 'finished-steam'),
]);

const LEGACY_S0_PHASE_IDS = Object.freeze([
  'exterior',
  'interior-check',
  'note',
  'charcoal',
]);

const rectErrors = (entry, viewportId, name, rect) => {
  if (rect === null) return [];
  const viewport = ART_BINDING_VIEWPORTS[viewportId];
  if (!rect || Object.values(rect).some((value) => !Number.isInteger(value))) {
    return [`${entry.componentId}:${viewportId}:${name} must use integer bounds`];
  }
  if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
    || rect.x + rect.width > viewport.width || rect.y + rect.height > viewport.height) {
    return [`${entry.componentId}:${viewportId}:${name} is outside ${viewport.width}x${viewport.height}`];
  }
  return [];
};

export function validateS0D1ArtBindingContract() {
  const errors = [];
  const implementationTriples = S0_INTERACTIONS.map(
    ({ stateId, phaseId, interactionId }) => `${stateId}/${phaseId}/${interactionId}`,
  );
  const contractTriples = S0_ART_BINDING_INVENTORY.map(
    ({ stateId, phaseId, interactionId }) => `${stateId}/${phaseId}/${interactionId}`,
  );
  if (S0_ART_BINDING_INVENTORY.length !== 3) errors.push('S0 inventory must contain exactly three states');
  if (new Set(contractTriples).size !== 3) errors.push('S0 state/phase/interaction mapping must be 1:1');
  if (implementationTriples.join('|') !== contractTriples.join('|')) {
    errors.push('S0 inventory does not match the implemented three-click order');
  }
  const phaseIds = new Set(S0_ART_BINDING_INVENTORY.map((entry) => entry.phaseId));
  for (const legacyPhaseId of LEGACY_S0_PHASE_IDS) {
    if (phaseIds.has(legacyPhaseId)) errors.push(`legacy S0 phase is forbidden: ${legacyPhaseId}`);
  }

  const entries = [...S0_ART_BINDING_INVENTORY, ...D1_DRINK_ART_BINDING_INVENTORY];
  const ownersByAsset = new Map();
  for (const entry of entries) {
    if (entry.bodyPartCount !== 0) errors.push(`${entry.componentId} exposes player body parts`);
    if (!ownersByAsset.has(entry.requiredAssetId)) ownersByAsset.set(entry.requiredAssetId, new Set());
    ownersByAsset.get(entry.requiredAssetId).add(entry.semanticOwner);
    for (const viewportId of Object.keys(ART_BINDING_VIEWPORTS)) {
      const bounds = entry.bounds[viewportId];
      errors.push(...rectErrors(entry, viewportId, 'visualBounds', bounds.visualBounds));
      errors.push(...rectErrors(entry, viewportId, 'interactionBounds', bounds.interactionBounds));
      errors.push(...rectErrors(entry, viewportId, 'domSafeRect', bounds.domSafeRect));
      bounds.additionalDomSafeRects.forEach((rect, index) => {
        errors.push(...rectErrors(entry, viewportId, `additionalDomSafeRects[${index}]`, rect));
      });
    }
  }
  const drinkAssetIds = new Set(D1_DRINK_ART_BINDING_INVENTORY.map((entry) => entry.requiredAssetId));
  for (const requiredAssetId of [
    'BG-WORKSPACE-DRINK',
    'ST-DRINK-BEER-TIER-1',
    'MDL-BEER-GLASS',
    'MDL-BEER-LEVER',
  ]) {
    if (!drinkAssetIds.has(requiredAssetId)) errors.push(`missing D1 drink binding: ${requiredAssetId}`);
  }
  for (const variant of D1_DRINK_VISUAL_VARIANTS) {
    if ('judgement' in variant || 'quality' in variant || 'gameplayState' in variant) {
      errors.push(`${variant.stateVariant} contains a gameplay judgement`);
    }
    for (const layer of variant.layers) {
      if (!ownersByAsset.has(layer.requiredAssetId)) ownersByAsset.set(layer.requiredAssetId, new Set());
      ownersByAsset.get(layer.requiredAssetId).add(layer.semanticOwner);
    }
  }
  for (const [requiredAssetId, owners] of ownersByAsset) {
    if (owners.size !== 1) errors.push(`${requiredAssetId} has multiple semanticOwner values`);
  }
  const brazier = S0_ART_BINDING_INVENTORY.find(
    (entry) => entry.requiredAssetId === S0_BRAZIER_LAYER_CONTRACT.primary.requiredAssetId,
  );
  const companion = brazier?.companionLayers.find(
    (entry) => entry.requiredAssetId === S0_BRAZIER_LAYER_CONTRACT.companion.requiredAssetId,
  );
  if (S0_BRAZIER_LAYER_CONTRACT.sourceMasterId !== 'CM-PROLOGUE-INHERITANCE-R1') {
    errors.push('S0 brazier sourceMasterId is not canonical');
  }
  if (!brazier || !companion) errors.push('S0 brazier primary/companion binding is incomplete');
  for (const viewportId of Object.keys(ART_BINDING_VIEWPORTS)) {
    const parent = brazier?.bounds[viewportId].visualBounds;
    const child = companion?.bounds[viewportId].visualBounds;
    if (!parent || !child) {
      errors.push(`S0 brazier ${viewportId} child visual bounds are missing`);
      continue;
    }
    errors.push(...rectErrors(companion, viewportId, 'visualBounds', child));
    if (
      child.x < parent.x
      || child.y < parent.y
      || child.x + child.width > parent.x + parent.width
      || child.y + child.height > parent.y + parent.height
    ) errors.push(`S0 brazier ${viewportId} companion is outside primary envelope`);
    if (JSON.stringify(child) === JSON.stringify(brazier.bounds[viewportId].interactionBounds)) {
      errors.push(`S0 brazier ${viewportId} companion bounds reuse interaction bounds`);
    }
  }
  if (
    S0_BRAZIER_LAYER_CONTRACT.primary.layer.zOrder
    >= S0_BRAZIER_LAYER_CONTRACT.companion.layer.zOrder
  ) errors.push('S0 brazier companion must render above the primary');
  if (!S0_BRAZIER_LAYER_CONTRACT.compositionPolicy.noDoubleRender) {
    errors.push('S0 brazier no-double-render policy is disabled');
  }
  return Object.freeze(errors);
}

export const S0_D1_ART_BINDING_CONTRACT = Object.freeze({
  version: S0_D1_ART_BINDING_CONTRACT_VERSION,
  logicalViewport: ART_BINDING_LOGICAL_VIEWPORT,
  viewports: ART_BINDING_VIEWPORTS,
  s0: S0_ART_BINDING_INVENTORY,
  s0BrazierLayers: S0_BRAZIER_LAYER_CONTRACT,
  d1Drink: D1_DRINK_ART_BINDING_INVENTORY,
  drinkVisualVariants: D1_DRINK_VISUAL_VARIANTS,
});
