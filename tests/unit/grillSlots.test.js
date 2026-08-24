// 그릴 칸 명성 해금 데이터·로직 (GPL-005 v2.23.0, DAT-001 v5.24.0). 1단계: 데이터+순수 로직만.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { grillSlotsForReputation, grillUnlockState } from '../../src/render/progression.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const data = read('content/progression/grill-slots.json');
const schema = read('content/schema/grill-slots.schema.json');

describe('그릴 칸 명성 해금', () => {
  it('grill-slots.json이 스키마를 통과한다', () => {
    const validate = new Ajv({ strict: false }).compile(schema);
    expect(validate(data)).toBe(true);
  });

  it('데이터 기준선: 최대 8칸, 구간 0→2·10→4·20→6·30→8', () => {
    expect(data.maxSlots).toBe(8);
    expect(data.tiers).toEqual([
      { reputation: 0, slots: 2 },
      { reputation: 10, slots: 4 },
      { reputation: 20, slots: 6 },
      { reputation: 30, slots: 8 },
    ]);
  });

  it('명성으로 칸 수를 정한다(도달 최고 구간, maxSlots 상한)', () => {
    expect(grillSlotsForReputation(0, data)).toBe(2);
    expect(grillSlotsForReputation(9, data)).toBe(2);
    expect(grillSlotsForReputation(10, data)).toBe(4);
    expect(grillSlotsForReputation(19, data)).toBe(4);
    expect(grillSlotsForReputation(20, data)).toBe(6);
    expect(grillSlotsForReputation(30, data)).toBe(8);
    expect(grillSlotsForReputation(999, data)).toBe(8); // 상한
  });

  it('해금 대기: 반영 칸 < 명성 가능 칸이면 pending(즉시 아님·클릭 반영)', () => {
    expect(grillUnlockState(2, 10, data)).toEqual({ available: 4, claimed: 2, pending: true });
    expect(grillUnlockState(4, 10, data)).toEqual({ available: 4, claimed: 4, pending: false });
    expect(grillUnlockState(2, 5, data)).toEqual({ available: 2, claimed: 2, pending: false });
  });
});
