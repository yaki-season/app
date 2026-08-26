// 그릴 칸 명성 해금 데이터·로직 (GPL-005 v2.23.0, DAT-001 v5.24.0). 1단계: 데이터+순수 로직만.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import {
  campaignGrillUpgradeState,
  grillSlotsForReputation,
  grillUnlockState,
} from '../../src/domain/progression/grillSlots.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const data = read('content/progression/grill-slots.json');
const schema = read('content/schema/grill-slots.schema.json');

describe('그릴 칸 명성 해금', () => {
  it('grill-slots.json이 스키마를 통과한다', () => {
    const validate = new Ajv({ strict: false }).compile(schema);
    expect(validate(data)).toBe(true);
  });

  it('D4 활성 기준선은 명성 10과 day-d4로 2→3칸이다', () => {
    expect(data.status).toBe('approved');
    expect(data.maxSlots).toBe(8);
    expect(data.tiers).toEqual([
      { reputation: 0, slots: 2 },
      { reputation: 10, slots: 3, requiresUnlockId: 'day-d4' },
    ]);
  });

  it('기존 명성 전용 소비자도 현재 활성 tier의 3칸까지만 계산한다', () => {
    expect(grillSlotsForReputation(0, data)).toBe(2);
    expect(grillSlotsForReputation(9, data)).toBe(2);
    expect(grillSlotsForReputation(10, data)).toBe(3);
    expect(grillSlotsForReputation(999, data)).toBe(3);
  });

  it('해금 대기: 반영 칸 < 명성 가능 칸이면 pending(즉시 아님·클릭 반영)', () => {
    expect(grillUnlockState(2, 10, data)).toEqual({ available: 3, claimed: 2, pending: true });
    expect(grillUnlockState(3, 10, data)).toEqual({ available: 3, claimed: 3, pending: false });
    expect(grillUnlockState(2, 5, data)).toEqual({ available: 2, claimed: 2, pending: false });
  });

  it('캠페인 판정은 day-d4와 명성 10을 모두 요구한다', () => {
    expect(campaignGrillUpgradeState({
      claimedSlots: 2,
      reputation: 100,
      unlockIds: [],
    }, data)).toMatchObject({
      available: 2,
      pending: false,
      targetSlots: 3,
      blockedBy: 'unlock',
    });
    expect(campaignGrillUpgradeState({
      claimedSlots: 2,
      reputation: 9,
      unlockIds: ['day-d4'],
    }, data)).toMatchObject({
      available: 2,
      pending: false,
      requiredReputation: 10,
      blockedBy: 'reputation',
    });
    expect(campaignGrillUpgradeState({
      claimedSlots: 2,
      reputation: 10,
      unlockIds: ['day-d4'],
    }, data)).toMatchObject({
      available: 3,
      pending: true,
      blockedBy: null,
    });
    expect(campaignGrillUpgradeState({
      claimedSlots: 3,
      reputation: 10,
      unlockIds: ['day-d4'],
    }, data)).toMatchObject({
      available: 3,
      claimed: 3,
      pending: false,
    });
  });
});
