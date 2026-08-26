// developer A/B(office a/b) 승인 라스터는 다른 손님 라스터와 달리 인물이 캔버스 중앙이 아니라
// 오른쪽(≈0.566)에 그려져 있다. 좌석 이동은 풀프레임 레이어 중심을 좌석 중심에 맞추므로
// 이 캔버스 편심을 보정하지 않으면 손님이 의자보다 오른쪽에 앉는다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { alphaBounds, readPngAlpha } from '../helpers/pngAlpha.js';
import {
  D1_OFFICE_ART_FIGURE_CENTER_X,
  d1OfficeActorOffsetX,
} from '../../src/render/d1OfficeCustomerArt.js';

const publicRoot = new URL('../../public', import.meta.url);
const assetBytes = (url) => readFileSync(fileURLToPath(new URL(`.${url}`, publicRoot)));
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('./assets/manifest.json', publicRoot)), 'utf8'));

// 인물 bounding box의 가로 중심을 캔버스 정규화 좌표로 돌려준다.
function alphaCenterX(bytes) {
  const png = readPngAlpha(bytes);
  const bounds = alphaBounds(png);
  expect(bounds).not.toBeNull();
  return (bounds.minX + bounds.maxX + 1) / 2 / png.width;
}

const commuter = manifest.assets.find(({ id }) => id === 'CH-EXTRA-COMMUTER-SERVICE');
const urlFor = (variant, state) => (variant === 'a' && state === 'waiting'
  ? commuter.url
  : commuter.companions.find(({ role }) => role === `office-${variant}-${state}`).url);
const STATES = ['waiting', 'eating-negima', 'drinking-beer'];

describe('D1 office 손님 라스터 좌우 정렬 계약', () => {
  it('선언한 인물 중심 x가 실제 승인 라스터의 알파 중심과 일치한다', () => {
    for (const variant of ['a', 'b', 'c', 'd', 'e']) {
      for (const state of STATES) {
        expect(alphaCenterX(assetBytes(urlFor(variant, state))))
          .toBeCloseTo(D1_OFFICE_ART_FIGURE_CENTER_X[variant], 2);
      }
    }
  });

  it('developer A/B만 캔버스 편심을 좌석 배치에서 되돌린다', () => {
    const developerOffset = 0.5 - D1_OFFICE_ART_FIGURE_CENTER_X.a;
    expect(developerOffset).toBeLessThan(0);
    expect(d1OfficeActorOffsetX('D1-OFFICE-A')).toBeCloseTo(developerOffset, 6);
    expect(d1OfficeActorOffsetX('D1-OFFICE-B')).toBeCloseTo(developerOffset, 6);
    for (const id of ['D1-OFFICE-C', 'D1-OFFICE-D', 'D1-OFFICE-E', 'D2-COMMUTER-A', 'D1-SOLO-A', null]) {
      expect(d1OfficeActorOffsetX(id)).toBe(0);
    }
  });
});
