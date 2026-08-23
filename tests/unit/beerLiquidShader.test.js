import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const shader = readFileSync(new URL('../../src/shaders/beerLiquid.frag.glsl', import.meta.url), 'utf8');
const material = readFileSync(new URL('../../src/presentation/three/beerLiquidMaterial.js', import.meta.url), 'utf8');

describe('맥주 액체 GPU 셰이더', () => {
  it('프로덕션 번들에 셰이더를 포함하고 런타임 경로 fetch에 의존하지 않는다', () => {
    expect(material).toContain("../shaders/beerLiquid.frag.glsl?raw");
    expect(material).not.toContain('fetch(');
  });

  it('맥주·거품·넘침을 독립 uniform으로 받는다', () => {
    expect(shader).toContain('uniform float uBeerFill;');
    expect(shader).toContain('uniform float uFoamFill;');
    expect(shader).toContain('uniform float uOverflow;');
  });

  it('거품 표면 파동과 상승 기포를 프래그먼트 단계에서 계산한다', () => {
    expect(shader).toMatch(/float wave\s*=/);
    expect(shader).toMatch(/float bubble\s*=/);
    expect(shader).toContain('uTime');
  });
});
