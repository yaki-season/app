import { S0_D3_STORY_SCENES } from '../scenario/s0-d3-content.js';
import {
  ART_BINDING_LOGICAL_VIEWPORT,
  ART_BINDING_VIEWPORTS,
} from './s0D1ArtBindingContract.js';

export const S0_AKI_STORY_PORTRAIT_BINDING_CONTRACT_VERSION = '1.0.0';

const freezeRect = ({ x, y, width, height }) => Object.freeze({
  x,
  y,
  width,
  height,
});

const scaleRect = (rect, scale) => freezeRect({
  x: Math.round(rect.x * scale),
  y: Math.round(rect.y * scale),
  width: Math.round(rect.width * scale),
  height: Math.round(rect.height * scale),
});

const viewportRect = (fhdRect) => Object.freeze({
  fhd: fhdRect,
  hd: scaleRect(fhdRect, ART_BINDING_VIEWPORTS.hd.scale),
});

const PORTRAIT_VISUAL_BOUNDS_FHD = freezeRect({
  x: 192,
  y: 224,
  width: 384,
  height: 512,
});
const DIALOGUE_SAFE_RECT_FHD = freezeRect({
  x: 640,
  y: 224,
  width: 1152,
  height: 608,
});
const STORY_PROGRESS_SAFE_RECT_FHD = freezeRect({
  x: 640,
  y: 848,
  width: 1152,
  height: 72,
});
const STORY_ACTION_SAFE_RECT_FHD = freezeRect({
  x: 128,
  y: 936,
  width: 1664,
  height: 104,
});
const SUMMARY_SAFE_RECT_FHD = freezeRect({
  x: 128,
  y: 128,
  width: 1664,
  height: 792,
});

export const S0_AKI_STORY_CAMERA = Object.freeze({
  cameraId: 'S0-AKI-STORY-FIXED-V1',
  projection: 'fixed-16:9',
  logicalViewport: ART_BINDING_LOGICAL_VIEWPORT,
  crop: 'contain',
  panAllowed: false,
  zoomAllowed: false,
});

export const S0_AKI_STORY_EXPRESSION_VARIANTS = Object.freeze([
  Object.freeze({
    stateVariant: 'fatigue',
    meaning: '피로',
    visualIntent: '무거운 눈꺼풀과 가라앉은 어깨',
  }),
  Object.freeze({
    stateVariant: 'focus',
    meaning: '집중',
    visualIntent: '정리된 시선과 안정된 턱·어깨',
  }),
  Object.freeze({
    stateVariant: 'mistake',
    meaning: '실수',
    visualIntent: '잠깐 굳은 눈매와 자책의 정지',
  }),
  Object.freeze({
    stateVariant: 'relief',
    meaning: '안도',
    visualIntent: '조금 풀린 눈매와 내려간 긴장',
  }),
]);

const storyState = (stateId, sceneId) => Object.freeze({
  screenId: 'SCR-STORY-BEAT',
  stateId,
  sceneId,
  presentationRole: 'story-dialogue',
});

export const S0_AKI_STORY_ALLOWED_PRESENTATIONS = Object.freeze([
  storyState('S0-post-interaction', 'SCN-S0-DECISION'),
  storyState('D1-pre-open', 'SCN-D1-PREOPEN'),
  storyState('D1-post-settlement', 'SCN-D1-POST'),
  storyState('D2-pre-open', 'SCN-D2-PREOPEN'),
  storyState('D2-post-settlement', 'SCN-D2-POST'),
  storyState('D3-pre-open', 'SCN-D3-PREOPEN'),
  storyState('D3-post-settlement', 'SCN-D3-POST'),
  Object.freeze({
    screenId: 'SCR-POST-SETTLEMENT',
    stateId: 'D1-settlement-placeholder',
    sceneId: null,
    presentationRole: 'post-settlement-story-portrait',
  }),
  Object.freeze({
    screenId: 'SCR-POST-SETTLEMENT',
    stateId: 'D2-settlement-placeholder',
    sceneId: null,
    presentationRole: 'post-settlement-story-portrait',
  }),
  Object.freeze({
    screenId: 'SCR-POST-SETTLEMENT',
    stateId: 'D3-settlement-placeholder',
    sceneId: null,
    presentationRole: 'post-settlement-story-portrait',
  }),
]);

