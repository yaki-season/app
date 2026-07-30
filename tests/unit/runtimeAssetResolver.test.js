import { describe, expect, it } from 'vitest';
import {
  D1_PENDING_RUNTIME_ASSET_IDS,
  D1_RUNTIME_ASSET_ID,
  indexApprovedRuntimeAssets,
  resolveApprovedRuntimeAsset,
  resolveD1CustomerAsset,
  runtimeAssetUrl,
} from '../../src/assets/runtimeAssetResolver.js';

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

  it('handoff 없는 조리 상태는 승인 아트 ID로 대체하지 않는다', () => {
    expect(D1_PENDING_RUNTIME_ASSET_IDS.assembly).toContain('BG-WORKSPACE-ASSEMBLY');
    expect(D1_PENDING_RUNTIME_ASSET_IDS.grill).toContain('MDL-NEGIMA-GRILL-RAW');
    expect(D1_PENDING_RUNTIME_ASSET_IDS.drink).toContain('MDL-BEER-LEVER');
  });

  it('src 정적 미리보기에서만 public 접두사를 붙인다', () => {
    expect(runtimeAssetUrl('/assets/a.png', '/src/d1.html')).toBe('/public/assets/a.png');
    expect(runtimeAssetUrl('/assets/a.png', '/game/')).toBe('/assets/a.png');
  });
});
