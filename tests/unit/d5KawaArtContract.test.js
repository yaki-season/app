import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { D2_MOMO_RUNTIME_URLS } from '../../src/render/d2MomoSpriteRuntime.js';
import { D5_KAWA_RUNTIME_URLS } from '../../src/render/d5KawaSpriteRuntime.js';

const publicRoot = new URL('../../public', import.meta.url);

function assetBytes(url) {
  return readFileSync(fileURLToPath(new URL(`.${url}`, publicRoot)));
}

function pngSize(bytes) {
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.subarray(12, 16).toString()).toBe('IHDR');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes.readUInt8(25),
  };
}

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

describe('D5 토리카와 원본 기반 아트 계약', () => {
  it('토리카와는 모모와 분리된 전용 런타임 에셋을 사용한다', () => {
    expect(D5_KAWA_RUNTIME_URLS.raw).not.toBe(D2_MOMO_RUNTIME_URLS.raw);
    expect(D5_KAWA_RUNTIME_URLS.order).not.toBe(D2_MOMO_RUNTIME_URLS.order);
    expect(D5_KAWA_RUNTIME_URLS.servedPlate).not.toBe(D2_MOMO_RUNTIME_URLS.servedPlate);
  });

  it('그릴 단계와 조립 단계는 동일한 꼬치 규격과 투명 배경을 유지한다', () => {
    const urls = [
      D5_KAWA_RUNTIME_URLS.raw,
      D5_KAWA_RUNTIME_URLS.cooking,
      D5_KAWA_RUNTIME_URLS.proper,
      D5_KAWA_RUNTIME_URLS.overcooked,
      D5_KAWA_RUNTIME_URLS.burnt,
      ...D5_KAWA_RUNTIME_URLS.assemblyProgress,
    ];
    urls.forEach((url) => {
      expect(pngSize(assetBytes(url))).toEqual({ width: 109, height: 494, colorType: 6 });
    });
  });

  it('생·완벽 직전·완벽·과조리·탄 단계가 서로 다른 이미지다', () => {
    const hashes = [
      D5_KAWA_RUNTIME_URLS.raw,
      D5_KAWA_RUNTIME_URLS.cooking,
      D5_KAWA_RUNTIME_URLS.proper,
      D5_KAWA_RUNTIME_URLS.overcooked,
      D5_KAWA_RUNTIME_URLS.burnt,
    ].map((url) => hash(assetBytes(url)));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('주문 아이콘과 완성 접시 에셋 규격을 고정한다', () => {
    expect(pngSize(assetBytes(D5_KAWA_RUNTIME_URLS.order))).toMatchObject({
      width: 256,
      height: 256,
      colorType: 6,
    });
    expect(pngSize(assetBytes(D5_KAWA_RUNTIME_URLS.servedPlate))).toMatchObject({
      width: 2048,
      height: 1024,
      colorType: 6,
    });
  });
});
