import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { S0_D3_STORY_SCENES } from '../../src/scenario/s0-d3-content.js';
import {
  S0_AKI_STORY_ALLOWED_PRESENTATIONS,
  S0_AKI_STORY_DIALOGUE_VARIANTS,
  S0_AKI_STORY_EXPRESSION_VARIANTS,
  S0_AKI_STORY_PORTRAIT_BINDING,
  S0_AKI_STORY_PORTRAIT_BINDING_CONTRACT_VERSION,
  validateS0AkiStoryPortraitBindingContract,
} from '../../src/assets/s0AkiStoryPortraitBindingContract.js';

const runtimeHtml = readFileSync(
  new URL('../../src/s0-d3.html', import.meta.url),
  'utf8',
);
const runtimeCss = readFileSync(
  new URL('../../src/s0-d3.css', import.meta.url),
  'utf8',
);
const runtimeJs = readFileSync(
  new URL('../../src/app/entrypoints/s0-d3.js', import.meta.url),
  'utf8',
);
const runtimeManifest = JSON.parse(readFileSync(
  new URL('../../public/assets/manifest.json', import.meta.url),
  'utf8',
));

const scaleRect = (rect) => Object.fromEntries(
  Object.entries(rect).map(([key, value]) => [key, Math.round(value * (2 / 3))]),
);

const overlaps = (a, b) => (
  a.x < b.x + b.width
  && a.x + a.width > b.x
  && a.y < b.y + b.height
  && a.y + a.height > b.y
);

const functionSource = (name, nextName) => runtimeJs.slice(
  runtimeJs.indexOf(`function ${name}(`),
  runtimeJs.indexOf(`function ${nextName}(`),
);

