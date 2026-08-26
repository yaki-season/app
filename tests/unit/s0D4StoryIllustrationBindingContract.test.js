import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  S0_D3_STORY_ILLUSTRATION_BY_SCENE_KEY,
} from '../../src/assets/s0D3StoryIllustrationBindingContract.js';

const manifest = JSON.parse(readFileSync(
  new URL('../../public/assets/manifest.json', import.meta.url),
  'utf8',
));

describe('D4 영업 전 스토리 일러스트 바인딩', () => {
  it('사용자 승인 R4 자산을 D4-PRE 장면에 exact ID로 연결한다', () => {
    expect(S0_D3_STORY_ILLUSTRATION_BY_SCENE_KEY['D4-PRE']).toMatchObject({
      sceneKey: 'D4-PRE',
      requiredAssetId: 'IL-D4-PREOPEN-PIXEL',
      semanticOwner: 'artist-2.s0-prologue-story',
    });
  });

  it('런타임 매니페스트와 실제 파일의 크기·해시·승인 상태가 일치한다', () => {
    const asset = manifest.assets.find(({ id }) => id === 'IL-D4-PREOPEN-PIXEL');
    const fileUrl = new URL(`../../public${asset.url}`, import.meta.url);
    const bytes = readFileSync(fileUrl);

    expect(asset).toMatchObject({
      sourceRevision: 4,
      runtimeBuild: 1,
      status: 'approved',
      dimensions: { width: 1672, height: 941 },
      bytes: statSync(fileUrl).size,
    });
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
  });
});
