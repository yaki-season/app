import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const material = readFileSync(new URL('../../src/render/beerCoreVfxMaterial.js', import.meta.url), 'utf8');

describe('생맥주 코어 GPU VFX', () => {
  it('프로덕션 번들에 셰이더를 포함하고 런타임 경로 fetch에 의존하지 않는다', () => {
    expect(material).toContain("../shaders/beerCoreVfx.frag.glsl?raw");
    expect(material).not.toContain('fetch(');
  });

});
