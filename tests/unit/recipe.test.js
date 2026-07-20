import { describe, it, expect } from 'vitest';
import { classifyDoneness, DONENESS, COOK_THRESHOLDS_SEC } from '../../src/config/recipe.js';

// GPL-001 §상세요구사항 9 / QA-001 §자동검증 2
// 명세가 지정한 경계 6개를 그 값 그대로 검증한다.
describe('classifyDoneness 임계 경계', () => {
  const CASES = [
    [2.499, DONENESS.UNDER],
    [2.5, DONENESS.PERFECT],
    [5.499, DONENESS.PERFECT],
    [5.5, DONENESS.OVER],
    [6.999, DONENESS.OVER],
    [7.0, DONENESS.BURNT],
  ];

  for (const [elapsedSec, expected] of CASES) {
    it(`${elapsedSec}초는 ${expected}이다`, () => {
      expect(classifyDoneness(elapsedSec)).toBe(expected);
    });
  }

  it('임계값이 GPL-001의 고정값과 일치한다', () => {
    expect(COOK_THRESHOLDS_SEC.perfect).toBe(2.5);
    expect(COOK_THRESHOLDS_SEC.over).toBe(5.5);
    expect(COOK_THRESHOLDS_SEC.burnt).toBe(7.0);
  });
});
