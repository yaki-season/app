import { describe, it, expect } from 'vitest';
import {
  CATEGORY,
  MENU,
  isRepeatable,
  stationOf,
  validateOrderSequence,
  reduceToImplemented,
} from '../../src/config/menu.js';

// DATA-001 §상세요구사항
describe('메뉴 카테고리 정의', () => {
  it('카테고리 5종이 각각 스테이션과 중복 규칙을 가진다', () => {
    expect(Object.keys(CATEGORY).sort()).toEqual(['drink', 'fry', 'sashimi', 'side', 'skewer']);
    expect(isRepeatable('drink')).toBe(true);
    expect(isRepeatable('skewer')).toBe(true);
    expect(isRepeatable('fry')).toBe(false);
    expect(isRepeatable('sashimi')).toBe(false);
    expect(isRepeatable('side')).toBe(false);
  });

  it('스테이션 라우팅이 카테고리에서 파생된다', () => {
    expect(stationOf('skewer')).toBe('grill');
    expect(stationOf('drink')).toBe('drink');
  });

  it('모든 메뉴 항목이 정의된 카테고리를 가진다', () => {
    for (const item of Object.values(MENU)) {
      expect(CATEGORY[item.category], `${item.id}의 카테고리`).toBeDefined();
    }
  });

  it('즉시제공 메뉴는 양배추다', () => {
    expect(MENU.cabbage.label).toBe('양배추');
    expect(MENU.cabbage.category).toBe('side');
  });
});

describe('주문 순서열 검증', () => {
  it('중복 허용 카테고리는 여러 번 올 수 있다', () => {
    expect(validateOrderSequence(['skewer', 'skewer']).valid).toBe(true);
    expect(validateOrderSequence(['drink', 'skewer', 'skewer']).valid).toBe(true);
  });

  it('중복 불허 카테고리가 두 번 이상이면 거부한다', () => {
    expect(validateOrderSequence(['sashimi', 'sashimi']).valid).toBe(false);
    expect(validateOrderSequence(['fry', 'fry']).valid).toBe(false);
    expect(validateOrderSequence(['side', 'side']).valid).toBe(false);
  });

  it('미정의 카테고리는 거부한다', () => {
    expect(validateOrderSequence(['skewer', 'ramen']).valid).toBe(false);
  });
});

describe('구현된 스테이션으로 축약', () => {
  it('구현되지 않은 스테이션 슬롯을 제거한다', () => {
    expect(reduceToImplemented(['drink', 'skewer', 'skewer'])).toEqual(['skewer', 'skewer']);
    expect(reduceToImplemented(['skewer'])).toEqual(['skewer']);
    expect(reduceToImplemented(['drink', 'drink'])).toEqual([]);
  });
});
