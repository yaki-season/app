// 손님 렌더 어댑터 순수 매핑 검증 (SCR-SVC-CUSTOMERS 렌더 인터페이스).
import { describe, it, expect } from 'vitest';
import {
  buildOrderBubblePresentations,
  buildSeatStates,
} from '../../src/render/customerAdapter.js';
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

describe('buildOrderBubblePresentations', () => {
  const groupSeat = (overrides) => ({
    occupied: true,
    phase: 'ordering',
    mood: 'waiting',
    waitRatio: 1,
    urgent: false,
    group: true,
    groupId: 'GROUP-OFFICE',
    canOrder: true,
    remainingItems: [],
    ...overrides,
  });

  it('개별 주문을 가진 두 그룹 손님의 주문을 한 장으로 합산한다', () => {
    const presentations = buildOrderBubblePresentations([
      groupSeat({
        seatId: 'seat-02',
        orderId: 'ORDER-A',
        remainingItems: [
          { menuId: 'beer', seasoning: null, menuLabel: '생맥주', remaining: 1 },
          { menuId: 'negima', seasoning: 'salt', menuLabel: '소금 네기마', remaining: 1 },
        ],
      }),
      groupSeat({
        seatId: 'seat-03',
        orderId: 'ORDER-B',
        remainingItems: [
          { menuId: 'beer', seasoning: null, menuLabel: '생맥주', remaining: 1 },
          { menuId: 'cabbage-salad', seasoning: null, menuLabel: '양배추 사라다', remaining: 1 },
        ],
      }),
    ]);

    expect(presentations).toHaveLength(1);
    expect(presentations[0]).toMatchObject({
      groupId: 'GROUP-OFFICE',
      memberSeatIds: ['seat-02', 'seat-03'],
      orderLabel: '생맥주 ×2 · 소금 네기마 · 양배추 사라다',
    });
  });

  it('공유 orderId는 그룹 합산에서 한 번만 센다', () => {
    const sharedOrder = {
      orderId: 'ORDER-SHARED',
      remainingItems: [
        { menuId: 'beer', seasoning: null, menuLabel: '생맥주', remaining: 2 },
        { menuId: 'negima', seasoning: 'salt', menuLabel: '소금 네기마', remaining: 2 },
      ],
    };
    const [presentation] = buildOrderBubblePresentations([
      groupSeat({ seatId: 'seat-02', ...sharedOrder }),
      groupSeat({ seatId: 'seat-03', ...sharedOrder }),
    ]);

    expect(presentation.orderLabel).toBe('생맥주 ×2 · 소금 네기마 ×2');
  });
});
