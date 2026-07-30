import { D1_RUNTIME_COMPONENT_INVENTORY } from './d1RuntimeInventory.js';
import {
  D1_DRINK_ART_BINDING_INVENTORY,
  D1_DRINK_VISUAL_VARIANTS,
  S0_ART_BINDING_INVENTORY,
} from './s0D1ArtBindingContract.js';
import { S0_EXTERIOR_BACKGROUND_BINDINGS } from './s0ExteriorBackgroundBindingContract.js';
import {
  ART_SEMANTIC_OWNER_IDS,
  isFullyQualifiedArtSemanticOwner,
} from './artSemanticOwnerIds.js';

const canonicalOwners = new Set(ART_SEMANTIC_OWNER_IDS);

const bindingRows = [
  ...S0_ART_BINDING_INVENTORY.flatMap((entry) => [
    entry,
    ...entry.companionLayers.map((layer) => ({
      ...layer,
      semanticOwner: layer.semanticOwner ?? entry.semanticOwner,
    })),
  ]),
  ...D1_DRINK_ART_BINDING_INVENTORY,
  ...D1_DRINK_VISUAL_VARIANTS.flatMap((variant) => variant.layers),
  ...S0_EXTERIOR_BACKGROUND_BINDINGS,
];

const ownerSetForAsset = (rows, assetId) => new Set(
  rows
    .filter((entry) => entry.requiredAssetId === assetId)
    .map((entry) => entry.semanticOwner),
);

const sorted = (values) => [...values].sort();

export function auditPromotionSemanticOwnerAlignment({
  assetId,
  metadataSemanticOwner,
  runtimeInventory = D1_RUNTIME_COMPONENT_INVENTORY,
  artBindings = bindingRows,
}) {
  const bindingOwners = ownerSetForAsset(artBindings, assetId);
  const runtimeOwners = ownerSetForAsset(runtimeInventory, assetId);
  const expectedOwners = new Set([...bindingOwners, ...runtimeOwners]);
  const errors = [];

  if (!assetId) errors.push('assetId is required');
  if (!isFullyQualifiedArtSemanticOwner(metadataSemanticOwner)) {
    errors.push(`metadata semanticOwner is not fully qualified: ${metadataSemanticOwner ?? '(missing)'}`);
  } else if (!canonicalOwners.has(metadataSemanticOwner)) {
    errors.push(`metadata semanticOwner is not a registered machine ID: ${metadataSemanticOwner}`);
  }
  if (expectedOwners.size === 0) {
    errors.push(`no binding/runtime owner contract for ${assetId}`);
  }
  if (bindingOwners.size > 1) {
    errors.push(`binding contract owner conflict for ${assetId}: ${sorted(bindingOwners).join(', ')}`);
  }
  if (runtimeOwners.size > 1) {
    errors.push(`runtime inventory owner conflict for ${assetId}: ${sorted(runtimeOwners).join(', ')}`);
  }
  for (const owner of expectedOwners) {
    if (!isFullyQualifiedArtSemanticOwner(owner) || !canonicalOwners.has(owner)) {
      errors.push(`contract owner is not a registered machine ID: ${owner}`);
    }
  }
  if (expectedOwners.size > 1) {
    errors.push(`binding/runtime owner mismatch for ${assetId}: ${sorted(expectedOwners).join(', ')}`);
  }
  if (
    metadataSemanticOwner
    && expectedOwners.size === 1
    && !expectedOwners.has(metadataSemanticOwner)
  ) {
    errors.push(
      `metadata/binding/runtime owner mismatch for ${assetId}: `
      + `${metadataSemanticOwner} != ${sorted(expectedOwners)[0]}`,
    );
  }

  return Object.freeze({
    valid: errors.length === 0,
    assetId,
    metadataSemanticOwner,
    bindingOwners: Object.freeze(sorted(bindingOwners)),
    runtimeOwners: Object.freeze(sorted(runtimeOwners)),
    expectedOwners: Object.freeze(sorted(expectedOwners)),
    errors: Object.freeze(errors),
  });
}

export function assertPromotionSemanticOwnerAlignment(input) {
  const audit = auditPromotionSemanticOwnerAlignment(input);
  if (!audit.valid) {
    throw new Error(`semanticOwner promotion preflight 실패:\n- ${audit.errors.join('\n- ')}`);
  }
  return audit;
}

export const ART_PROMOTION_BINDING_ROWS = Object.freeze(bindingRows);
