import {
  ART_BINDING_CAMERA,
  ART_BINDING_LOGICAL_VIEWPORT,
  ART_BINDING_VIEWPORTS,
  S0_ART_BINDING_INVENTORY,
} from './s0D1ArtBindingContract.js';
import { ART_SEMANTIC_OWNER_ID } from './artSemanticOwnerIds.js';

export const S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT_VERSION = '3.0.0';

const freezeRect = (rect) => Object.freeze({ ...rect });
const scaleRect = (rect, scale) => freezeRect({
  x: Math.round(rect.x * scale),
  y: Math.round(rect.y * scale),
  width: Math.round(rect.width * scale),
  height: Math.round(rect.height * scale),
});

const visualBounds = freezeRect({ x: 0, y: 0, width: 1920, height: 1080 });
const domSafeRect = freezeRect({ x: 128, y: 936, width: 1664, height: 104 });
const gateInteractionReferenceBounds = Object.freeze({
  fhd: freezeRect({ x: 720, y: 224, width: 480, height: 624 }),
  hd: freezeRect({ x: 480, y: 149, width: 320, height: 416 }),
});

const bounds = Object.freeze(Object.fromEntries(
  Object.entries(ART_BINDING_VIEWPORTS).map(([viewportId, viewport]) => [
    viewportId,
    Object.freeze({
      visualBounds: scaleRect(visualBounds, viewport.scale),
      interactionBounds: null,
      domSafeRect: scaleRect(domSafeRect, viewport.scale),
    }),
  ]),
));

const backgroundBinding = ({
  stateId,
  phaseId,
  interactionId,
  requiredAssetId,
  stateVariant,
  visualMeaning,
  forbiddenAssetId,
  provenanceInteractionReference = null,
}) => Object.freeze({
  screenId: 'SCR-STORY-PROLOGUE',
  stateId,
  phaseId,
  interactionId,
  componentId: 'prologue.exterior.background',
  requiredAssetId,
  stateVariant,
  visualMeaning,
  semanticOwner: ART_SEMANTIC_OWNER_ID.ARTIST_2_S0_PROLOGUE,
  sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
  camera: ART_BINDING_CAMERA.S0_EXTERIOR_FIXED_V1,
  bounds,
  layer: Object.freeze({ name: 'background', zOrder: 0 }),
  bodyPartCount: 0,
  compositionPolicy: Object.freeze({
    strategy: 'full-frame-background-recomposition',
    forbiddenAssetId,
    forbidResidualPixelsFromForbiddenAsset: true,
    runtimeVisualAssetIds: Object.freeze([requiredAssetId]),
    runtimeVisualLayerCount: 1,
    separateComponentVisualLayersAllowed: false,
    openGateOutlineCount: stateId === 'S0-STATE-GATE' ? 1 : 0,
    closedGateResidualPixelCount: 0,
    provenanceInteractionReference: provenanceInteractionReference
      ? Object.freeze({
        ...provenanceInteractionReference,
        roles: Object.freeze([...provenanceInteractionReference.roles]),
        bounds: gateInteractionReferenceBounds,
      })
      : null,
  }),
});

export const S0_EXTERIOR_BACKGROUND_BINDINGS = Object.freeze([
  backgroundBinding({
    stateId: 'S0-STATE-KEY',
    phaseId: 'exterior-key',
    interactionId: 'S0-KEY-SELECT',
    requiredAssetId: 'BG-EXTERIOR-S0-CLOSED',
    stateVariant: 'closed',
    visualMeaning: 'central-gate-fully-closed',
    forbiddenAssetId: 'BG-EXTERIOR-S0-GATE-OPEN',
  }),
  backgroundBinding({
    stateId: 'S0-STATE-GATE',
    phaseId: 'gate-open',
    interactionId: 'S0-GATE-OPEN',
    requiredAssetId: 'BG-EXTERIOR-S0-GATE-OPEN',
    stateVariant: 'gate-open-empty-interior',
    visualMeaning: 'same-exterior-central-opening-open-empty-interior-visible',
    forbiddenAssetId: 'BG-EXTERIOR-S0-CLOSED',
    provenanceInteractionReference: {
      requiredAssetId: 'PR-SHOP-GATE-S0',
      stateVariant: 'open',
      approvedReviewRevision: 'R6',
      roles: ['background-production-provenance', 'interaction-meaning-and-bounds'],
      runtimeVisualLayerAllowed: false,
      separateRuntimePromotionAllowed: false,
    },
  }),
]);

const rectErrors = (viewportId, label, rect) => {
  if (rect === null) return [];
  const viewport = ART_BINDING_VIEWPORTS[viewportId];
  if (!rect || Object.values(rect).some((value) => !Number.isInteger(value))) {
    return [`${viewportId}:${label} must use integer bounds`];
  }
  if (
    rect.x < 0
    || rect.y < 0
    || rect.width <= 0
    || rect.height <= 0
    || rect.x + rect.width > viewport.width
    || rect.y + rect.height > viewport.height
  ) {
    return [`${viewportId}:${label} is outside ${viewport.width}x${viewport.height}`];
  }
  return [];
};

