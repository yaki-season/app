import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const shader = readFileSync(new URL('../../src/shaders/beerCoreVfx.frag.glsl', import.meta.url), 'utf8');

describe('생맥주 코어 GPU VFX', () => {
  it('맥주·거품 주입과 왕관·넘침·완성 상태 uniform을 제공한다', () => {
    for (const uniform of ['uPourBeer', 'uPourFoam', 'uFoamCrown', 'uOverflow', 'uFinished']) {
      expect(shader).toContain(`uniform float ${uniform};`);
    }
  });

  it('유체 줄기·거품 왕관·넘침·연무를 fragment에서 계산한다', () => {
    for (const token of ['stream', 'crown', 'spill', 'mist']) expect(shader).toContain(token);
  });
});
