// UI-005: 실제 좌석은 고정하고 사람의 선호만 결정적으로 달리한다.
function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function largestEmptyRun(seats, reservedIds) {
  let run = 0, largest = 0;
  for (const seat of seats) {
    run = seat.status === 'empty' && !reservedIds.has(seat.id) ? run + 1 : 0;
    largest = Math.max(largest, run);
  }
  return largest;
}

export function selectArrivalSeats(state, customers, { upcomingGroupSize = 0 } = {}) {
  const count = customers.length;
  if (!count || count > state.seats.length) return null;
  const candidates = [];
  for (let i = 0; i <= state.seats.length - count; i++) {
    const seats = state.seats.slice(i, i + count);
    if (seats.every(seat => seat.status === 'empty')) candidates.push(seats);
  }
  if (!candidates.length) return null;
  // D1의 첫 손님/첫 두 사람은 승인된 입문 구도를 유지한다.
  if (state.dayId === 'd1') return candidates[0];
  const identity = customers.map(customer => customer.id).join(':');
  // randomState는 추첨마다 바뀐다. 별도 초기값을 저장하고 구형 저장은 고정 runId를 쓴다.
  const score = seats => hash(`${state.seatingSeed ?? state.runId ?? 0}:${state.dayId}:${identity}:${seats[0].id}`);
  // 한 손님 때문에 기다리는 일행의 연속 자리가 없어지는 경우만 피한다.
  const preserving = upcomingGroupSize > 1 ? candidates.filter(seats => (
    largestEmptyRun(state.seats, new Set(seats.map(seat => seat.id))) >= upcomingGroupSize
  )) : candidates;
  return [...(preserving.length ? preserving : candidates)].sort((a, b) => score(b) - score(a))[0];
}
