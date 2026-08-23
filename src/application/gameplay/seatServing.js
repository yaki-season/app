// 좌석에 무엇이 놓여 있는지 판정한다.
//
// 동행 손님은 주문 하나를 함께 받는다(D2의 직장인 2인 = D2-ORDER-002 한 건, 4항목). 좌석마다 같은
// 주문을 보기 때문에 "이 주문에 하나라도 나갔나"로 판정하면, 한 개만 냈는데 두 자리에 다 음식이
// 놓여 둘 다 받은 것처럼 보인다. 같은 주문을 공유하는 좌석을 순서대로 세워, 자기 차례가 와야
// 자기 앞에 놓이게 한다.

export function seatShareIndex(seats, seat) {
  if (!seat?.orderId) return 0;
  const sharing = (seats ?? [])
    .filter((item) => item.orderId === seat.orderId)
    .map((item) => item.seatId)
    .sort();
  return Math.max(0, sharing.indexOf(seat.seatId));
}

export function seatHasServedMenu(view, seat, menuId) {
  const order = view?.orders?.find((item) => item.orderId === seat?.orderId);
  if (!order) return false;
  const share = seatShareIndex(view?.seats, seat);
  return order.lines.some((line) => line.menuId === menuId && line.served > share);
}
