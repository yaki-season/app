// 공용 준비 목록 품질 판정 검증 (gameState.clickOrderMat과 같은 규칙, GPL-001 §13).
import { describe, it, expect } from 'vitest';
import { preparedItemZone, qualityFromCook } from '../../src/render/preparedDock.js';

describe('qualityFromCook', () => {
  it('양면 적정이면 좋음(good)', () => {
    expect(qualityFromCook('perfect', 'perfect')).toBe('good');
  });
  it('한 면이라도 과다면 낮음(low)', () => {
    expect(qualityFromCook('over', 'perfect')).toBe('low');
    expect(qualityFromCook('perfect', 'over')).toBe('low');
    expect(qualityFromCook('over', 'over')).toBe('low');
  });
});

describe('preparedItemZone', () => {
  it('꼬치 요리는 요리 서빙대, 생맥주는 음료 픽업대로 분리한다', () => {
    expect(preparedItemZone({ menu: '네기마' })).toBe('food');
    expect(preparedItemZone({ menu: '모모' })).toBe('food');
    expect(preparedItemZone({ menu: '생맥주' })).toBe('drink');
  });
});
