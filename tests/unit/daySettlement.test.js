// 영업일 정산 계산 검증 (GPL-002/005, businessDay 공식 재사용).
import { describe, it, expect } from 'vitest';
import { settleDay } from '../../src/render/daySettlement.js';

const ECON = { basePrice: 100, qualityMultGood: 1.5, qualityMultLow: 1.0, tipBase: 20 };

describe('settleDay', () => {
  it('빈 기록은 0으로 집계한다', () => {
    const s = settleDay([], ECON);
    expect(s).toMatchObject({ visited: 0, served: 0, lost: 0, revenue: 0, tip: 0, total: 0, avgSatisfaction: 0 });
  });

  it('좋은 품질 서빙은 판매가 1.5배와 대기 잔량 팁을 준다', () => {
    // 대기 0초(방금 주문) → 팁 잔량 100% → tipBase*mult
    const s = settleDay([{ served: true, good: true, waitSec: 0, patienceSec: 60, tipMultiplier: 1 }], ECON);
    expect(s.served).toBe(1);
    expect(s.quality).toEqual({ good: 1, low: 0 });
    expect(s.revenue).toBe(150); // 100 * 1.5
    expect(s.tip).toBe(20); // 20 * 1 * (1 - 0/60)
    expect(s.total).toBe(170);
    expect(s.avgSatisfaction).toBe(100);
  });

  it('낮은 품질은 판매가 1.0배, 대기가 길수록 팁이 준다', () => {
    const s = settleDay([{ served: true, good: false, waitSec: 30, patienceSec: 60, tipMultiplier: 1 }], ECON);
    expect(s.revenue).toBe(100);
    expect(s.tip).toBe(10); // 20 * (1 - 30/60)
    expect(s.avgSatisfaction).toBe(40);
  });

  it('이탈 손님은 방문에만 포함되고 매출·팁이 없다', () => {
    const s = settleDay([
      { served: true, good: true, waitSec: 0, patienceSec: 60, tipMultiplier: 1 },
      { served: false, tipMultiplier: 1 },
    ], ECON);
    expect(s.visited).toBe(2);
    expect(s.served).toBe(1);
    expect(s.lost).toBe(1);
    expect(s.total).toBe(170);
  });

  it('팁 배수(유형)를 반영한다', () => {
    const s = settleDay([{ served: true, good: true, waitSec: 0, patienceSec: 60, tipMultiplier: 1.2 }], ECON);
    expect(s.tip).toBe(24); // 20 * 1.2
  });
});
