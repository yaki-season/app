import { describe, expect, it } from 'vitest';
import {
  D1_RUNTIME_COMPONENT_INVENTORY,
  reportD1RuntimeComponentInventory,
} from '../../src/assets/d1RuntimeInventory.js';
import { ART_SEMANTIC_OWNER_ID } from '../../src/assets/artSemanticOwnerIds.js';

const approvedManifest = {
  assets: D1_RUNTIME_COMPONENT_INVENTORY.map((entry) => ({
    id: entry.requiredAssetId,
    status: 'approved',
    url: `/assets/${entry.requiredAssetId}.webp`,
  })),
};

describe('D1 공개 상태 runtime inventory', () => {
  it('모든 항목에 화면·상태·component·asset·owner 계약이 있고 의미 키가 중복되지 않는다', () => {
    const keys = D1_RUNTIME_COMPONENT_INVENTORY.map((entry) => {
      expect(entry).toMatchObject({
        screenId: expect.stringMatching(/^SCR-/),
        stateId: expect.stringMatching(/^D1-/),
        componentId: expect.any(String),
        requiredAssetId: expect.any(String),
        semanticOwner: expect.stringMatching(/^artist-[13]\.[a-z0-9.-]+$/),
      });
      return `${entry.screenId}:${entry.stateId}:${entry.componentId}:${entry.requiredAssetId}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(D1_RUNTIME_COMPONENT_INVENTORY.map((entry) => entry.screenId))).toEqual(new Set([
      'SCR-SVC-CUSTOMERS',
      'SCR-SVC-ASSEMBLY',
      'SCR-SVC-GRILL',
      'SCR-SVC-DRINK',
      'SCR-POST-CLOSING',
      'SCR-POST-SETTLEMENT',
    ]));
  });

  it('manifest 승인만으로 pending binding을 준비 완료로 오인하지 않는다', () => {
    const report = reportD1RuntimeComponentInventory(approvedManifest);
    const pendingCount = D1_RUNTIME_COMPONENT_INVENTORY
      .filter((entry) => entry.bindingState === 'pending').length;
    expect(report).toMatchObject({
      ready: false,
      totalCount: D1_RUNTIME_COMPONENT_INVENTORY.length,
      placeholderCount: pendingCount,
    });
    expect(report.placeholderRequiredAssetIdsByOwner[
      ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING
    ])
      .toContain('MDL-NEGIMA-GRILL-PROPER-FIRST-FACE');
    expect(report.placeholderRequiredAssetIdsByOwner[
      ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE
    ])
      .not.toContain('CH-EXTRA-COMMUTER-SERVICE');
    expect(report.entries.find((entry) => entry.requiredAssetId === 'CH-EXTRA-COMMUTER-SERVICE'))
      .toMatchObject({
        bindingState: 'bound',
        placeholder: false,
        stateVariants: [
          'office-a',
          'office-b',
          'office-c',
          'office-d',
          'office-e',
          'waiting',
          'eating-negima',
          'drinking-beer',
        ],
      });
  });

  it('manifest 승인 binding과 code-native 구현은 placeholder가 아니다', () => {
    const report = reportD1RuntimeComponentInventory({
      assets: approvedManifest.assets.filter((asset) => (
        asset.id === 'D1-TSUKIOKA-WAITING'
        || asset.id === 'UI-CUSTOMER-ORDER-WAIT-PANEL'
      )),
    });
    const resolved = report.entries.filter((entry) => !entry.placeholder);
    expect(resolved.map((entry) => entry.requiredAssetId)).toEqual([
      'D1-TSUKIOKA-WAITING',
      'UI-CUSTOMER-ORDER-WAIT-PANEL',
      'MDL-NEGIMA-GRILL-COOKING-SECOND-FACE',
      'TEX-BEER-LIQUID',
      'VFX-BEER-CORE',
    ]);
  });
});
