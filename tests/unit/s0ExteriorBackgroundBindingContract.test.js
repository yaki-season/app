import { describe, expect, it } from 'vitest';
import {
  ART_BINDING_CAMERA,
  S0_ART_BINDING_INVENTORY,
} from '../../src/assets/s0D1ArtBindingContract.js';
import {
  S0_EXTERIOR_BACKGROUND_BINDINGS,
  S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT_VERSION,
  validateS0ExteriorBackgroundBindingContract,
} from '../../src/assets/s0ExteriorBackgroundBindingContract.js';

describe(`S0 exterior state backgrounds v${S0_EXTERIOR_BACKGROUND_BINDING_CONTRACT_VERSION}`, () => {
  const overlaps = (a, b) => (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  );
  it('KEY는 closed, GATE는 gate-open background를 서로 다른 exact ID로 고정한다', () => {
    expect(S0_EXTERIOR_BACKGROUND_BINDINGS).toHaveLength(2);
    expect(S0_EXTERIOR_BACKGROUND_BINDINGS[0]).toMatchObject({
      screenId: 'SCR-STORY-PROLOGUE',
      stateId: 'S0-STATE-KEY',
      phaseId: 'exterior-key',
      interactionId: 'S0-KEY-SELECT',
      componentId: 'prologue.exterior.background',
      requiredAssetId: 'BG-EXTERIOR-S0-CLOSED',
      stateVariant: 'closed',
      visualMeaning: 'central-gate-fully-closed',
      semanticOwner: 'artist-2.s0-prologue-story',
      sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
      camera: ART_BINDING_CAMERA.S0_EXTERIOR_FIXED_V1,
      layer: { name: 'background', zOrder: 0 },
      bodyPartCount: 0,
      compositionPolicy: {
        forbiddenAssetId: 'BG-EXTERIOR-S0-GATE-OPEN',
        forbidResidualPixelsFromForbiddenAsset: true,
      },
    });
    expect(S0_EXTERIOR_BACKGROUND_BINDINGS[1]).toMatchObject({
      screenId: 'SCR-STORY-PROLOGUE',
      stateId: 'S0-STATE-GATE',
      phaseId: 'gate-open',
      interactionId: 'S0-GATE-OPEN',
      componentId: 'prologue.exterior.background',
      requiredAssetId: 'BG-EXTERIOR-S0-GATE-OPEN',
      stateVariant: 'gate-open-empty-interior',
      visualMeaning: 'same-exterior-central-opening-open-empty-interior-visible',
      semanticOwner: 'artist-2.s0-prologue-story',
      sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
      camera: ART_BINDING_CAMERA.S0_EXTERIOR_FIXED_V1,
      layer: { name: 'background', zOrder: 0 },
      bodyPartCount: 0,
      compositionPolicy: {
        strategy: 'full-frame-background-recomposition',
        forbiddenAssetId: 'BG-EXTERIOR-S0-CLOSED',
        forbidResidualPixelsFromForbiddenAsset: true,
        runtimeVisualAssetIds: ['BG-EXTERIOR-S0-GATE-OPEN'],
        runtimeVisualLayerCount: 1,
        separateComponentVisualLayersAllowed: false,
        openGateOutlineCount: 1,
        closedGateResidualPixelCount: 0,
        provenanceInteractionReference: {
          requiredAssetId: 'PR-SHOP-GATE-S0',
          stateVariant: 'open',
          approvedReviewRevision: 'R6',
          roles: ['background-production-provenance', 'interaction-meaning-and-bounds'],
          runtimeVisualLayerAllowed: false,
          separateRuntimePromotionAllowed: false,
          bounds: {
            fhd: { x: 720, y: 224, width: 480, height: 624 },
            hd: { x: 480, y: 149, width: 320, height: 416 },
          },
        },
      },
    });
    expect(new Set(S0_EXTERIOR_BACKGROUND_BINDINGS.map(
      (entry) => entry.requiredAssetId,
    )).size).toBe(2);
  });

  it('GATE는 background 한 장만 그리고 PR-SHOP-GATE-S0 R6는 비시각 reference로 유지한다', () => {
    const gate = S0_EXTERIOR_BACKGROUND_BINDINGS[1];
    expect(gate.compositionPolicy.runtimeVisualAssetIds).toEqual([
      'BG-EXTERIOR-S0-GATE-OPEN',
    ]);
    expect(gate.compositionPolicy.runtimeVisualLayerCount).toBe(1);
    expect(gate.compositionPolicy.openGateOutlineCount).toBe(1);
    expect(gate.compositionPolicy.closedGateResidualPixelCount).toBe(0);
    expect(gate.compositionPolicy.provenanceInteractionReference).toMatchObject({
      requiredAssetId: 'PR-SHOP-GATE-S0',
      runtimeVisualLayerAllowed: false,
      separateRuntimePromotionAllowed: false,
    });
    for (const viewportId of ['fhd', 'hd']) {
      expect(overlaps(
        gate.bounds[viewportId].domSafeRect,
        gate.compositionPolicy.provenanceInteractionReference.bounds[viewportId],
      )).toBe(false);
    }
    expect(validateS0ExteriorBackgroundBindingContract()).toEqual([]);
  });

  it('KEY/GATE가 S0_EXTERIOR_FIXED camera를 공유하고 active inventory와 1:1이다', () => {
    expect(S0_ART_BINDING_INVENTORY).toHaveLength(2);
    expect(S0_ART_BINDING_INVENTORY.map((entry) => entry.phaseId)).toEqual([
      'exterior-key',
      'gate-open',
    ]);
    expect(S0_EXTERIOR_BACKGROUND_BINDINGS.every((background, index) => (
      S0_ART_BINDING_INVENTORY[index].camera.cameraId === background.camera.cameraId
    ))).toBe(true);
  });

  it('KEY/GATE의 FHD/720 visual bounds와 DOM safe rect는 동일하다', () => {
    const expectedBounds = {
      fhd: {
        visualBounds: { x: 0, y: 0, width: 1920, height: 1080 },
        interactionBounds: null,
        domSafeRect: { x: 128, y: 936, width: 1664, height: 104 },
      },
      hd: {
        visualBounds: { x: 0, y: 0, width: 1280, height: 720 },
        interactionBounds: null,
        domSafeRect: { x: 85, y: 624, width: 1109, height: 69 },
      },
    };
    expect(S0_EXTERIOR_BACKGROUND_BINDINGS[0].bounds).toEqual(expectedBounds);
    expect(S0_EXTERIOR_BACKGROUND_BINDINGS[1].bounds).toEqual(expectedBounds);
    expect(validateS0ExteriorBackgroundBindingContract()).toEqual([]);
  });
});
