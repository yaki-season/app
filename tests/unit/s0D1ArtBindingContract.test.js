import { describe, expect, it } from 'vitest';
import { S0_INTERACTIONS } from '../../src/scenario/s0-d3-content.js';
import { D1_RUNTIME_COMPONENT_INVENTORY } from '../../src/assets/d1RuntimeInventory.js';
import {
  ART_BINDING_VIEWPORTS,
  D1_DRINK_ART_BINDING_INVENTORY,
  D1_DRINK_VISUAL_VARIANTS,
  S0_BRAZIER_LAYER_CONTRACT,
  S0_BRAZIER_LAYER_CONTRACT_VERSION,
  S0_ART_BINDING_INVENTORY,
  S0_D1_ART_BINDING_CONTRACT_VERSION,
  validateS0D1ArtBindingContract,
} from '../../src/assets/s0D1ArtBindingContract.js';

const scaleRect = (rect) => Object.fromEntries(
  Object.entries(rect).map(([key, value]) => [key, Math.round(value * (2 / 3))]),
);

describe(`S0·D1 art binding contract v${S0_D1_ART_BINDING_CONTRACT_VERSION}`, () => {
  it('S0 구현의 3상태·3클릭과 정확히 1:1이고 구형 4 phase가 없다', () => {
    expect(S0_ART_BINDING_INVENTORY).toHaveLength(3);
    expect(S0_ART_BINDING_INVENTORY.map(({ stateId, phaseId, interactionId }) => ({
      stateId,
      phaseId,
      interactionId,
    }))).toEqual(S0_INTERACTIONS.map(({ stateId, phaseId, interactionId }) => ({
      stateId,
      phaseId,
      interactionId,
    })));
    expect(S0_ART_BINDING_INVENTORY.map((entry) => entry.phaseId)).toEqual([
      'exterior-key',
      'gate-open',
      'ignite',
    ]);
    expect(JSON.stringify(S0_ART_BINDING_INVENTORY)).not.toMatch(
      /interior-check|"note"|"exterior"|"charcoal"/,
    );
  });

  it('S0 모든 상태가 component/asset/variant/bounds/layer를 가지며 신체 부위는 0개다', () => {
    for (const entry of S0_ART_BINDING_INVENTORY) {
      expect(entry).toMatchObject({
        screenId: 'SCR-STORY-PROLOGUE',
        componentId: expect.stringMatching(/^prologue\./),
        requiredAssetId: expect.any(String),
        stateVariant: expect.any(String),
        semanticOwner: 'artist-2.s0-prologue-story',
        layer: { name: expect.any(String), zOrder: expect.any(Number) },
        bodyPartCount: 0,
      });
      expect(entry.bounds.fhd).toMatchObject({
        visualBounds: expect.any(Object),
        interactionBounds: expect.any(Object),
        domSafeRect: expect.any(Object),
      });
      expect(entry.bounds.hd.visualBounds).toEqual(scaleRect(entry.bounds.fhd.visualBounds));
      expect(entry.bounds.hd.interactionBounds).toEqual(
        scaleRect(entry.bounds.fhd.interactionBounds),
      );
      expect(entry.bounds.hd.domSafeRect).toEqual(scaleRect(entry.bounds.fhd.domSafeRect));
    }
    expect(ART_BINDING_VIEWPORTS.hd).toMatchObject({ width: 1280, height: 720, scale: 2 / 3 });
  });

  it(`화로 layer contract v${S0_BRAZIER_LAYER_CONTRACT_VERSION}는 primary와 ignition companion을 분리한다`, () => {
    expect(S0_BRAZIER_LAYER_CONTRACT).toMatchObject({
      sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
      semanticOwner: 'artist-2.s0-prologue-story',
      bodyPartCount: 0,
      primary: {
        componentId: 'prologue.brazier-and-charcoal',
        requiredAssetId: 'ST-S0-BRAZIER',
        stateVariant: 'cold-to-ignited',
        layer: { name: 'architecture', zOrder: 20 },
      },
      companion: {
        componentId: 'prologue.ignitionVfx',
        requiredAssetId: 'PR-CHARCOAL-IGNITION',
        stateVariant: 'off-to-stable',
        layer: { name: 'vfx', zOrder: 50 },
        interactionBounds: null,
      },
      compositionPolicy: {
        runtimeVisualLayerCount: 2,
        childBoundsDerivedFromInteractionBounds: false,
        noDoubleRender: true,
      },
    });
    expect(S0_BRAZIER_LAYER_CONTRACT.companion.bounds).toEqual({
      fhd: { visualBounds: { x: 736, y: 408, width: 448, height: 224 } },
      hd: { visualBounds: { x: 491, y: 272, width: 299, height: 149 } },
    });
    expect(S0_BRAZIER_LAYER_CONTRACT.primary.pixelOwnership.join(' ')).not.toMatch(
      /보이는 숯 조각/,
    );
    expect(S0_BRAZIER_LAYER_CONTRACT.companion.pixelOwnership.join(' ')).toMatch(
      /모든 보이는 숯 조각/,
    );
  });

  it('D1 드링크 첫 묶음 네 ID를 고정한다', () => {
    expect(D1_DRINK_ART_BINDING_INVENTORY.map((entry) => entry.requiredAssetId)).toEqual([
      'BG-WORKSPACE-DRINK',
      'ST-DRINK-BEER-TIER-1',
      'MDL-BEER-GLASS',
      'MDL-BEER-LEVER',
    ]);
    expect(D1_DRINK_ART_BINDING_INVENTORY.every(
      (entry) => entry.semanticOwner
        === 'artist-3.d1-drink-service-cleanup-customer-settlement',
    )).toBe(true);
    const runtimeRows = D1_RUNTIME_COMPONENT_INVENTORY
      .filter((entry) => entry.screenId === 'SCR-SVC-DRINK')
      .map(({ screenId, stateId, componentId, requiredAssetId }) => ({
        screenId,
        stateId,
        componentId,
        requiredAssetId,
      }));
    expect(D1_DRINK_ART_BINDING_INVENTORY.map(
      ({ screenId, stateId, componentId, requiredAssetId }) => ({
        screenId,
        stateId,
        componentId,
        requiredAssetId,
      }),
    )).toEqual(runtimeRows);
  });

  it('빈 잔·70%·100%·넘침·완성은 glass/liquid/VFX 시각 layer만 사용한다', () => {
    expect(D1_DRINK_VISUAL_VARIANTS.map((variant) => variant.stateVariant)).toEqual([
      'empty',
      'fill-70',
      'fill-100',
      'overflow',
      'finished',
    ]);
    for (const variant of D1_DRINK_VISUAL_VARIANTS) {
      expect(variant.layers.map((layer) => layer.requiredAssetId)).toEqual([
        'MDL-BEER-GLASS',
        'TEX-BEER-LIQUID',
        'VFX-BEER-CORE',
      ]);
      expect(new Set(variant.layers.map((layer) => layer.semanticOwner))).toEqual(
        new Set(['artist-3.d1-drink-service-cleanup-customer-settlement']),
      );
      expect(variant).not.toHaveProperty('judgement');
      expect(variant).not.toHaveProperty('quality');
      expect(variant).not.toHaveProperty('gameplayState');
    }
  });

  it('semanticOwner 단일성과 전체 contract 자동 검증을 통과한다', () => {
    const ownersByAsset = new Map();
    for (const entry of [...S0_ART_BINDING_INVENTORY, ...D1_DRINK_ART_BINDING_INVENTORY]) {
      const owners = ownersByAsset.get(entry.requiredAssetId) ?? new Set();
      owners.add(entry.semanticOwner);
      ownersByAsset.set(entry.requiredAssetId, owners);
    }
    expect([...ownersByAsset.values()].every((owners) => owners.size === 1)).toBe(true);
    expect(validateS0D1ArtBindingContract()).toEqual([]);
  });
});
