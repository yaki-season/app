import { describe, expect, it } from 'vitest';
import {
  auditD1RuntimeAssetBindingContract,
  D1_PENDING_RUNTIME_ASSET_IDS,
  D1_RUNTIME_ASSET_ID,
  D1_RECEIVED_EATING_FRAME_INTERVAL_MS,
  indexApprovedRuntimeAssets,
  reportD1RuntimeAssetReadiness,
  resolveApprovedRuntimeAsset,
  resolveD1CustomerAsset,
  resolveD1ReceivedEatingFrame,
  runtimeAssetUrl,
} from '../../src/assets/runtimeAssetResolver.js';
import { D1_RUNTIME_COMPONENT_INVENTORY } from '../../src/assets/d1RuntimeInventory.js';
import { ART_SEMANTIC_OWNER_ID } from '../../src/assets/artSemanticOwnerIds.js';

const manifest = {
  assets: [
    {
      id: D1_RUNTIME_ASSET_ID.TSUKIOKA_WAITING,
      status: 'approved',
      url: '/assets/waiting.png',
      sourceRevision: 2,
      runtimeBuild: 1,
    },
    {
      id: D1_RUNTIME_ASSET_ID.TSUKIOKA_PARTIAL_BEER,
      status: 'approved',
      url: '/assets/partial.png',
      sourceRevision: 1,
      runtimeBuild: 1,
    },
    {
      id: D1_RUNTIME_ASSET_ID.TSUKIOKA_RECEIVED_EATING,
      status: 'approved',
      url: '/assets/eating.png',
      sourceRevision: 1,
      runtimeBuild: 1,
      companions: [{ role: 'drink-frame', url: '/assets/drinking.png' }],
    },
    { id: 'REVIEW-ONLY', status: 'review', url: '/assets/review.png' },
  ],
};

