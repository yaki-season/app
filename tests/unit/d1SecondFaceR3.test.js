import { describe, expect, it } from 'vitest';
import { GRILL_PARAMS } from '../../src/render/grillShaderParams.js';
import { d1SecondFaceR3Params, SECOND_FACE_R3_PARAMS } from '../../src/render/d1SecondFaceR3.js';

describe('D1 second-face R3 승인 셰이더 계약', () => {
  it('뒤집힌 조리 면에만 승인 R3 preset을 적용한다', () => {
    expect(d1SecondFaceR3Params({ cooking: true, orientationFaceDown: 'back' }))
      .toBe(SECOND_FACE_R3_PARAMS);
    expect(d1SecondFaceR3Params({ cooking: true, orientationFaceDown: 'front' })).toMatchObject({
      rawTint: GRILL_PARAMS.rawTint,
      cookedTint: GRILL_PARAMS.cookedTint,
    });
  });

  it('preset은 시간·품질 값을 소유하지 않는다', () => {
    expect(SECOND_FACE_R3_PARAMS).not.toHaveProperty('elapsedSec');
    expect(SECOND_FACE_R3_PARAMS).not.toHaveProperty('doneness');
    expect(SECOND_FACE_R3_PARAMS.cookedTint[1]).toBeGreaterThanOrEqual(0.9);
    expect(SECOND_FACE_R3_PARAMS.cookedTint[2]).toBeGreaterThanOrEqual(0.8);
    expect(SECOND_FACE_R3_PARAMS).not.toHaveProperty('quality');
  });
});