export const S0_AKI_STORY_DIALOGUE_VARIANTS = Object.freeze({
  'DLG-S0-001': 'fatigue',
  'DLG-S0-002': 'focus',
  'DLG-S0-003': 'relief',
  'DLG-D1-PRE-001': 'fatigue',
  'DLG-D1-PRE-003': 'focus',
  'DLG-D1-POST-002': 'mistake',
  'DLG-D2-PRE-001': 'focus',
  'DLG-D2-POST-002': 'relief',
  'DLG-D3-PRE-001': 'focus',
  'DLG-D3-PRE-003': 'focus',
  'DLG-D3-POST-002': 'relief',
});

export const S0_AKI_STORY_PORTRAIT_BINDING = Object.freeze({
  componentId: 'story.actors',
  actorId: 'CHAR-AKI',
  requiredAssetId: 'CH-AKI-STORY',
  sourceMasterId: 'CM-AKI-STORY-PORTRAIT-R1',
  semanticOwner: 'artist-2.s0-prologue-story',
  stateVariants: Object.freeze(
    S0_AKI_STORY_EXPRESSION_VARIANTS.map(({ stateVariant }) => stateVariant),
  ),
  camera: S0_AKI_STORY_CAMERA,
  bounds: Object.freeze({
    visualBounds: viewportRect(PORTRAIT_VISUAL_BOUNDS_FHD),
    interactionBounds: null,
    domSafeRects: Object.freeze({
      dialogue: viewportRect(DIALOGUE_SAFE_RECT_FHD),
      progress: viewportRect(STORY_PROGRESS_SAFE_RECT_FHD),
      skipAndNext: viewportRect(STORY_ACTION_SAFE_RECT_FHD),
      summary: viewportRect(SUMMARY_SAFE_RECT_FHD),
    }),
  }),
  layer: Object.freeze({
    name: 'actors',
    zOrder: 30,
    backgroundZOrder: 0,
    semanticDomZOrder: 80,
  }),
  bodyPartCount: 0,
  bodyRepresentation: 'non-interactive-head-shoulders-upper-torso-portrait',
  directClickAllowed: false,
  sourceMasterPolicy: Object.freeze({
    oneSharedOriginal: true,
    duplicatePerScreen: false,
    duplicatePerExpression: false,
    sceneMasterIdsAreBackgroundOnly: Object.freeze([
      'CM-PROLOGUE-INHERITANCE-R1',
      'CM-PREOPEN-PLANNING-R1',
      'CM-SETTLEMENT-R1',
    ]),
  }),
  compositionPolicy: Object.freeze({
    fit: 'contain',
    crop: 'none',
    anchor: 'bottom-center',
    portraitVisibleDuringDialogue: true,
    portraitVisibleDuringSkipSummary: false,
    dialogueAndPortraitMayOverlap: false,
    progressAndPortraitMayOverlap: false,
    skipAndPortraitMayOverlap: false,
    rasterizedDialogueAllowed: false,
    rasterizedSummaryAllowed: false,
    rasterizedControlsAllowed: false,
  }),
  runtimeGuard: Object.freeze({
    allowedScreenIds: Object.freeze([
      'SCR-STORY-BEAT',
      'SCR-POST-SETTLEMENT',
    ]),
    forbiddenScreenIds: Object.freeze([
      'SCR-STORY-PROLOGUE',
      'SCR-SVC-CUSTOMERS',
      'SCR-SVC-ASSEMBLY',
      'SCR-SVC-GRILL',
      'SCR-SVC-DRINK',
      'SCR-SVC-INSTANT',
      'SCR-SVC-FRYER',
      'SCR-SVC-HIGHBALL',
      'SCR-SVC-SASHIMI',
      'SCR-SVC-PLATING',
    ]),
    legacyAssetIds: Object.freeze(['CH-OWNER-STORY']),
    fallbackAssetIds: Object.freeze([]),
    exactAssetIdOnly: true,
    nearestApprovedSubstituteAllowed: false,
    legacyIdFallbackAllowed: false,
    missingAssetBehavior: 'semantic-glyph-placeholder',
    missingVariantBehavior: 'semantic-glyph-placeholder',
    placeholderSelector: '#portrait-placeholder',
    placeholderGlyph: '秋',
    runtimeRegistrationBeforeApprovalAllowed: false,
  }),
  currentRuntimeEvidence: Object.freeze({
    selector: '#story-portrait',
    cssWidthPx: 256,
    cssAspectRatio: '3/4',
    logicalCanvasBound: true,
    status: 'approved-runtime-bound',
    productionGeometrySource: 'this-versioned-contract',
  }),
});