describe('D1 runtime asset resolver', () => {
  it('approved manifest ID만 index한다', () => {
    const index = indexApprovedRuntimeAssets(manifest);
    expect(index.has('REVIEW-ONLY')).toBe(false);
    expect(resolveApprovedRuntimeAsset(index, D1_RUNTIME_ASSET_ID.TSUKIOKA_WAITING)).toMatchObject({
      url: '/assets/waiting.png',
      sourceRevision: 2,
      runtimeBuild: 1,
    });
  });

  it('gameplay 손님 상태를 정확한 승인 manifest ID에 연결한다', () => {
    const assets = {
      TSUKIOKA_WAITING: { id: D1_RUNTIME_ASSET_ID.TSUKIOKA_WAITING },
      TSUKIOKA_PARTIAL_BEER: { id: D1_RUNTIME_ASSET_ID.TSUKIOKA_PARTIAL_BEER },
      TSUKIOKA_RECEIVED_EATING: { id: D1_RUNTIME_ASSET_ID.TSUKIOKA_RECEIVED_EATING },
    };
    expect(resolveD1CustomerAsset(assets, 'waiting').id).toBe(D1_RUNTIME_ASSET_ID.TSUKIOKA_WAITING);
    expect(resolveD1CustomerAsset(assets, 'partially-served').id).toBe(D1_RUNTIME_ASSET_ID.TSUKIOKA_PARTIAL_BEER);
    expect(resolveD1CustomerAsset(assets, 'reacting').id).toBe(D1_RUNTIME_ASSET_ID.TSUKIOKA_RECEIVED_EATING);
  });

  it('받은 음식·맥주 프레임을 1200ms 간격으로 정확히 교대한다', () => {
    const assets = {
      TSUKIOKA_RECEIVED_EATING: {
        id: D1_RUNTIME_ASSET_ID.TSUKIOKA_RECEIVED_EATING,
        url: '/assets/eating.png',
        companions: [{ role: 'drink-frame', url: '/assets/drinking.png' }],
      },
    };

    expect(D1_RECEIVED_EATING_FRAME_INTERVAL_MS).toBe(1200);
    expect(resolveD1ReceivedEatingFrame(assets, 0).url).toBe('/assets/eating.png');
    expect(resolveD1ReceivedEatingFrame(assets, 1199).url).toBe('/assets/eating.png');
    expect(resolveD1ReceivedEatingFrame(assets, 1200).url).toBe('/assets/drinking.png');
    expect(resolveD1ReceivedEatingFrame(assets, 2399).url).toBe('/assets/drinking.png');
    expect(resolveD1ReceivedEatingFrame(assets, 2400).url).toBe('/assets/eating.png');
  });

  it('handoff 없는 조리 상태는 승인 아트 ID로 대체하지 않는다', () => {
    expect(D1_PENDING_RUNTIME_ASSET_IDS.assembly).toEqual([
      'MDL-SKEWER-BASE',
      'MDL-INGREDIENT-CHICKEN',
      'MDL-INGREDIENT-NEGI',
    ]);
    expect(D1_PENDING_RUNTIME_ASSET_IDS.grill).toContain('MDL-NEGIMA-GRILL-RAW');
    expect(D1_PENDING_RUNTIME_ASSET_IDS.grill).not.toContain('ST-GRILL-FINISHED-TRAY');
    expect(D1_PENDING_RUNTIME_ASSET_IDS.grill).toContain('ST-GRILL-WAITING-RACK');
    expect(D1_PENDING_RUNTIME_ASSET_IDS.grill).toContain('MDL-NEGIMA-GRILL-COOKING-FIRST-FACE');
    expect(D1_PENDING_RUNTIME_ASSET_IDS.grill).toContain('MDL-NEGIMA-GRILL-PROPER-FIRST-FACE');
    expect(D1_PENDING_RUNTIME_ASSET_IDS.grill).toContain('MDL-NEGIMA-GRILL-PROPER-SECOND-FACE');
    expect(D1_PENDING_RUNTIME_ASSET_IDS.grill).toContain('CMP-GRILL-FINISHED-PROPER-NEGIMA');
    expect(D1_PENDING_RUNTIME_ASSET_IDS.drink).not.toContain('MDL-BEER-LEVER');
    expect(D1_RUNTIME_ASSET_ID.BEER_LEVER).toBe('MDL-BEER-LEVER');
    expect(D1_PENDING_RUNTIME_ASSET_IDS.drink).not.toContain('BG-WORKSPACE-DRINK');
    expect(D1_RUNTIME_ASSET_ID.DRINK_BACKGROUND).toBe('BG-WORKSPACE-DRINK');
    expect(D1_RUNTIME_ASSET_ID.DRINK_STATION).toBe('ST-DRINK-BEER-TIER-1');
    expect(Object.values(D1_RUNTIME_ASSET_ID)).not.toContain('MDL-NEGIMA-GRILL-RAW');
  });

  it('실제 consumer 없는 model을 제외하고 드링크 래스터·code-native 셰이더 뒤 전체 24·drink 0 placeholder를 집계한다', () => {
    const approvedBoundManifest = {
      assets: Object.values(D1_RUNTIME_ASSET_ID).map((id) => ({
        id,
        status: 'approved',
        url: `/assets/${id}.png`,
      })),
    };
    const readiness = reportD1RuntimeAssetReadiness(approvedBoundManifest);

    expect(readiness).toMatchObject({
      ready: false,
      requiredRuntimeCount: 44,
      approvedRuntimeCount: 21,
      boundRuntimeCount: 23,
      placeholderCount: 21,
      unboundApprovedIds: [],
      contractAudit: {
        valid: true,
        missingResolverBindingIds: [],
        unexpectedResolverBindingIds: [],
        semanticOwnerConflicts: [],
      },
    });
    expect(readiness.placeholderIdsByScene.drink).toHaveLength(0);
    expect(readiness.placeholderIdsByScene.drink).not.toContain('BG-WORKSPACE-DRINK');
    // 액체·VFX는 code-native 셰이더로 충족되어 placeholder도 missing manifest도 아니다.
    expect(readiness.missingManifestIds).not.toContain('TEX-BEER-LIQUID');
    expect(readiness.missingManifestIds).not.toContain('VFX-BEER-CORE');
    expect(readiness.placeholderIdsByScene.assembly).toHaveLength(3);
    expect(readiness.placeholderIdsByScene.grill).toHaveLength(7);
    expect(readiness.placeholderIdsByScene.customer).toHaveLength(6);
    expect(readiness.placeholderIdsByScene.customer).not.toContain('CH-EXTRA-COMMUTER-SERVICE');
    expect(readiness.placeholderIdsByScene.customer).not.toContain('CH-EXTRA-SOLO-SERVICE');
    expect(readiness.placeholderIdsByScene.customer).not.toContain('ST-SERVICE-COUNTER');
    expect(readiness.placeholderIdsByScene.closing).toHaveLength(2);
    expect(readiness.placeholderIdsByScene.settlement).toHaveLength(3);
    expect(readiness.missingManifestIds).toContain('MDL-NEGIMA-GRILL-PROPER-SECOND-FACE');
    expect(readiness.missingManifestIds).toContain('CMP-GRILL-FINISHED-PROPER-NEGIMA');
  });

  it('manifest 등록만으로 binding 미완료 placeholder를 준비 완료로 오인하지 않는다', () => {
    const allRequiredIds = D1_RUNTIME_COMPONENT_INVENTORY
      .map((entry) => entry.requiredAssetId);
    const manifestWithUnboundAssets = {
      assets: allRequiredIds.map((id) => ({
        id,
        status: 'approved',
        url: `/assets/${id}.png`,
      })),
    };

    const awaitingBinding = reportD1RuntimeAssetReadiness(manifestWithUnboundAssets);
    expect(awaitingBinding.ready).toBe(false);
    expect(awaitingBinding.placeholderCount).toBe(21);
    expect(awaitingBinding.missingManifestIds).toEqual([]);
    expect(awaitingBinding.unboundApprovedIds).toHaveLength(21);
  });

  it('inventory와 실제 binding·조리 placeholder 목록이 정확히 대응한다', () => {
    const audit = auditD1RuntimeAssetBindingContract();

    expect(audit.valid).toBe(true);
    expect(audit.inventoryBoundIds).toHaveLength(21);
    expect(audit.resolverBoundIds).toHaveLength(21);
    expect(audit.pendingScenes.assembly.missingResolverPendingIds).toEqual([]);
    expect(audit.pendingScenes.grill.unexpectedResolverPendingIds).toEqual([]);
    expect(audit.pendingScenes.drink.missingResolverPendingIds).toEqual([]);
  });

  it('stable ID의 semanticOwner 충돌과 stale placeholder를 차단한다', () => {
    const conflictedInventory = [
      ...D1_RUNTIME_COMPONENT_INVENTORY,
      {
        ...D1_RUNTIME_COMPONENT_INVENTORY[0],
        componentId: 'conflicting.owner',
        semanticOwner: ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING,
      },
    ];
    const stalePending = {
      ...D1_PENDING_RUNTIME_ASSET_IDS,
      grill: D1_PENDING_RUNTIME_ASSET_IDS.grill
        .filter((id) => id !== 'CMP-GRILL-FINISHED-PROPER-NEGIMA'),
    };
    const audit = auditD1RuntimeAssetBindingContract(
      conflictedInventory,
      D1_RUNTIME_ASSET_ID,
      stalePending,
    );

    expect(audit.valid).toBe(false);
    expect(audit.semanticOwnerConflicts).toEqual([
      {
        assetId: 'ARTIST-010-BACKGROUND-COMPLETE',
        semanticOwners: [
          ART_SEMANTIC_OWNER_ID.ARTIST_3_D1_SERVICE,
          ART_SEMANTIC_OWNER_ID.ARTIST_1_D1_COOKING,
        ],
      },
    ]);
    expect(audit.pendingScenes.grill.missingResolverPendingIds)
      .toEqual(['CMP-GRILL-FINISHED-PROPER-NEGIMA']);
  });

  it('src 정적 미리보기에서만 public 접두사를 붙인다', () => {
    expect(runtimeAssetUrl('/assets/a.png', '/src/d1.html')).toBe('/public/assets/a.png');
    expect(runtimeAssetUrl('/public/assets/a.png', '/src/d1.html')).toBe('/public/assets/a.png');
    expect(runtimeAssetUrl('/assets/a.png', '/game/')).toBe('/assets/a.png');
  });
});
