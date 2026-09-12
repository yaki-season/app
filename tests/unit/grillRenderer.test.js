import { describe, expect, it } from 'vitest';
import { elapsedSecToUniform } from '../../src/render/grillRenderer.js';
import { GRILL_PARAMS, GRILL_PARAM_RANGES } from '../../src/render/grillShaderParams.js';

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
