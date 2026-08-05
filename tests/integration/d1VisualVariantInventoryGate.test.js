import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  D1_DRINK_VISUAL_VARIANTS,
  D1_VISUAL_ASSET_ACCOUNTING,
} from '../../src/assets/s0D1ArtBindingContract.js';
import {
  D1_RUNTIME_COMPONENT_INVENTORY,
  reportD1RuntimeComponentInventory,
} from '../../src/assets/d1RuntimeInventory.js';
import {
  D1_RUNTIME_ASSET_ID,
  reportD1RuntimeAssetReadiness,
} from '../../src/assets/runtimeAssetResolver.js';

const approvedAsset = (id) => ({
  id,
  status: 'approved',
  url: `/assets/${id}.png`,
});

describe('D1 visual variant inventory completeness gate', () => {
  it('실제 render 소비를 required 2·derived 1로 판정하고 required layer를 inventory에 전수 집계한다', () => {
    expect(D1_VISUAL_ASSET_ACCOUNTING.map((decision) => ({
      requiredAssetId: decision.requiredAssetId,
      classification: decision.classification,
    }))).toEqual([
      { requiredAssetId: 'TEX-BEER-LIQUID', classification: 'required' },
      { requiredAssetId: 'VFX-BEER-CORE', classification: 'required' },
      { requiredAssetId: 'FD-BEER-SERVED', classification: 'derived' },
    ]);

    const inventoryIds = new Set(
      D1_RUNTIME_COMPONENT_INVENTORY.map((entry) => entry.requiredAssetId),
    );
    const directlyConsumedIds = new Set(
      D1_DRINK_VISUAL_VARIANTS.flatMap((variant) => (
        variant.layers.map((layer) => layer.requiredAssetId)
      )),
    );
    for (const decision of D1_VISUAL_ASSET_ACCOUNTING) {
      if (decision.classification === 'required') {
        expect(directlyConsumedIds.has(decision.requiredAssetId)).toBe(true);
        expect(inventoryIds.has(decision.requiredAssetId)).toBe(true);
      } else {
        expect(inventoryIds.has(decision.requiredAssetId)).toBe(false);
      }
    }
  });

  it('required visual 하나만 누락돼도 placeholder 0을 반환하지 않는다', () => {
    const fullyBoundInventory = D1_RUNTIME_COMPONENT_INVENTORY.map((entry) => ({
      ...entry,
      bindingState: 'bound',
    }));
    const manifestWithoutLiquid = {
      assets: D1_RUNTIME_COMPONENT_INVENTORY
        .filter((entry) => entry.requiredAssetId !== 'TEX-BEER-LIQUID')
        .map((entry) => approvedAsset(entry.requiredAssetId)),
    };

    const report = reportD1RuntimeComponentInventory(
      manifestWithoutLiquid,
      fullyBoundInventory,
    );
    expect(report.ready).toBe(false);
    expect(report.placeholderCount).toBe(1);
    expect(report.placeholderRequiredAssetIds).toEqual(['TEX-BEER-LIQUID']);
  });

  it('두 D1 진입점이 실제 consumer가 있는 동일한 44/20/24 readiness 집계를 공개한다', () => {
    const manifest = {
      assets: Object.values(D1_RUNTIME_ASSET_ID).map(approvedAsset),
    };
    expect(reportD1RuntimeAssetReadiness(manifest)).toMatchObject({
      requiredRuntimeCount: 44,
      boundRuntimeCount: 20,
      placeholderCount: 24,
    });

    for (const entrypoint of ['d1.js', 'd1-scene.js']) {
      const source = readFileSync(
        new URL(`../../src/${entrypoint}`, import.meta.url),
        'utf8',
      );
      expect(source).toContain(
        'document.body.dataset.assetPlaceholderCount = String(assets.readiness.placeholderCount);',
      );
      expect(source).toContain(
        'document.body.dataset.runtimeAssetsReady = String(assets.readiness.ready);',
      );
    }
  });
});
