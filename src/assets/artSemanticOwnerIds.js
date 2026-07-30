export const ART_SEMANTIC_OWNER_ID = Object.freeze({
  ARTIST_1_D1_COOKING: 'artist-1.d1-assembly-grill-food-shader',
  ARTIST_2_S0_PROLOGUE: 'artist-2.s0-prologue-story',
  ARTIST_3_D1_SERVICE: 'artist-3.d1-drink-service-cleanup-customer-settlement',
});

export const ART_SEMANTIC_OWNER_IDS = Object.freeze(
  Object.values(ART_SEMANTIC_OWNER_ID),
);

const FULLY_QUALIFIED_OWNER_PATTERN = /^artist-\d+\.[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export function isFullyQualifiedArtSemanticOwner(value) {
  return typeof value === 'string' && FULLY_QUALIFIED_OWNER_PATTERN.test(value);
}
