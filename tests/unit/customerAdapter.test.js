// 손님 렌더 어댑터 순수 매핑 검증 (SCR-SVC-CUSTOMERS 렌더 인터페이스).
import { describe, it, expect } from 'vitest';
import { buildSeatStates } from '../../src/presentation/ui/customerAdapter.js';
import { SEAT_IDS } from '../../src/config/screenLayout.js';

describe('buildSeatStates', () => {
  it('점유가 없으면 6석이 모두 빈 상태다', () => {
    const states = buildSeatStates();
    expect(states).toHaveLength(SEAT_IDS.length);
    expect(states.every((s) => !s.occupied)).toBe(true);
    expect(states.every((s) => !s.serveTarget)).toBe(true);
  });

  it('점유 손님을 해당 좌석에 매핑한다', () => {
    const states = buildSeatStates([{ seatId: 'seat-03', mood: 'tasting', orderLabel: '네기마', waitRatio: 0.5 }]);
    const seat3 = states.find((s) => s.seatId === 'seat-03');
    expect(seat3.occupied).toBe(true);
    expect(seat3.mood).toBe('tasting');
    expect(seat3.orderLabel).toBe('네기마');
    expect(seat3.waitRatio).toBe(0.5);
    // 나머지는 여전히 빈 좌석
    expect(states.filter((s) => s.occupied)).toHaveLength(1);
  });

  it('serveReady는 점유 좌석에만 serveTarget을 켠다', () => {
    const occ = buildSeatStates([{ seatId: 'seat-02', orderLabel: '네기마' }], { serveReady: true });
    expect(occ.find((s) => s.seatId === 'seat-02').serveTarget).toBe(true);
    expect(occ.find((s) => s.seatId === 'seat-01').serveTarget).toBe(false); // 빈 좌석은 대상 아님
  });

  it('mood/waitRatio 기본값을 채운다', () => {
    const states = buildSeatStates([{ seatId: 'seat-01' }]);
    const s = states.find((x) => x.seatId === 'seat-01');
    expect(s.mood).toBe('waiting');
    expect(s.waitRatio).toBe(1);
  });
});
