import { describe, expect, it } from 'vitest';
import {
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
