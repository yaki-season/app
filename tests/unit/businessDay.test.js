import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  simulateBusinessDay,
  buildConfigFromContent,
  deriveCookTimeSec,
  revenueFor,
  tipFor,
} from '../../src/state/businessDay.js';
import { SATISFACTION } from '../../src/state/customer/customer.js';

const root = new URL('../../', import.meta.url);
const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, root)), 'utf-8'));

// 실제 콘텐츠에서 config를 만든다 (데이터 구동 검증).
function contentBundle() {
  return {
    processes: [read('content/processes/grill.json')],
    days: [read('content/campaign/day-d1.json')],
    customers: read('content/customers/types.json'),
  };
}
const config = () => buildConfigFromContent(contentBundle(), { dayId: 'd1' });

describe('콘텐츠 구동 영업일 루프', () => {
  it('검증된 콘텐츠에서 config를 만든다', () => {
    const c = config();
    expect(c.customerCount).toBe(20);
    expect(c.spawnIntervalSec).toBe(12);
    // day-d1의 customerPool은 solo·office → 두 유형 순환
    expect(c.types.map((t) => t.id)).toEqual(['solo', 'office']);
    expect(c.cookTimeSec).toBeCloseTo(10.9, 1); // assembly 2 + 2*3.7 + eat 1.5
  });

  it('한 영업일이 손님 수만큼 처리되고 정산 지표를 낸다', () => {
    const r = simulateBusinessDay(config(), 1);
    expect(r.customers).toBe(20);
    expect(r.served + r.left).toBe(20);
    expect(r.good + r.low).toBe(r.served);
    expect(r.total).toBe(r.revenue + r.tip);
  });
});

describe('재현성', () => {
  it('같은 config·같은 시드는 같은 결과를 낸다', () => {
    const c = config();
    expect(simulateBusinessDay(c, 7)).toEqual(simulateBusinessDay(c, 7));
  });
});

describe('수치 영향', () => {
  it('인내심이 낮으면 이탈이 늘어난다', () => {
    const patient = { ...config(), types: [{ id: 'a', patienceSec: 90, tipMultiplier: 1 }] };
    const impatient = { ...config(), types: [{ id: 'a', patienceSec: 10, tipMultiplier: 1 }] };
    expect(simulateBusinessDay(impatient, 7).left).toBeGreaterThan(simulateBusinessDay(patient, 7).left);
  });

  it('조리 시간이 길면 주문당 시간과 이탈이 늘어난다', () => {
    const base = config();
    const slow = { ...base, cookTimeSec: base.cookTimeSec * 3 };
    expect(simulateBusinessDay(slow, 7).left).toBeGreaterThanOrEqual(simulateBusinessDay(base, 7).left);
  });

  it('적정 성공률이 1이면 과다(낮음 품질)가 없다', () => {
    const c = { ...config(), autoPolicySuccessRate: 1 };
    expect(simulateBusinessDay(c, 7).low).toBe(0);
  });
});

describe('역할 분리 (GPL-003)', () => {
  it('판매가는 품질에, 팁은 대기 잔량·유형에만 반영된다', () => {
    const economy = { basePrice: 100, qualityMultGood: 1.5, qualityMultLow: 1, tipBase: 20 };
    // 판매가: 품질에만
    expect(revenueFor(SATISFACTION.GOOD, economy)).toBe(150);
    expect(revenueFor(SATISFACTION.LOW, economy)).toBe(100);
    // 팁: 대기 잔량·유형에만 (품질 무관)
    const full = tipFor({ waitSec: 0, patienceSec: 30, tipMultiplier: 1, economy });
    const late = tipFor({ waitSec: 30, patienceSec: 30, tipMultiplier: 1, economy });
    expect(full).toBe(20);
    expect(late).toBe(0);
    expect(tipFor({ waitSec: 0, patienceSec: 30, tipMultiplier: 1.2, economy })).toBe(24);
  });

  it('판매가만 바꿔도 팁은 변하지 않는다', () => {
    const cheap = { ...config(), economy: { ...config().economy, basePrice: 50 } };
    const pricey = { ...config(), economy: { ...config().economy, basePrice: 300 } };
    const a = simulateBusinessDay(cheap, 7);
    const b = simulateBusinessDay(pricey, 7);
    expect(b.tip).toBe(a.tip);
    expect(b.revenue).toBeGreaterThan(a.revenue);
  });
});

describe('cook time 도출', () => {
  it('조립·양면·식사 시간을 합친다', () => {
    const t = deriveCookTimeSec({ thresholdsSec: { perfect: 2.5, over: 5.5 }, timingSec: { assembly: 2, eat: 1.5 } });
    expect(t).toBeCloseTo(10.9, 1);
  });
});
