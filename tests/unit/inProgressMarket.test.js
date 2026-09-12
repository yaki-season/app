import { describe, expect, it } from 'vitest';
import { hasInProgressBusiness } from '../../src/d1/firstOrderRuntimeStorage.js';
const campaign = { meta: { campaignId: 'a' }, campaign: { dayId: 'd4' } };
const saved = { stateVersion: 1, business: { dayId: 'd4', runId: 'a:d4', phase: 'open', clock: { elapsedMs: 100 } } };
const storage = value => ({ getItem: () => JSON.stringify(value) });
describe('뒤로가기 마켓의 영업 중 설비 잠금', () => {
  it('현재 회차의 실제 진행이 있으면 설치를 잠근다', () => {
    expect(hasInProgressBusiness(storage(saved), campaign)).toBe(true);
  });
  it.each([{ dayId: 'd3' }, { runId: 'other:d4' }, { phase: 'complete' }, { clock: {} }])('다른/완료/손상 회차는 새 영업 준비를 막지 않는다: %j', fields => {
    expect(hasInProgressBusiness(storage({ ...saved, business: { ...saved.business, ...fields } }), campaign)).toBe(false);
  });
  it('미존재·구형·깨진 저장을 새 주문으로 꾸며 내지 않는다', () => {
    expect(hasInProgressBusiness(storage(null), campaign)).toBe(false);
    expect(hasInProgressBusiness(storage({ stateVersion: 1 }), campaign)).toBe(false);
    expect(hasInProgressBusiness({ getItem: () => '{' }, campaign)).toBe(false);
  });
});
