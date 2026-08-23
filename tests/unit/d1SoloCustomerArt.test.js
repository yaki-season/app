import { describe, expect, it } from 'vitest';
import {
  isD1SoloBeerFrame,
  resolveD1SoloCustomerFrame,
} from '../../src/presentation/ui/d1SoloCustomerArt.js';

const bundle = Object.freeze({
  id: 'CH-EXTRA-SOLO-SERVICE',
  url: '/solo-waiting.png',
  companions: Object.freeze([
    { role: 'solo-eating-skewer', url: '/solo-skewer.png' },
    { role: 'solo-drinking-beer', url: '/solo-beer.png' },
  ]),
});

describe('D1 solo customer art selector', () => {
  it('제공된 음식이 없으면 대기 프레임을 유지한다', () => {
    expect(resolveD1SoloCustomerFrame(bundle)).toBe(bundle);
  });

  it('한 종류만 제공되면 그 행동 프레임을 사용한다', () => {
    const frame = resolveD1SoloCustomerFrame(bundle, { servedBeer: true });
    expect(frame).toMatchObject({
      url: '/solo-beer.png',
      frameRole: 'solo-drinking-beer',
    });
    expect(isD1SoloBeerFrame(frame)).toBe(true);
  });

  it('두 종류가 제공되면 기존 1.2초 간격으로 번갈아 표시한다', () => {
    const skewer = resolveD1SoloCustomerFrame(bundle, {
      servedSkewer: true,
      servedBeer: true,
      nowMs: 0,
    });
    const beer = resolveD1SoloCustomerFrame(bundle, {
      servedSkewer: true,
      servedBeer: true,
      nowMs: 1200,
    });

    expect(skewer.url).toBe('/solo-skewer.png');
    expect(beer.url).toBe('/solo-beer.png');
  });
});
