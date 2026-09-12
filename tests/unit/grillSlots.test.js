import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { assertGrillMarketConfig, campaignGrillUpgradeState, grillSlotsForReputation, grillUnlockState } from '../../src/domain/progression/grillSlots.js';
import { publicGrillLayout } from '../../src/config/d1GrillLayout.js';

const read = p => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const data = read('content/progression/grill-slots.json');
const schema = read('content/schema/grill-slots.schema.json');

describe('명성 마켓의 실제 그릴 확장', () => {
  it('활성 카탈로그는 승인된 2~6칸 상품과 스키마를 지킨다', () => {
    expect(assertGrillMarketConfig(data)).toBe(data);
    expect(new Ajv({ strict: false }).compile(schema)(data)).toBe(true);
    expect(data.status).toBe('approved');
    expect(data.maxSlots).toBe(6);
    expect(data.tiers.map(({ reputation, slots }) => [reputation, slots])).toEqual([[0, 2], [12, 3], [30, 4], [60, 5], [90, 6]]);
  });
  it.each([null, {}, { ...data, tiers: 'bad' }, { ...data, maxSlots: 8 },
    { ...data, tiers: [...data.tiers].reverse() }])('손상된 상품은 빈 마켓 복구 대상으로 분류한다: %j', invalid => {
    expect(() => assertGrillMarketConfig(invalid)).toThrow('상품 구성');
  });
  it.each([[12, 3], [30, 4], [60, 5], [90, 6]])('명성 %i 경계에서 %i칸 상품이 열린다', (reputation, slots) => {
    expect(grillSlotsForReputation(reputation - 1, data)).toBe(slots - 1);
    expect(grillSlotsForReputation(reputation, data)).toBe(slots);
    expect(campaignGrillUpgradeState({ claimedSlots: slots - 1, reputation }, data)).toMatchObject({ pending: true, targetSlots: slots, blockedBy: null });
  });
  it('명성은 영업 중 자동 확장하지 않고 하락해도 받은 설비를 회수하지 않는다', () => {
    expect(grillUnlockState(2, 90, data)).toEqual({ available: 6, claimed: 2, pending: true });
    expect(campaignGrillUpgradeState({ claimedSlots: 5, reputation: 0 }, data)).toMatchObject({ available: 5, claimed: 5, pending: false, targetSlots: 6 });
    expect(grillSlotsForReputation(999, data)).toBe(6);
    expect(grillSlotsForReputation(NaN, data)).toBe(2);
  });
  it('단계를 건너뛰지 않으며 구 카탈로그의 추가 잠금도 존중한다', () => {
    expect(campaignGrillUpgradeState({ claimedSlots: 2, reputation: 100 }, data)).toMatchObject({ available: 6, targetSlots: 3 });
    const legacy = { maxSlots: 4, tiers: [{ slots: 2, reputation: 0 }, { slots: 3, reputation: 10, requiresUnlockId: 'day-d4' }, { slots: 4, reputation: 30 }] };
    expect(campaignGrillUpgradeState({ claimedSlots: 2, reputation: 100 }, legacy)).toMatchObject({ pending: false, blockedBy: 'unlock' });
  });
  it.each([2, 3, 4, 5, 6])('%i칸의 음식 영역이 그릴 안에서 겹치지 않는다', count => {
    const slots = publicGrillLayout(count).slots;
    expect(slots).toHaveLength(count);
    expect(new Set(slots.map(slot => slot.key)).size).toBe(count);
    // 4~6칸은 공통 그릴의 550..1390 내부에서 좁아지는 새 레이아웃이다.
    if (count >= 4) {
      const rects = slots.map(slot => slot.approvedVisualRect);
      for (const rect of rects) {
        expect(rect.x).toBeGreaterThanOrEqual(550 / 1920);
        expect(rect.x + rect.width).toBeLessThanOrEqual(1390 / 1920);
      }
      for (let i = 1; i < rects.length; i++) expect(rects[i - 1].x + rects[i - 1].width).toBeLessThanOrEqual(rects[i].x);
    }
  });
});
