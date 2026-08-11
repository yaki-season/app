import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const shader = readFileSync(new URL('../../src/shaders/beerCoreVfx.frag.glsl', import.meta.url), 'utf8');
const material = readFileSync(new URL('../../src/render/beerCoreVfxMaterial.js', import.meta.url), 'utf8');

describe('생맥주 코어 GPU VFX', () => {
  it('프로덕션 번들에 셰이더를 포함하고 런타임 경로 fetch에 의존하지 않는다', () => {
    expect(material).toContain("../shaders/beerCoreVfx.frag.glsl?raw");
    expect(material).not.toContain('fetch(');
  });

  it('맥주·거품 주입과 왕관·넘침·완성 상태 uniform을 제공한다', () => {
    for (const uniform of ['uPourBeer', 'uPourFoam', 'uFoamCrown', 'uOverflow', 'uFinished']) {
      expect(shader).toContain(`uniform float ${uniform};`);
    }
  });

  it('유체 줄기·거품 왕관·넘침·연무를 fragment에서 계산한다', () => {
    for (const token of ['stream', 'crown', 'spill', 'mist']) expect(shader).toContain(token);
  });
});
