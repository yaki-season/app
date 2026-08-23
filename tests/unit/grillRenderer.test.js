import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elapsedSecToUniform } from '../../src/presentation/three/grillRenderer.js';
import { GRILL_PARAMS, GRILL_PARAM_RANGES } from '../../src/presentation/three/grillShaderParams.js';

describe('grill shader parameters', () => {
  it('maps game timing to the shader range without exceeding 0..1', () => {
    expect(elapsedSecToUniform(-1)).toBe(0);
    expect(elapsedSecToUniform(0)).toBe(0);
    expect(elapsedSecToUniform(12)).toBe(0.5);
    expect(elapsedSecToUniform(20)).toBeLessThan(1);
    expect(elapsedSecToUniform(21)).toBe(1);
    expect(elapsedSecToUniform(30)).toBe(1);
  });

  it('keeps every tunable scalar inside its declared range', () => {
    for (const [name, [min, max]] of Object.entries(GRILL_PARAM_RANGES)) {
      expect(GRILL_PARAMS[name], name).toBeGreaterThanOrEqual(min);
      expect(GRILL_PARAMS[name], name).toBeLessThanOrEqual(max);
    }
  });

  it('exposes immutable defaults', () => {
    expect(Object.isFrozen(GRILL_PARAMS)).toBe(true);
    expect(Object.isFrozen(GRILL_PARAM_RANGES)).toBe(true);
    expect(Object.isFrozen(GRILL_PARAMS.rawTint)).toBe(true);
    expect(Object.isFrozen(GRILL_PARAM_RANGES.tareAmount)).toBe(true);
  });

  it('keeps edible negima golden and delays broad burnt colouring', () => {
    expect(GRILL_PARAMS.cookedTint[1]).toBeGreaterThanOrEqual(0.9);
    expect(GRILL_PARAMS.cookedTint[2]).toBeGreaterThanOrEqual(0.75);
    expect(GRILL_PARAMS.cookToBurntEdge[0]).toBeGreaterThanOrEqual(0.8);
    expect(GRILL_PARAMS.charStartDoneness).toBeGreaterThanOrEqual(0.65);
    expect(GRILL_PARAMS.charThreshold[1]).toBeGreaterThanOrEqual(0.4);
    expect(GRILL_PARAMS.tareTintAmount).toBeLessThanOrEqual(0.2);
  });
});

// 사용자 확정(2026-08-10): 그릴 네기마는 승인 원본 한 장을 두고 GLSL이 색만 바꾼다.
// 단계마다 승인 래스터를 갈아끼우면 실루엣·디테일이 통째로 변해 "이미지가 교체된다"로 보인다.
// 이 계약이 조용히 뒤집히지 않도록 소스에 고정한다.
describe('그릴 네기마 렌더 계약', () => {
  const source = readFileSync(new URL('../../src/app/entrypoints/d1-game.js', import.meta.url), 'utf8');

  it('굽는 동안 단계별 래스터 교체 대신 셰이더 재질로 색만 바꾼다', () => {
    // 셰이더 재질을 만들어 승인 평면에 물리는 경로가 살아 있어야 한다.
    expect(source).toContain('createGrillMaterial()');
    expect(source).toContain('bindCookingMaterialToApprovedPlane');
    expect(source).toContain('g.setDoneness(');

    // 조리 중에는 setCooking으로 재질만 전환한다. setStage는 셰이더가 없을 때의 폴백이다.
    expect(source).toMatch(/if \(shaderOnApprovedPlane\) rawInstance\.setCooking\?\.\(v\?\.cooking === true\);/);
    expect(source).not.toMatch(/rawInstance\.setCooking\?\.\(false\);\s*\n\s*rawInstance\.setStage/);
  });
});
