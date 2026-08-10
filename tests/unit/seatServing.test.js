import { describe, expect, it } from 'vitest';
import { seatHasServedMenu, seatShareIndex } from '../../src/render/seatServing.js';

// D2 직장인 2인: 주문 하나(맥주 2 · 네기마 2)를 두 좌석이 함께 받는다.
function sharedOrderView(served) {
  return {
    seats: [
      { seatId: 'seat-02', orderId: 'D2-ORDER-002', occupied: true },
      { seatId: 'seat-03', orderId: 'D2-ORDER-002', occupied: true },
    ],
    orders: [{
      orderId: 'D2-ORDER-002',
      lines: [
        { menuId: 'beer', quantity: 2, served: served.beer ?? 0 },
        { menuId: 'negima', quantity: 2, served: served.negima ?? 0 },
      ],
    }],
  };
}

const seatOf = (view, seatId) => view.seats.find((seat) => seat.seatId === seatId);

describe('공유 주문 좌석 배분', () => {
  it('같은 주문을 공유하는 좌석에 순서를 매긴다', () => {
    const view = sharedOrderView({});
    expect(seatShareIndex(view.seats, seatOf(view, 'seat-02'))).toBe(0);
    expect(seatShareIndex(view.seats, seatOf(view, 'seat-03'))).toBe(1);
  });

  it('한 개만 냈으면 한 자리에만 놓인다', () => {
    const view = sharedOrderView({ negima: 1 });
    expect(seatHasServedMenu(view, seatOf(view, 'seat-02'), 'negima')).toBe(true);
    expect(seatHasServedMenu(view, seatOf(view, 'seat-03'), 'negima')).toBe(false);
  });

  it('두 개를 다 내면 두 자리 모두 놓인다', () => {
    const view = sharedOrderView({ negima: 2 });
    expect(seatHasServedMenu(view, seatOf(view, 'seat-02'), 'negima')).toBe(true);
    expect(seatHasServedMenu(view, seatOf(view, 'seat-03'), 'negima')).toBe(true);
  });

  it('메뉴별로 따로 센다', () => {
    const view = sharedOrderView({ negima: 2, beer: 1 });
    expect(seatHasServedMenu(view, seatOf(view, 'seat-03'), 'negima')).toBe(true);
    expect(seatHasServedMenu(view, seatOf(view, 'seat-03'), 'beer')).toBe(false);
  });

  it('혼자 앉은 손님(D1처럼 주문이 분리된 경우)은 그대로 하나만 보면 된다', () => {
    const view = {
      seats: [
        { seatId: 'seat-02', orderId: 'D1-ORDER-002-A' },
        { seatId: 'seat-03', orderId: 'D1-ORDER-002-B' },
      ],
      orders: [
        { orderId: 'D1-ORDER-002-A', lines: [{ menuId: 'negima', quantity: 1, served: 1 }] },
        { orderId: 'D1-ORDER-002-B', lines: [{ menuId: 'negima', quantity: 1, served: 0 }] },
      ],
    };
    expect(seatHasServedMenu(view, seatOf(view, 'seat-02'), 'negima')).toBe(true);
    expect(seatHasServedMenu(view, seatOf(view, 'seat-03'), 'negima')).toBe(false);
  });

  it('주문이 없는 빈 좌석은 아무것도 놓지 않는다', () => {
    const view = sharedOrderView({ negima: 2 });
    expect(seatHasServedMenu(view, { seatId: 'seat-06', orderId: null }, 'negima')).toBe(false);
  });
});
