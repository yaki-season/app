import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  d1OfficeActorOffsetX,
  d1OfficeCustomerVariant,
  isD1OfficeBeerFrame,
  resolveD1OfficeCustomerFrame,
} from '../../src/render/d1OfficeCustomerArt.js';

const bundle = Object.freeze({
  id: 'CH-EXTRA-COMMUTER-SERVICE',
  url: '/office-a-waiting.png',
  companions: Object.freeze([
    ...['a', 'b', 'c', 'd', 'e'].flatMap((variant) => [
      ...(variant === 'a' ? [] : [{ role: `office-${variant}-waiting`, url: `/${variant}-waiting.png` }]),
      { role: `office-${variant}-eating-negima`, url: `/${variant}-negima.png` },
      { role: `office-${variant}-drinking-beer`, url: `/${variant}-beer.png` },
    ]),
  ]),
});

describe('D1 office customer art selector', () => {
  it('maps the five approved office identities without mirroring', () => {
    expect(['A', 'B', 'C', 'D', 'E'].map((id) => d1OfficeCustomerVariant(`D1-OFFICE-${id}`)))
      .toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(d1OfficeCustomerVariant('D1-SOLO-A')).toBeNull();
    expect(d1OfficeCustomerVariant('D2-COMMUTER-A')).toBe('c');
    expect(d1OfficeCustomerVariant('D3-COMMUTER-B')).toBe('d');
    expect(d1OfficeCustomerVariant('D3-COMMUTER-C')).toBe('e');
  });

  it('uses each identity waiting frame before food is served', () => {
    expect(resolveD1OfficeCustomerFrame(bundle, { customerId: 'D1-OFFICE-A' }).url)
      .toBe('/office-a-waiting.png');
    expect(resolveD1OfficeCustomerFrame(bundle, { customerId: 'D1-OFFICE-E' }).url)
      .toBe('/e-waiting.png');
  });

  it('shows the only served item and alternates both served items', () => {
    const beer = resolveD1OfficeCustomerFrame(bundle, {
      customerId: 'D1-OFFICE-B',
      servedBeer: true,
    });
    expect(beer.url).toBe('/b-beer.png');
    expect(isD1OfficeBeerFrame(beer)).toBe(true);

    const negima = resolveD1OfficeCustomerFrame(bundle, {
      customerId: 'D1-OFFICE-B',
      phase: 'eating',
      servedNegima: true,
      servedBeer: true,
      nowMs: 0,
    });
    const alternatingBeer = resolveD1OfficeCustomerFrame(bundle, {
      customerId: 'D1-OFFICE-B',
      phase: 'eating',
      servedNegima: true,
      servedBeer: true,
      nowMs: 1200,
    });
    expect(negima.url).toBe('/b-negima.png');
    expect(alternatingBeer.url).toBe('/b-beer.png');
  });
});

// d1-game의 extraKind는 D1~D5의 OFFICE·COMMUTER를 모두 office 아트로 보낸다. 변형을 못 읽으면
// 번들 기본 url(=developer A 라스터)로 조용히 대체되고 캔버스 편심 보정도 못 받아 오른쪽으로 밀린다.
const releasesDir = new URL('../../content/releases/', import.meta.url);
const officeCustomerIds = readdirSync(fileURLToPath(releasesDir))
  .filter((name) => name.endsWith('.json'))
  .flatMap((name) => [...new Set(
    readFileSync(fileURLToPath(new URL(name, releasesDir)), 'utf8')
      .match(/"D[1-9]\d*-(?:OFFICE|COMMUTER)-[A-Z]"/g) ?? [],
  )])
  .map((quoted) => quoted.slice(1, -1))
  .sort();

describe('D1~D5 office 손님 신원 해석', () => {
  it('출시 정의에 실제로 등장하는 모든 office·commuter 손님이 승인 변형으로 해석된다', () => {
    expect(officeCustomerIds.length).toBeGreaterThan(0);
    const unresolved = officeCustomerIds.filter((id) => d1OfficeCustomerVariant(id) === null);
    expect(unresolved).toEqual([]);
  });

  it('D4·D5 손님도 D1~D3와 같은 변형·좌우 보정을 받는다', () => {
    expect(d1OfficeCustomerVariant('D4-OFFICE-A')).toBe('a');
    expect(d1OfficeCustomerVariant('D5-OFFICE-B')).toBe('b');
    expect(d1OfficeCustomerVariant('D4-COMMUTER-A')).toBe('c');
    expect(d1OfficeCustomerVariant('D5-COMMUTER-B')).toBe('d');
    expect(d1OfficeActorOffsetX('D4-OFFICE-A')).toBe(d1OfficeActorOffsetX('D1-OFFICE-A'));
    expect(d1OfficeActorOffsetX('D5-COMMUTER-A')).toBe(0);
  });

  it('무작위 편성이 E를 넘는 순번을 뽑아도 승인 변형 안에서 순환한다', () => {
    expect(d1OfficeCustomerVariant('D4-OFFICE-F')).toBe('a');
    expect(d1OfficeCustomerVariant('D4-COMMUTER-F')).toBe('c');
    expect(d1OfficeCustomerVariant('D4-SOLO-A')).toBeNull();
  });
});
