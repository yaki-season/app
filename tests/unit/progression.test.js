// 성장·구매 순수 로직 검증 (GPL-005).
import { describe, it, expect } from 'vitest';
import { reputationDelta, itemState, catalog, buy, effectiveEconomy, ownedEffects } from '../../src/render/progression.js';

const UPGRADES = [
  { id: 'ingredient-chicken-t2', active: true, category: 'ingredient', costGold: 1000, reputationReq: 1, requiresUpgradeId: null, effect: { kind: 'basePriceMult', value: 1.1 } },
  { id: 'interior-seats-8', active: true, category: 'interior', costGold: 2000, reputationReq: 3, requiresUpgradeId: null, effect: { kind: 'seatCap', value: 8 } },
  { id: 'interior-seats-12', active: true, category: 'interior', costGold: 4000, reputationReq: 5, requiresUpgradeId: 'interior-seats-8', effect: { kind: 'seatCap', value: 12 } },
];
const wallet = (gold, reputation, owned = []) => ({ gold, reputation, owned: new Set(owned) });

describe('reputationDelta', () => {
  it('좋음 서빙 +3, 낮음 0, 화난 이탈 -1', () => {
    expect(reputationDelta([{ served: true, good: true }, { served: true, good: false }, { served: false }])).toBe(2);
  });
});

describe('itemState', () => {
  const it0 = UPGRADES[0];
  it('골드·명성 충분하면 구매 가능', () => {
    expect(itemState(it0, wallet(1000, 1))).toBe('buyable');
  });
  it('명성 부족은 locked-rep', () => {
    expect(itemState(it0, wallet(1000, 0))).toBe('locked-rep');
  });
  it('골드 부족은 unaffordable', () => {
    expect(itemState(it0, wallet(900, 5))).toBe('unaffordable');
  });
  it('보유 중이면 owned', () => {
    expect(itemState(it0, wallet(9999, 9, ['ingredient-chicken-t2']))).toBe('owned');
  });
  it('선행 미보유면 locked-prereq', () => {
    expect(itemState(UPGRADES[2], wallet(9999, 9))).toBe('locked-prereq');
  });
  it('선행 보유 후 구매 가능', () => {
    expect(itemState(UPGRADES[2], wallet(9999, 9, ['interior-seats-8']))).toBe('buyable');
  });
});

describe('buy', () => {
  it('구매 가능하면 골드를 차감한다', () => {
    const r = buy(UPGRADES[0], wallet(1200, 2));
    expect(r).toEqual({ ok: true, gold: 200, ownedAdd: 'ingredient-chicken-t2' });
  });
  it('불가하면 이유를 반환한다', () => {
    expect(buy(UPGRADES[0], wallet(100, 2))).toEqual({ ok: false, reason: 'unaffordable' });
  });
});

describe('effectiveEconomy / ownedEffects', () => {
  const base = { basePrice: 100, qualityMultGood: 1.5, qualityMultLow: 1.0, tipBase: 20 };
  it('basePriceMult 소유 시 판매가가 오른다', () => {
    expect(effectiveEconomy(base, [UPGRADES[0]]).basePrice).toBe(110);
  });
  it('효과 요약을 집계한다', () => {
    const s = ownedEffects([UPGRADES[0], UPGRADES[1]]);
    expect(s.basePriceMult).toBeCloseTo(1.1, 5);
    expect(s.seatCap).toBe(8);
  });
});

describe('catalog', () => {
  it('각 아이템에 상태를 붙인다', () => {
    const c = catalog(UPGRADES, wallet(1000, 1));
    expect(c.find((x) => x.id === 'ingredient-chicken-t2').state).toBe('buyable');
    expect(c.find((x) => x.id === 'interior-seats-8').state).toBe('locked-rep'); // 명성 1<3
  });
});