const overlaps = (a, b) => (
  a.x < b.x + b.width
  && a.x + a.width > b.x
  && a.y < b.y + b.height
  && a.y + a.height > b.y
);

const rectErrors = (viewportId, field, rect) => {
  const viewport = ART_BINDING_VIEWPORTS[viewportId];
  if (!rect || Object.values(rect).some((value) => !Number.isInteger(value))) {
    return [`${field}:${viewportId} must use integer bounds`];
  }
  if (
    rect.x < 0
    || rect.y < 0
    || rect.width <= 0
    || rect.height <= 0
    || rect.x + rect.width > viewport.width
    || rect.y + rect.height > viewport.height
  ) {
    return [`${field}:${viewportId} is outside ${viewport.width}x${viewport.height}`];
  }
  return [];
};

export function validateS0AkiStoryPortraitBindingContract() {
  const errors = [];
  const binding = S0_AKI_STORY_PORTRAIT_BINDING;
  const variants = S0_AKI_STORY_EXPRESSION_VARIANTS.map(
    ({ stateVariant }) => stateVariant,
  );
  if (variants.join('|') !== 'fatigue|focus|mistake|relief') {
    errors.push('AKI expression variants must be fatigue/focus/mistake/relief');
  }
  if (new Set(variants).size !== variants.length) {
    errors.push('AKI expression variants must be unique');
  }
  const currentAkiDialogueIds = S0_D3_STORY_SCENES.flatMap(
    (scene) => scene.lines
      .filter(({ speakerId }) => speakerId === binding.actorId)
      .map(({ dialogueId }) => dialogueId),
  );
  if (
    currentAkiDialogueIds.join('|')
    !== Object.keys(S0_AKI_STORY_DIALOGUE_VARIANTS).join('|')
  ) {
    errors.push('AKI dialogue variant map does not match the current story runtime');
  }
  for (const stateVariant of Object.values(S0_AKI_STORY_DIALOGUE_VARIANTS)) {
    if (!variants.includes(stateVariant)) {
      errors.push(`unknown AKI dialogue stateVariant: ${stateVariant}`);
    }
  }
  const currentStoryPresentations = S0_D3_STORY_SCENES.map((scene) => (
    `${scene.screenId}/${scene.dayId}-${scene.timing}/${scene.sceneId}`
  ));
  const contractStoryPresentations = S0_AKI_STORY_ALLOWED_PRESENTATIONS
    .filter(({ screenId }) => screenId === 'SCR-STORY-BEAT')
    .map(({ screenId, stateId, sceneId }) => `${screenId}/${stateId}/${sceneId}`);
  if (currentStoryPresentations.join('|') !== contractStoryPresentations.join('|')) {
    errors.push('AKI allowed story presentations do not match the current runtime');
  }
  if (
    binding.componentId !== 'story.actors'
    || binding.actorId !== 'CHAR-AKI'
    || binding.requiredAssetId !== 'CH-AKI-STORY'
  ) {
    errors.push('AKI exact component/actor/asset IDs changed');
  }
  if (
    binding.sourceMasterId !== 'CM-AKI-STORY-PORTRAIT-R1'
    || !binding.sourceMasterPolicy.oneSharedOriginal
    || binding.sourceMasterPolicy.duplicatePerScreen
    || binding.sourceMasterPolicy.duplicatePerExpression
  ) {
    errors.push('AKI must use one shared portrait source master');
  }
  if (
    binding.camera.cameraId !== 'S0-AKI-STORY-FIXED-V1'
    || binding.camera.crop !== 'contain'
    || binding.camera.panAllowed
    || binding.camera.zoomAllowed
  ) {
    errors.push('AKI story camera must remain fixed 16:9 contain');
  }
  if (
    binding.bounds.interactionBounds !== null
    || binding.directClickAllowed
    || binding.bodyPartCount !== 0
  ) {
    errors.push('AKI portrait must remain non-interactive with bodyPartCount 0');
  }
  for (const viewportId of Object.keys(ART_BINDING_VIEWPORTS)) {
    const visualBounds = binding.bounds.visualBounds[viewportId];
    errors.push(...rectErrors(viewportId, 'visualBounds', visualBounds));
    for (const [safeRectId, safeRects] of Object.entries(binding.bounds.domSafeRects)) {
      const safeRect = safeRects[viewportId];
      errors.push(...rectErrors(viewportId, `domSafeRects.${safeRectId}`, safeRect));
      if (
        safeRectId !== 'summary'
        && overlaps(visualBounds, safeRect)
      ) {
        errors.push(`AKI portrait overlaps ${safeRectId} at ${viewportId}`);
      }
    }
  }
  if (
    binding.compositionPolicy.portraitVisibleDuringSkipSummary
    || !overlaps(binding.bounds.visualBounds.fhd, binding.bounds.domSafeRects.summary.fhd)
  ) {
    errors.push('summary may reuse primary content only while the portrait is hidden');
  }
  if (
    binding.runtimeGuard.allowedScreenIds.join('|')
      !== 'SCR-STORY-BEAT|SCR-POST-SETTLEMENT'
    || binding.runtimeGuard.fallbackAssetIds.length !== 0
    || binding.runtimeGuard.legacyAssetIds.join('|') !== 'CH-OWNER-STORY'
    || binding.runtimeGuard.legacyIdFallbackAllowed
    || binding.runtimeGuard.nearestApprovedSubstituteAllowed
  ) {
    errors.push('AKI story-only/no-legacy runtime guard changed');
  }
  if (
    binding.runtimeGuard.forbiddenScreenIds.some(
      (screenId) => binding.runtimeGuard.allowedScreenIds.includes(screenId),
    )
  ) {
    errors.push('AKI allowed and forbidden screen scopes overlap');
  }
  if (JSON.stringify(binding).includes('unassigned')) {
    errors.push('AKI portrait contract contains unassigned fields');
  }
  return Object.freeze(errors);
}

export const S0_AKI_STORY_PORTRAIT_BINDING_CONTRACT = Object.freeze({
  version: S0_AKI_STORY_PORTRAIT_BINDING_CONTRACT_VERSION,
  logicalViewport: ART_BINDING_LOGICAL_VIEWPORT,
  viewports: ART_BINDING_VIEWPORTS,
  binding: S0_AKI_STORY_PORTRAIT_BINDING,
  expressionVariants: S0_AKI_STORY_EXPRESSION_VARIANTS,
  dialogueVariants: S0_AKI_STORY_DIALOGUE_VARIANTS,
  allowedPresentations: S0_AKI_STORY_ALLOWED_PRESENTATIONS,
});
