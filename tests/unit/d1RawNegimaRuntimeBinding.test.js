import { describe, expect, it } from 'vitest';
import { D1_RUNTIME_COMPONENT_INVENTORY } from '../../src/assets/d1RuntimeInventory.js';
import {
  D1_GRILL_NEGIMA_SPRITE_ROLE,
  D1_RAW_NEGIMA_RUNTIME_ASSET_ID,
  D1_RUNTIME_ASSET_ID,
  indexApprovedRuntimeAssets,
  reportD1RuntimeAssetReadiness,
  reportD1RawNegimaExactLoadReadiness,
  resolveD1RawNegimaRuntimeBundle,
} from '../../src/assets/runtimeAssetResolver.js';
import {
  D1_RAW_NEGIMA_TRIANGLE_COUNT,
  validateD1RawNegimaComposition,
} from '../../src/render/d1RawNegimaCompositor.js';

const approved = (id, format = 'png', companions = []) => ({
  id,
  status: 'approved',
  sourceRevision: 1,
  runtimeBuild: 1,
  url: `/assets/${id}.${format}`,
  sha256: `${id}-sha`,
  format,
  companions,
});

describe('D1 approved RAW negima exact-load binding', () => {
  it('composition과 세 model/albedo pair를 하나의 exact bundle로 해석한다', () => {
    const albedo = (id) => ({
      role: 'pixel-albedo',
      url: `/assets/${id}.png`,
      sha256: `${id}-albedo-sha`,
      format: 'png',
    });
    const stageSprite = (role) => ({
      role,
      url: `/assets/${role}.png`,
      sha256: `${role}-sha`,
      format: 'png',
    });
    const manifest = {
      assets: [
        approved(
          D1_RAW_NEGIMA_RUNTIME_ASSET_ID.COMPOSITION,
          'json',
          Object.values(D1_GRILL_NEGIMA_SPRITE_ROLE).map(stageSprite),
        ),
        approved(D1_RAW_NEGIMA_RUNTIME_ASSET_ID.SKEWER_BASE, 'glb', [albedo('skewer')]),
        approved(D1_RAW_NEGIMA_RUNTIME_ASSET_ID.CHICKEN, 'glb', [albedo('chicken')]),
        approved(D1_RAW_NEGIMA_RUNTIME_ASSET_ID.NEGI, 'glb', [albedo('negi')]),
        approved(D1_RUNTIME_ASSET_ID.ASSEMBLY_TRAY_NEGIMA),
      ],
    };

    const bundle = resolveD1RawNegimaRuntimeBundle(indexApprovedRuntimeAssets(manifest));
    expect(bundle.composition.id).toBe('MDL-NEGIMA-GRILL-RAW');
    expect(Object.keys(bundle.stageSprites)).toEqual([
      'raw',
      'cooking',
      'proper',
      'overcooked',
      'burnt',
    ]);
    expect(Object.keys(bundle.sources)).toEqual(['skewerBase', 'chicken', 'negi']);
    expect(Object.values(bundle.sources).every((source) => (
      source.model.format === 'glb' && source.albedo.role === 'pixel-albedo'
    ))).toBe(true);
    expect(bundle.traySprite.id).toBe('SPR-ASSEMBLY-TRAY-NEGIMA');
  });

  it('승인 R1 sequence·pivot·476 triangles가 다르면 consumer가 거부한다', () => {
    const approvedComposition = {
      id: 'MDL-NEGIMA-GRILL-RAW',
      sourceRevision: 1,
      rootNode: 'grillNegimaRoot',
      flipPivot: { node: 'flipPivot' },
      sequence: ['chicken', 'green-onion', 'chicken', 'green-onion', 'chicken'],
      ingredientScaleRelativeToBase: 1.4,
      triangleCount: D1_RAW_NEGIMA_TRIANGLE_COUNT,
    };
    expect(validateD1RawNegimaComposition(approvedComposition)).toBe(approvedComposition);
    expect(() => validateD1RawNegimaComposition({
      ...approvedComposition,
      sequence: ['green-onion', 'chicken'],
    })).toThrow('승인 R1과 다릅니다');
  });

  it('exact load 성공 보고에서만 RAW를 placeholder·unboundApprovedIds에서 제거한다', () => {
    const allIds = new Set([
      ...D1_RUNTIME_COMPONENT_INVENTORY.map((entry) => entry.requiredAssetId),
      ...Object.values(D1_RUNTIME_ASSET_ID),
    ]);
    const manifest = { assets: [...allIds].map((id) => approved(id)) };
    const baseline = reportD1RuntimeAssetReadiness(manifest);
    const readiness = reportD1RawNegimaExactLoadReadiness(manifest);

    expect(readiness.contractAudit.valid).toBe(true);
    expect(readiness.placeholderCount).toBe(baseline.placeholderCount - 4);
    for (const assetId of Object.values(D1_RAW_NEGIMA_RUNTIME_ASSET_ID)) {
      expect(readiness.placeholderIds).not.toContain(assetId);
      expect(readiness.unboundApprovedIds).not.toContain(assetId);
      expect(readiness.contractAudit.inventoryBoundIds).toContain(assetId);
    }
  });
});