export function validateS0ExteriorBackgroundBindingContract() {
  const errors = [];
  const bindings = S0_EXTERIOR_BACKGROUND_BINDINGS;
  const consumers = bindings.map(
    ({ stateId, phaseId, interactionId }) => `${stateId}/${phaseId}/${interactionId}`,
  );
  const expectedConsumers = S0_ART_BINDING_INVENTORY.slice(0, 2).map(
    ({ stateId, phaseId, interactionId }) => `${stateId}/${phaseId}/${interactionId}`,
  );

  if (S0_ART_BINDING_INVENTORY.length !== 3) {
    errors.push('completed S0 inventory must remain exactly three states');
  }
  if (consumers.length !== 2 || new Set(consumers).size !== 2) {
    errors.push('exterior background inventory must have exactly KEY/GATE bindings');
  }
  if (consumers.join('|') !== expectedConsumers.join('|')) {
    errors.push('shared exterior consumers do not match KEY/GATE state identities');
  }
  const [keyBinding, gateBinding] = bindings;
  if (
    keyBinding.requiredAssetId !== 'BG-EXTERIOR-S0-CLOSED'
    || gateBinding.requiredAssetId !== 'BG-EXTERIOR-S0-GATE-OPEN'
    || keyBinding.requiredAssetId === gateBinding.requiredAssetId
  ) {
    errors.push('KEY/GATE must use distinct closed/open exterior background IDs');
  }
  if (
    keyBinding.stateVariant !== 'closed'
    || keyBinding.visualMeaning !== 'central-gate-fully-closed'
    || keyBinding.compositionPolicy.forbiddenAssetId !== 'BG-EXTERIOR-S0-GATE-OPEN'
  ) {
    errors.push('KEY binding must mean a fully closed central gate and forbid gate-open background');
  }
  if (
    gateBinding.stateVariant !== 'gate-open-empty-interior'
    || gateBinding.compositionPolicy.forbiddenAssetId !== 'BG-EXTERIOR-S0-CLOSED'
    || !gateBinding.compositionPolicy.forbidResidualPixelsFromForbiddenAsset
    || gateBinding.compositionPolicy.runtimeVisualAssetIds.join('|')
      !== 'BG-EXTERIOR-S0-GATE-OPEN'
    || gateBinding.compositionPolicy.runtimeVisualLayerCount !== 1
    || gateBinding.compositionPolicy.separateComponentVisualLayersAllowed !== false
    || gateBinding.compositionPolicy.openGateOutlineCount !== 1
    || gateBinding.compositionPolicy.closedGateResidualPixelCount !== 0
    || gateBinding.compositionPolicy.provenanceInteractionReference?.requiredAssetId
      !== 'PR-SHOP-GATE-S0'
    || gateBinding.compositionPolicy.provenanceInteractionReference?.stateVariant !== 'open'
    || gateBinding.compositionPolicy.provenanceInteractionReference?.approvedReviewRevision !== 'R6'
    || gateBinding.compositionPolicy.provenanceInteractionReference?.runtimeVisualLayerAllowed !== false
    || gateBinding.compositionPolicy.provenanceInteractionReference
      ?.separateRuntimePromotionAllowed !== false
    || gateBinding.compositionPolicy.provenanceInteractionReference?.roles.join('|')
      !== 'background-production-provenance|interaction-meaning-and-bounds'
    || JSON.stringify(gateBinding.compositionPolicy.provenanceInteractionReference?.bounds)
      !== JSON.stringify(gateInteractionReferenceBounds)
  ) {
    errors.push('GATE must render one exact open background and keep PR-SHOP-GATE-S0 R6 non-visual');
  }
  for (const binding of bindings) {
    if (
      binding.camera.cameraId !== ART_BINDING_CAMERA.S0_EXTERIOR_FIXED_V1.cameraId
      || S0_ART_BINDING_INVENTORY[0].camera.cameraId !== binding.camera.cameraId
      || S0_ART_BINDING_INVENTORY[1].camera.cameraId !== binding.camera.cameraId
    ) {
      errors.push(`${binding.stateId} must share S0_EXTERIOR_FIXED camera`);
    }
    if (binding.bodyPartCount !== 0) errors.push(`${binding.stateId} exposes player body parts`);
    if (binding.layer.name !== 'background' || binding.layer.zOrder !== 0) {
      errors.push(`${binding.stateId} must remain background z-order 0`);
    }
    for (const viewportId of Object.keys(ART_BINDING_VIEWPORTS)) {
      const viewportBounds = binding.bounds[viewportId];
      errors.push(...rectErrors(viewportId, 'visualBounds', viewportBounds.visualBounds));
      errors.push(...rectErrors(viewportId, 'domSafeRect', viewportBounds.domSafeRect));
      if (viewportBounds.interactionBounds !== null) {
        errors.push(`${binding.stateId}:${viewportId}:background interactionBounds must be null`);
      }
    }
  }
  if (JSON.stringify(keyBinding.bounds) !== JSON.stringify(gateBinding.bounds)) {
    errors.push('KEY/GATE camera bounds and DOM safe rect must be identical');
  }
  return Object.freeze(errors);
}

export const S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT = Object.freeze({
  version: S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT_VERSION,
  logicalViewport: ART_BINDING_LOGICAL_VIEWPORT,
  viewports: ART_BINDING_VIEWPORTS,
  bindings: S0_EXTERIOR_BACKGROUND_BINDINGS,
});