describe(`CH-AKI-STORY portrait binding v${S0_AKI_STORY_PORTRAIT_BINDING_CONTRACT_VERSION}`, () => {
  it('현재 story runtime의 exact component/state와 Aki dialogue를 고정한다', () => {
    expect(S0_AKI_STORY_PORTRAIT_BINDING).toMatchObject({
      componentId: 'story.actors',
      actorId: 'CHAR-AKI',
      requiredAssetId: 'CH-AKI-STORY',
      sourceMasterId: 'CM-AKI-STORY-PORTRAIT-R5',
      semanticOwner: 'artist-2.s0-prologue-story',
      bodyPartCount: 0,
      directClickAllowed: false,
      bounds: { interactionBounds: null },
    });
    expect(S0_AKI_STORY_ALLOWED_PRESENTATIONS.filter(
      ({ screenId }) => screenId === 'SCR-STORY-BEAT',
    ).map(({ screenId, stateId, sceneId }) => ({
      screenId,
      stateId,
      sceneId,
    }))).toEqual(S0_D3_STORY_SCENES.map((scene) => ({
      screenId: scene.screenId,
      stateId: `${scene.dayId}-${scene.timing}`,
      sceneId: scene.sceneId,
    })));
    expect(Object.keys(S0_AKI_STORY_DIALOGUE_VARIANTS)).toEqual(
      S0_D3_STORY_SCENES.flatMap(
        (scene) => scene.lines
          .filter(({ speakerId }) => speakerId === 'CHAR-AKI')
          .map(({ dialogueId }) => dialogueId),
      ),
    );
  });

  it('피로·집중·실수·안도는 하나의 source master를 공유한다', () => {
    expect(S0_AKI_STORY_EXPRESSION_VARIANTS.map(
      ({ stateVariant }) => stateVariant,
    )).toEqual(['fatigue', 'focus', 'mistake', 'relief']);
    expect(new Set(Object.values(S0_AKI_STORY_DIALOGUE_VARIANTS))).toEqual(
      new Set(['fatigue', 'focus', 'mistake', 'relief']),
    );
    expect(S0_AKI_STORY_PORTRAIT_BINDING.sourceMasterPolicy).toMatchObject({
      oneSharedOriginal: true,
      duplicatePerScreen: false,
      duplicatePerExpression: false,
    });
  });

  it('fixed camera와 FHD/720 portrait·DOM safe rect를 2/3 contain으로 고정한다', () => {
    const binding = S0_AKI_STORY_PORTRAIT_BINDING;
    expect(binding.camera).toMatchObject({
      cameraId: 'S0-AKI-STORY-FIXED-V1',
      projection: 'fixed-16:9',
      crop: 'contain',
      panAllowed: false,
      zoomAllowed: false,
    });
    expect(binding.bounds.visualBounds).toEqual({
      fhd: { x: 192, y: 224, width: 384, height: 512 },
      hd: { x: 128, y: 149, width: 256, height: 341 },
    });
    for (const bounds of [
      binding.bounds.visualBounds,
      ...Object.values(binding.bounds.domSafeRects),
    ]) {
      expect(bounds.hd).toEqual(scaleRect(bounds.fhd));
    }
    expect(binding.bounds.domSafeRects).toEqual({
      dialogue: {
        fhd: { x: 640, y: 224, width: 1152, height: 608 },
        hd: { x: 427, y: 149, width: 768, height: 405 },
      },
      progress: {
        fhd: { x: 640, y: 848, width: 1152, height: 72 },
        hd: { x: 427, y: 565, width: 768, height: 48 },
      },
      skipAndNext: {
        fhd: { x: 128, y: 936, width: 1664, height: 104 },
        hd: { x: 85, y: 624, width: 1109, height: 69 },
      },
      summary: {
        fhd: { x: 128, y: 128, width: 1664, height: 792 },
        hd: { x: 85, y: 85, width: 1109, height: 528 },
      },
    });
    for (const viewportId of ['fhd', 'hd']) {
      const portrait = binding.bounds.visualBounds[viewportId];
      expect(overlaps(portrait, binding.bounds.domSafeRects.dialogue[viewportId])).toBe(false);
      expect(overlaps(portrait, binding.bounds.domSafeRects.progress[viewportId])).toBe(false);
      expect(overlaps(portrait, binding.bounds.domSafeRects.skipAndNext[viewportId])).toBe(false);
    }
    expect(binding.compositionPolicy.portraitVisibleDuringSkipSummary).toBe(false);
  });

  it('actors/z30은 background 위·DOM 아래이며 portrait는 클릭 대상이 아니다', () => {
    expect(S0_AKI_STORY_PORTRAIT_BINDING.layer).toEqual({
      name: 'actors',
      zOrder: 30,
      backgroundZOrder: 0,
      semanticDomZOrder: 80,
    });
    expect(S0_AKI_STORY_PORTRAIT_BINDING.bounds.interactionBounds).toBeNull();
    expect(S0_AKI_STORY_PORTRAIT_BINDING.bodyRepresentation).toBe(
      'non-interactive-full-body-portrait',
    );
  });

  it('story/post-settlement 외 소비와 CH-OWNER-STORY fallback을 금지한다', () => {
    const guard = S0_AKI_STORY_PORTRAIT_BINDING.runtimeGuard;
    expect(guard.allowedScreenIds).toEqual([
      'SCR-STORY-BEAT',
      'SCR-POST-SETTLEMENT',
    ]);
    expect(guard.forbiddenScreenIds).toContain('SCR-STORY-PROLOGUE');
    expect(guard.forbiddenScreenIds.filter(
      (screenId) => screenId.startsWith('SCR-SVC-'),
    )).toHaveLength(9);
    expect(guard).toMatchObject({
      legacyAssetIds: ['CH-OWNER-STORY'],
      fallbackAssetIds: [],
      exactAssetIdOnly: true,
      nearestApprovedSubstituteAllowed: false,
      legacyIdFallbackAllowed: false,
      missingAssetBehavior: 'semantic-glyph-placeholder',
      missingVariantBehavior: 'semantic-glyph-placeholder',
      runtimeRegistrationBeforeApprovalAllowed: false,
    });
    expect(runtimeManifest.assets.find(({ id }) => id === 'CH-AKI-STORY')).toMatchObject({
      status: 'approved',
      sourceRevision: 5,
      url: '/assets/core/s0/story/ch-aki-story-r5-b1.png',
    });
    expect(runtimeManifest.assets.some(({ id }) => id === 'CH-OWNER-STORY')).toBe(false);
  });

  it('승인 초상만 story에 표시하고 제거된 개발용 글자 placeholder를 복원하지 않는다', () => {
    expect(runtimeHtml).toContain('id="story-portrait" class="story-portrait"');
    expect(runtimeHtml).not.toContain('portrait-placeholder');
    expect(runtimeCss).not.toContain('.portrait-placeholder');
    expect(functionSource('renderS0', 'renderStory')).toContain('hideStoryPortrait()');
    expect(functionSource('renderStory', 'advanceAfterStory')).toContain('renderStoryPortrait(speaker, line.dialogueId)');
    expect(functionSource('renderSummary', 'renderBusiness')).toContain('hideStoryPortrait()');
    expect(functionSource('renderBusiness', 'renderSettlement')).toContain('hideStoryPortrait()');
    expect(functionSource('renderSettlement', 'renderComplete')).toContain("renderStoryPortrait(FIXED_CHARACTER.AKI");
    expect(runtimeJs).not.toContain('CH-OWNER-STORY');
  });

  it('계약 validator가 unassigned 없이 green이다', () => {
    expect(validateS0AkiStoryPortraitBindingContract()).toEqual([]);
    expect(JSON.stringify(S0_AKI_STORY_PORTRAIT_BINDING)).not.toContain('unassigned');
  });
});
