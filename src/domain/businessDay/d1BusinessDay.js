export const D1_DAY_PHASE = Object.freeze({
  OPEN: 'open',
  CLOSING_DRAIN: 'closing-drain',
  CHARCOAL_DOWN: 'charcoal-down',
  SETTLEMENT: 'settlement',
  COMPLETE: 'complete',
});

export const D1_CUSTOMER_PHASE = Object.freeze({
  THINKING: 'thinking',
  ORDER_READY: 'order-ready',
  WAITING: 'waiting',
  RECEIVED_WAITING_GROUP: 'received-waiting-group',
  EATING: 'eating',
  MEAL_COMPLETE: 'meal-complete',
  LEAVING: 'leaving',
  CLEANUP: 'cleanup',
  DONE: 'done',
});

export const D1_ORDER_STATUS = Object.freeze({
  UNACCEPTED: 'unaccepted',
  ACCEPTED: 'accepted',
  PARTIAL: 'partial',
  GROUP_PENDING: 'group-pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ABANDONED: 'abandoned',
});

export const D1_QUALITY = Object.freeze({
  PERFECT: 'Perfect',
  GOOD: 'Good',
  OK: 'OK',
  FAIL: 'Fail',
});

export const D1_SETTLEMENT_STEPS = Object.freeze([
  'customers-orders',
  'quality-wait',
  'revenue-tip',
  'reputation-review',
  'recipe-goal',
]);

export const BUSINESS_DAY_ARRIVAL_POLICY = Object.freeze({
  maxAllSeatsEmptyWaitSec: 13,
  autoCloseAfterFinalCustomer: true,
});

const TERMINAL_ORDER_STATUS = new Set([
  D1_ORDER_STATUS.COMPLETED,
  D1_ORDER_STATUS.FAILED,
  D1_ORDER_STATUS.ABANDONED,
]);
const QUALITY_SCORE = Object.freeze({
  [D1_QUALITY.PERFECT]: 100,
  [D1_QUALITY.GOOD]: 40,
  [D1_QUALITY.OK]: 10,
  [D1_QUALITY.FAIL]: 0,
});
const QUALITY_RATE = Object.freeze({
  [D1_QUALITY.PERFECT]: 1,
  [D1_QUALITY.GOOD]: 0.7,
  [D1_QUALITY.OK]: 0.4,
  [D1_QUALITY.FAIL]: 0.1,
});

const clone = (value) => structuredClone(value);

function assertFinite(value, field, { min = 0 } = {}) {
  if (!Number.isFinite(value) || value < min) {
    throw new TypeError(`${field}는 ${min} 이상의 유한한 숫자여야 합니다.`);
  }
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${field} 문자열이 필요합니다.`);
  }
}

export function createBusinessDayDefinition(record, {
  expectedId = null,
  requireD1BusinessPolicy = false,
} = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('D1 영업일 정의 객체가 필요합니다.');
  }
  const definition = clone(record);
  assertString(definition.id, 'id');
  if (expectedId !== null && definition.id !== expectedId) {
    throw new TypeError(`영업일 정의 id는 ${expectedId}이어야 합니다.`);
  }
  if (!Array.isArray(definition.seatIds) || definition.seatIds.length === 0) {
    throw new TypeError('D1 좌석 ID가 필요합니다.');
  }
  if (new Set(definition.seatIds).size !== definition.seatIds.length) {
    throw new TypeError('D1 좌석 ID가 중복됐습니다.');
  }
  definition.seatIds.forEach((id, index) => assertString(id, `seatIds[${index}]`));
  assertFinite(definition.sessionTargetMs, 'sessionTargetMs', { min: 1 });
  if (definition.sessionTargetMs > 480_000) {
    throw new TypeError('D1 목표 세션은 8분을 넘을 수 없습니다.');
  }
  const businessWindow = definition.businessWindow;
  if (businessWindow) {
    assertFinite(businessWindow.startMinute, 'businessWindow.startMinute');
    assertFinite(businessWindow.endMinute, 'businessWindow.endMinute', { min: 1 });
    if (businessWindow.endMinute <= businessWindow.startMinute) {
      throw new TypeError('영업 종료 시각은 시작 시각보다 뒤여야 합니다.');
    }
  }
  const arrivalPolicy = definition.arrivalPolicy;
  if (
    arrivalPolicy?.maxAllSeatsEmptyWaitSec !== BUSINESS_DAY_ARRIVAL_POLICY.maxAllSeatsEmptyWaitSec
    || arrivalPolicy?.autoCloseAfterFinalCustomer !== BUSINESS_DAY_ARRIVAL_POLICY.autoCloseAfterFinalCustomer
  ) {
    throw new TypeError('모든 영업일은 빈 가게 13초 이내 입장·마지막 손님 자동 마감 정책이 필요합니다.');
  }
  if (requireD1BusinessPolicy && (
    businessWindow?.startMinute !== 1050
    || businessWindow?.endMinute !== 1590
    || businessWindow?.spansMidnight !== true
  )) {
    throw new TypeError('D1은 17:30~02:30 영업창이 필요합니다.');
  }

  const timing = definition.timingMs ?? {};
  for (const field of ['thinkMin', 'thinkMax', 'eat', 'leave', 'cleanup', 'waitRecovery']) {
    assertFinite(timing[field], `timingMs.${field}`);
  }
  if (timing.thinkMax < timing.thinkMin) {
    throw new TypeError('주문 고민 최대 시간은 최소 시간보다 짧을 수 없습니다.');
  }
  if (timing.cleanup !== 3_000) {
    throw new TypeError('D1 좌석 정리 시간은 3000ms여야 합니다.');
  }

  const limits = definition.limits ?? {};
  for (const field of ['maxActiveOrders', 'maxRiskProcesses']) {
    if (!Number.isInteger(limits[field]) || limits[field] < 1) {
      throw new TypeError(`limits.${field}는 1 이상의 정수여야 합니다.`);
    }
  }

  const economy = definition.economy ?? {};
  assertFinite(economy.baseTip, 'economy.baseTip');
  for (const [menuId, price] of Object.entries(economy.menuPrices ?? {})) {
    assertString(menuId, 'economy.menuPrices key');
    assertFinite(price, `economy.menuPrices.${menuId}`);
  }
  if (Object.keys(economy.menuPrices ?? {}).length === 0) {
    throw new TypeError('D1 메뉴 기본 판매가가 필요합니다.');
  }
  const menuPolicies = definition.menuPolicies ?? {};
  for (const [menuId, policy] of Object.entries(menuPolicies)) {
    if (!(menuId in economy.menuPrices)) {
      throw new TypeError(`메뉴 정책에 대응하는 가격이 없습니다: ${menuId}`);
    }
    if (!['graded', 'none'].includes(policy?.qualityMode ?? 'graded')) {
      throw new TypeError(`지원하지 않는 품질 정책입니다: ${menuId}`);
    }
    assertFinite(policy?.satisfactionWeight ?? 1, `menuPolicies.${menuId}.satisfactionWeight`);
    assertFinite(policy?.waitRecoveryMs ?? timing.waitRecovery, `menuPolicies.${menuId}.waitRecoveryMs`);
    if (policy?.saleLedger != null && typeof policy.saleLedger !== 'boolean') {
      throw new TypeError(`menuPolicies.${menuId}.saleLedger는 boolean이어야 합니다.`);
    }
  }

  if (!Array.isArray(definition.waves) || definition.waves.length === 0) {
    throw new TypeError('D1 손님 파동이 필요합니다.');
  }
  const waveIds = new Set();
  const customerIds = new Set();
  const orderIds = new Map();
  for (const wave of definition.waves) {
    assertString(wave.id, 'wave.id');
    if (waveIds.has(wave.id)) throw new TypeError(`중복 wave id입니다: ${wave.id}`);
    waveIds.add(wave.id);
    assertFinite(wave.atMs, `${wave.id}.atMs`);
    if (wave.atMs >= definition.sessionTargetMs) {
      throw new TypeError(`마감 뒤에 예약된 파동입니다: ${wave.id}`);
    }
    if (!Array.isArray(wave.customers) || wave.customers.length === 0) {
      throw new TypeError(`${wave.id} 손님이 필요합니다.`);
    }
    for (const customer of wave.customers) {
      assertString(customer.id, `${wave.id}.customer.id`);
      if (customerIds.has(customer.id)) throw new TypeError(`중복 customer id입니다: ${customer.id}`);
      customerIds.add(customer.id);
      assertFinite(customer.patienceMs, `${customer.id}.patienceMs`, { min: 1 });
      assertString(customer.order?.id, `${customer.id}.order.id`);
      const priorOrder = orderIds.get(customer.order.id);
      if (priorOrder) {
        const sharedByGroup = customer.groupId && customer.groupId === priorOrder.groupId;
        const sameLines = JSON.stringify(customer.order.lines) === JSON.stringify(priorOrder.order.lines);
        if (!sharedByGroup || !sameLines) throw new TypeError(`잘못된 공유 order id입니다: ${customer.order.id}`);
      } else {
        orderIds.set(customer.order.id, { groupId: customer.groupId ?? null, order: customer.order });
      }
      if (!Array.isArray(customer.order.lines) || customer.order.lines.length === 0) {
        throw new TypeError(`${customer.order.id} 주문 항목이 필요합니다.`);
      }
      for (const line of customer.order.lines) {
        assertString(line.menuId, `${customer.order.id}.menuId`);
        if (!Number.isInteger(line.quantity) || line.quantity < 1) {
          throw new TypeError(`${customer.order.id} 수량은 1 이상의 정수여야 합니다.`);
        }
        if (!(line.menuId in economy.menuPrices)) {
          throw new TypeError(`${customer.order.id} 메뉴 가격이 없습니다: ${line.menuId}`);
        }
      }
      if (customer.order.lines.every((line) => economy.menuPrices[line.menuId] === 0)) {
        throw new TypeError(`${customer.order.id} 무료 메뉴는 단독 주문할 수 없습니다.`);
      }
    }
  }

  const first = definition.waves[0]?.customers[0];
  if (requireD1BusinessPolicy && (
    first?.id !== 'REGULAR_TSUKIOKA'
    || first.order?.id !== 'D1-ORDER-001'
    || first.order.lines?.[0]?.menuId !== 'beer'
    || first.order.lines?.[0]?.quantity !== 1
    || first.order.lines?.[1]?.menuId !== 'negima'
    || first.order.lines?.[1]?.quantity !== 2
  )) {
    throw new TypeError('D1 첫 주문은 츠키오카의 생맥주 1잔→네기마 2개여야 합니다.');
  }
  for (const wave of definition.waves) {
    for (const requiredId of wave.requiresOrderCompletionIds ?? []) {
      if (!orderIds.has(requiredId)) {
        throw new TypeError(`${wave.id} 선행 주문이 없습니다: ${requiredId}`);
      }
    }
  }
  return Object.freeze(definition);
}

export function createD1BusinessDayDefinition(record) {
  return createBusinessDayDefinition(record, {
    expectedId: 'd1',
    requireD1BusinessPolicy: true,
  });
}

function nextRandom(state) {
  state.randomState = (Math.imul(1664525, state.randomState) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}

function randomThinkMs(state, definition) {
  const { thinkMin, thinkMax } = definition.timingMs;
  return Math.round(thinkMin + nextRandom(state) * (thinkMax - thinkMin));
}

function makeSeat(id) {
  return {
    id,
    status: 'empty',
    customerId: null,
    cleanup: { active: false, progressMs: 0, completionId: null },
  };
}

export function createD1BusinessDayState({ definition, runId, seed = 1 }) {
  assertString(runId, 'runId');
  if (!Number.isInteger(seed) || seed < 0) throw new TypeError('seed는 0 이상의 정수여야 합니다.');
  const state = {
    stateVersion: 1,
    dayId: definition.id,
    runId,
    phase: D1_DAY_PHASE.OPEN,
    randomState: seed >>> 0,
    clock: {
      elapsedMs: 0,
      targetMs: definition.sessionTargetMs,
      gameMinute: definition.businessWindow?.startMinute ?? (17 * 60 + 30),
      paused: false,
      arrivalsClosed: false,
      // 다음 입장을 기다리기 시작한 시각. 자리가 비면(정리 완료·전원 퇴장) 켜지고, 실제 입장에
      // 다시 null이 된다. maxAllSeatsEmptyWaitSec만큼 지나면 예정 시각보다 먼저 손님이 온다.
      allSeatsEmptySinceMs: null,
    },
    limits: {
      riskProcessCount: 0,
      peakRiskProcesses: 0,
      peakActiveOrders: 0,
    },
    waves: definition.waves.map((wave) => ({ id: wave.id, status: 'pending' })),
    seats: definition.seatIds.map(makeSeat),
    customers: {},
    orders: {},
    ledger: [],
    handledEventIds: [],
    failureCauseIds: [],
    metrics: {
      visitedCustomers: 0,
      acceptedOrders: 0,
      completedOrders: 0,
      abandonedOrders: 0,
      lostCustomers: 0,
      servedItems: 0,
      waitSampleTotalMs: 0,
      cleanedSeats: 0,
      disposedPreparedItems: 0,
      quality: { Perfect: 0, Good: 0, OK: 0, Fail: 0 },
    },
    settlement: {
      completionId: `${runId}:complete`,
      summary: null,
      revealedSteps: [],
      ready: false,
    },
  };
  spawnEligibleWaves(state, definition);
  return state;
}

function operationalOrderCount(state) {
  return Object.values(state.orders).filter((order) => !TERMINAL_ORDER_STATUS.has(order.status)).length;
}

function acceptedOrderCount(state) {
  return Object.values(state.orders).filter((order) => [
    D1_ORDER_STATUS.ACCEPTED,
    D1_ORDER_STATUS.PARTIAL,
  ].includes(order.status)).length;
}

function findSingleSeat(state, excludedIds = new Set()) {
  return state.seats.find((seat) => seat.status === 'empty' && !excludedIds.has(seat.id)) ?? null;
}

function findAdjacentSeats(state, count) {
  for (let index = 0; index <= state.seats.length - count; index += 1) {
    const candidate = state.seats.slice(index, index + count);
    if (candidate.every((seat) => seat.status === 'empty')) return candidate;
  }
  return null;
}

function orderIsComplete(state, orderId) {
  return state.orders[orderId]?.status === D1_ORDER_STATUS.COMPLETED;
}

function spawnCustomer(state, definition, customerSpec, seat, waveId) {
  const groupId = customerSpec.groupId ?? null;
  const existingOrder = state.orders[customerSpec.order.id];
  const order = existingOrder ?? {
    id: customerSpec.order.id,
    customerId: customerSpec.id,
    customerIds: [],
    groupId,
    waveId,
    status: D1_ORDER_STATUS.UNACCEPTED,
    lines: customerSpec.order.lines.map((line, index) => ({
      id: `${customerSpec.order.id}:line:${index + 1}`,
      menuId: line.menuId,
      seasoning: line.seasoning ?? null,
      quantity: line.quantity,
      servedQualities: [],
    })),
    acceptedAtMs: null,
    completedAtMs: null,
    satisfaction: null,
    rewardsApplied: false,
  };
  order.customerIds.push(customerSpec.id);
  if (!existingOrder) state.orders[order.id] = order;
  state.customers[customerSpec.id] = {
    id: customerSpec.id,
    typeId: customerSpec.typeId,
    groupId,
    seatId: seat.id,
    orderId: order.id,
    phase: D1_CUSTOMER_PHASE.THINKING,
    phaseRemainingMs: randomThinkMs(state, definition),
    patienceMs: customerSpec.patienceMs,
    waitRemainingMs: null,
    departureCause: null,
  };
  seat.status = 'occupied';
  seat.customerId = customerSpec.id;
  state.metrics.visitedCustomers += 1;
}

// 첫 손님은 좌석 액터가 아니라 화면 가운데를 차지하는 전용 구도로 그려진다(D1의 츠키오카).
// 그 사람이 자리에 있는 동안 다음 손님을 들이면 두 그림이 겹쳐 보인다. 자리가 정리될 때까지
// 기다린다. 엑스트라끼리는 좌석 좌표를 쓰므로 이 제한을 받지 않는다.
// 자리에서 일어난 뒤(meal-complete 이후)에는 그림이 사라지므로 정리를 기다릴 필요는 없다.
const SEATED_VISIBLE_PHASES = new Set([
  D1_CUSTOMER_PHASE.THINKING,
  D1_CUSTOMER_PHASE.ORDER_READY,
  D1_CUSTOMER_PHASE.WAITING,
  D1_CUSTOMER_PHASE.RECEIVED_WAITING_GROUP,
  D1_CUSTOMER_PHASE.EATING,
]);

function firstWaveStillSeated(state, definition) {
  return (definition.waves[0]?.customers ?? []).some((customer) => (
    SEATED_VISIBLE_PHASES.has(state.customers[customer.id]?.phase)
  ));
}

function spawnEligibleWaves(state, definition) {
  if (state.clock.arrivalsClosed || state.phase !== D1_DAY_PHASE.OPEN) return;
  if (firstWaveStillSeated(state, definition)) return;
  for (let index = 0; index < definition.waves.length; index += 1) {
    const waveSpec = definition.waves[index];
    const waveState = state.waves[index];
    if (waveState.status !== 'pending') continue;
    const emptyWaitLimitMs = definition.arrivalPolicy.maxAllSeatsEmptyWaitSec * 1000;
    const emptyDeadlineMs = state.clock.allSeatsEmptySinceMs != null && Number.isFinite(emptyWaitLimitMs)
      ? state.clock.allSeatsEmptySinceMs + emptyWaitLimitMs
      : Number.POSITIVE_INFINITY;
    if (state.clock.elapsedMs < Math.min(waveSpec.atMs, emptyDeadlineMs)) break;
    if (!(waveSpec.requiresOrderCompletionIds ?? []).every((id) => orderIsComplete(state, id))) break;
    const arrivingOrderCount = new Set(waveSpec.customers.map((customer) => customer.order.id)).size;
    if (operationalOrderCount(state) + arrivingOrderCount > definition.limits.maxActiveOrders) break;

    const grouped = waveSpec.customers.length > 1
      && waveSpec.customers.every((customer) => customer.groupId === waveSpec.customers[0].groupId)
      && waveSpec.customers[0].groupId;
    let seats;
    if (grouped) {
      seats = findAdjacentSeats(state, waveSpec.customers.length);
    } else {
      const reserved = new Set();
      seats = waveSpec.customers.map(() => {
        const seat = findSingleSeat(state, reserved);
        if (seat) reserved.add(seat.id);
        return seat;
      });
    }
    if (!seats || seats.some((seat) => seat === null)) break;
    waveSpec.customers.forEach((customer, customerIndex) => {
      spawnCustomer(state, definition, customer, seats[customerIndex], waveSpec.id);
    });
    waveState.status = 'spawned';
    state.clock.allSeatsEmptySinceMs = null;
    state.limits.peakActiveOrders = Math.max(state.limits.peakActiveOrders, operationalOrderCount(state));
  }
}

function ledgerEntry(state, entry) {
  if (!state.ledger.some((item) => item.id === entry.id)) state.ledger.push(entry);
}

function salePrice(definition, menuId, quality) {
  const calculated = Math.floor(definition.economy.menuPrices[menuId] * QUALITY_RATE[quality]);
  return quality === D1_QUALITY.FAIL ? Math.max(1, calculated) : calculated;
}

function menuPolicy(definition, menuId) {
  const configured = definition.menuPolicies?.[menuId] ?? {};
  return {
    qualityMode: configured.qualityMode ?? 'graded',
    satisfactionWeight: configured.satisfactionWeight ?? 1,
    saleLedger: configured.saleLedger ?? true,
    waitRecoveryMs: configured.waitRecoveryMs ?? definition.timingMs.waitRecovery,
  };
}

function seasoningMatches(line, seasoning) {
  // 이전 D1~D3 port는 양념 필드를 보내지 않았다. null은 호환용 wildcard로 두고,
  // D4 prepared item처럼 값이 명시된 경우에만 타레/기본을 엄격히 구분한다.
  if (seasoning == null) return true;
  if (line.seasoning === 'tare') return seasoning === 'tare';
  return seasoning !== 'tare';
}

function remainingForMenu(order, menuId, seasoning = null) {
  return order.lines
    .filter((line) => line.menuId === menuId && seasoningMatches(line, seasoning))
    .reduce((sum, line) => sum + line.quantity - line.servedQualities.length, 0);
}

function orderQualitySamples(order, definition) {
  return order.lines.flatMap((line) => {
    const policy = menuPolicy(definition, line.menuId);
    if (policy.qualityMode === 'none' || policy.satisfactionWeight === 0) return [];
    return line.servedQualities
      .filter((quality) => quality != null)
      .map((quality) => ({ quality, weight: policy.satisfactionWeight }));
  });
}

function rewardCompletedOrder(state, definition, order) {
  if (order.rewardsApplied) return;
  order.rewardsApplied = true;
  ledgerEntry(state, {
    id: `tip:${order.id}`,
    type: 'tip',
    amount: definition.economy.baseTip,
    orderId: order.id,
  });
  const reputation = order.satisfaction === 100 ? 3 : order.satisfaction >= 80 ? 1 : 0;
  if (reputation !== 0) {
    ledgerEntry(state, {
      id: `reputation:success:${order.id}`,
      type: 'reputation',
      amount: reputation,
      orderId: order.id,
    });
  }
  state.metrics.completedOrders += 1;
}

function startEating(state, definition, customer, order) {
  order.status = D1_ORDER_STATUS.COMPLETED;
  rewardCompletedOrder(state, definition, order);
  customer.phase = D1_CUSTOMER_PHASE.EATING;
  customer.phaseRemainingMs = definition.timingMs.eat;
  customer.waitRemainingMs = null;
}

function finalizeGroupIfReady(state, definition, groupId) {
  if (!groupId) return;
  const members = Object.values(state.customers).filter((customer) => customer.groupId === groupId);
  const orders = members.map((customer) => state.orders[customer.orderId]);
  if (!orders.length || !orders.every((order) => order.status === D1_ORDER_STATUS.GROUP_PENDING)) return;
  members.forEach((customer, index) => startEating(state, definition, customer, orders[index]));
}

function completeReceivedOrder(state, definition, customer, order) {
  const samples = orderQualitySamples(order, definition);
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
  order.satisfaction = totalWeight > 0
    ? Math.floor(samples.reduce(
      (sum, sample) => sum + QUALITY_SCORE[sample.quality] * sample.weight,
      0,
    ) / totalWeight)
    : 100;
  order.completedAtMs = state.clock.elapsedMs;
  if ((order.customerIds?.length ?? 1) > 1) {
    order.status = D1_ORDER_STATUS.COMPLETED;
    rewardCompletedOrder(state, definition, order);
    for (const customerId of order.customerIds) {
      const member = state.customers[customerId];
      member.phase = D1_CUSTOMER_PHASE.EATING;
      member.phaseRemainingMs = definition.timingMs.eat;
      member.waitRemainingMs = null;
    }
    return;
  }
  if (customer.groupId) {
    order.status = D1_ORDER_STATUS.GROUP_PENDING;
    customer.phase = D1_CUSTOMER_PHASE.RECEIVED_WAITING_GROUP;
    customer.waitRemainingMs = null;
    finalizeGroupIfReady(state, definition, customer.groupId);
    return;
  }
  startEating(state, definition, customer, order);
}

function groupMembers(state, customer) {
  if (!customer.groupId) return [customer];
  return Object.values(state.customers).filter((item) => item.groupId === customer.groupId);
}

function failCustomers(state, definition, customer, cause) {
  const causeId = customer.groupId ? `${cause}:${customer.groupId}` : `${cause}:${customer.id}`;
  if (state.failureCauseIds.includes(causeId)) return;
  state.failureCauseIds.push(causeId);
  for (const member of groupMembers(state, customer)) {
    if ([D1_CUSTOMER_PHASE.LEAVING, D1_CUSTOMER_PHASE.CLEANUP, D1_CUSTOMER_PHASE.DONE].includes(member.phase)) continue;
    const order = state.orders[member.orderId];
    if (!TERMINAL_ORDER_STATUS.has(order.status)) {
      order.status = cause === 'fail-quality' ? D1_ORDER_STATUS.FAILED : D1_ORDER_STATUS.ABANDONED;
      state.metrics.abandonedOrders += 1;
    }
    member.phase = D1_CUSTOMER_PHASE.LEAVING;
    member.phaseRemainingMs = definition.timingMs.leave;
    member.waitRemainingMs = null;
    member.departureCause = cause;
    state.metrics.lostCustomers += 1;
  }
  ledgerEntry(state, {
    id: `reputation:failure:${causeId}`,
    type: 'reputation',
    amount: -1,
    causeId,
  });
}

function syncMealDepartures(state, definition) {
  const groups = new Set(
    Object.values(state.customers).map((customer) => customer.groupId).filter(Boolean),
  );
  for (const groupId of groups) {
    const members = Object.values(state.customers).filter((customer) => customer.groupId === groupId);
    if (members.every((customer) => customer.phase === D1_CUSTOMER_PHASE.MEAL_COMPLETE)) {
      for (const member of members) {
        member.phase = D1_CUSTOMER_PHASE.LEAVING;
        member.phaseRemainingMs = definition.timingMs.leave;
      }
    }
  }
  for (const customer of Object.values(state.customers)) {
    if (!customer.groupId && customer.phase === D1_CUSTOMER_PHASE.MEAL_COMPLETE) {
      customer.phase = D1_CUSTOMER_PHASE.LEAVING;
      customer.phaseRemainingMs = definition.timingMs.leave;
    }
  }
}

function completeCleanup(state, seat) {
  const customer = state.customers[seat.customerId];
  if (customer) customer.phase = D1_CUSTOMER_PHASE.DONE;
  seat.status = 'empty';
  seat.customerId = null;
  seat.cleanup.active = false;
  seat.cleanup.progressMs = 0;
  seat.cleanup.completionId = `cleanup:${customer?.id ?? seat.id}`;
  state.metrics.cleanedSeats += 1;
  trackAllTablesVacated(state);
}

function trackAllTablesVacated(state) {
  const hasSeatedCustomer = state.seats.some((seat) => seat.status === 'occupied');
  if (
    !hasSeatedCustomer
    && state.waves.some((wave) => wave.status === 'pending')
    && state.clock.allSeatsEmptySinceMs == null
  ) {
    state.clock.allSeatsEmptySinceMs = state.clock.elapsedMs;
  }
}

function progressTimers(state, definition, deltaMs) {
  const expired = [];
  for (const customer of Object.values(state.customers)) {
    if (customer.phase === D1_CUSTOMER_PHASE.THINKING) {
      customer.phaseRemainingMs -= deltaMs;
      if (customer.phaseRemainingMs <= 0) {
        customer.phase = D1_CUSTOMER_PHASE.ORDER_READY;
        customer.phaseRemainingMs = 0;
      }
    } else if (customer.phase === D1_CUSTOMER_PHASE.WAITING) {
      customer.waitRemainingMs -= deltaMs;
      if (customer.waitRemainingMs <= 0) expired.push(customer);
    } else if (customer.phase === D1_CUSTOMER_PHASE.EATING) {
      customer.phaseRemainingMs -= deltaMs;
      if (customer.phaseRemainingMs <= 0) {
        customer.phase = D1_CUSTOMER_PHASE.MEAL_COMPLETE;
        customer.phaseRemainingMs = 0;
      }
    } else if (customer.phase === D1_CUSTOMER_PHASE.LEAVING) {
      customer.phaseRemainingMs -= deltaMs;
      if (customer.phaseRemainingMs <= 0) {
        customer.phase = D1_CUSTOMER_PHASE.CLEANUP;
        customer.phaseRemainingMs = 0;
        const seat = state.seats.find((item) => item.id === customer.seatId);
        seat.status = 'cleanup';
      }
    }
  }
  for (const customer of expired) failCustomers(state, definition, customer, 'patience');
  syncMealDepartures(state, definition);
  trackAllTablesVacated(state);
  for (const seat of state.seats) {
    if (seat.status !== 'cleanup' || !seat.cleanup.active) continue;
    seat.cleanup.progressMs += deltaMs;
    if (seat.cleanup.progressMs >= definition.timingMs.cleanup) completeCleanup(state, seat);
  }
}

function updateGameClock(state, definition) {
  const ratio = Math.min(1, state.clock.elapsedMs / state.clock.targetMs);
  const startMinute = definition.businessWindow?.startMinute ?? (17 * 60 + 30);
  const endMinute = definition.businessWindow?.endMinute ?? (23 * 60 + 30);
  state.clock.gameMinute = Math.round(startMinute + ratio * (endMinute - startMinute));
}

function hasUnfinishedDayState(state) {
  const activeCustomers = Object.values(state.customers)
    .some((customer) => customer.phase !== D1_CUSTOMER_PHASE.DONE);
  const openOrders = Object.values(state.orders).some((order) => !TERMINAL_ORDER_STATUS.has(order.status));
  return activeCustomers || openOrders || state.seats.some((seat) => seat.status !== 'empty');
}

function updateClosingPhase(state, definition) {
  const allArrivalsResolved = state.waves.every((wave) => wave.status !== 'pending');
  const finalCleanupComplete = definition.arrivalPolicy.autoCloseAfterFinalCustomer
    && allArrivalsResolved
    && !hasUnfinishedDayState(state);
  if (
    state.phase === D1_DAY_PHASE.OPEN
    && (state.clock.elapsedMs >= state.clock.targetMs || finalCleanupComplete)
  ) {
    state.clock.arrivalsClosed = true;
    state.phase = D1_DAY_PHASE.CLOSING_DRAIN;
    state.waves.forEach((wave) => {
      if (wave.status === 'pending') wave.status = 'skipped-at-close';
    });
  }
  if (
    state.phase === D1_DAY_PHASE.CLOSING_DRAIN
    && !hasUnfinishedDayState(state)
    && state.limits.riskProcessCount === 0
  ) {
    state.phase = D1_DAY_PHASE.CHARCOAL_DOWN;
  }
}

export function advanceD1BusinessDay(state, definition, deltaMs) {
  assertFinite(deltaMs, 'deltaMs');
  if (deltaMs === 0 || state.clock.paused || [
    D1_DAY_PHASE.SETTLEMENT,
    D1_DAY_PHASE.COMPLETE,
  ].includes(state.phase)) return clone(state);
  const next = clone(state);
  let remaining = deltaMs;
  while (remaining > 0) {
    const step = Math.min(remaining, 100);
    if (next.phase === D1_DAY_PHASE.OPEN) {
      next.clock.elapsedMs = Math.min(next.clock.targetMs, next.clock.elapsedMs + step);
      updateGameClock(next, definition);
    }
    progressTimers(next, definition, step);
    spawnEligibleWaves(next, definition);
    updateClosingPhase(next, definition);
    remaining -= step;
  }
  return next;
}

function commandError(state, reason, details = {}) {
  return { state: clone(state), applied: false, duplicate: false, reason, ...details };
}

function prepareCommand(state, eventId) {
  assertString(eventId, 'eventId');
  if (state.handledEventIds.includes(eventId)) {
    return { duplicate: true, result: { state: clone(state), applied: false, duplicate: true } };
  }
  const next = clone(state);
  next.handledEventIds.push(eventId);
  return { duplicate: false, next };
}

export function dispatchD1Command(state, definition, command) {
  if (!command || typeof command !== 'object') throw new TypeError('D1 command가 필요합니다.');
  const prepared = prepareCommand(state, command.eventId);
  if (prepared.duplicate) return prepared.result;
  const next = prepared.next;

  if (command.type === 'pause') {
    next.clock.paused = true;
    return { state: next, applied: true, duplicate: false };
  }
  if (command.type === 'resume') {
    next.clock.paused = false;
    return { state: next, applied: true, duplicate: false };
  }
  if (command.type === 'set-risk-count') {
    if (
      !Number.isInteger(command.count)
      || command.count < 0
      || command.count > definition.limits.maxRiskProcesses
    ) {
      return commandError(state, 'risk-cap-exceeded', {
        maxRiskProcesses: definition.limits.maxRiskProcesses,
      });
    }
    next.limits.riskProcessCount = command.count;
    next.limits.peakRiskProcesses = Math.max(next.limits.peakRiskProcesses, command.count);
    updateClosingPhase(next, definition);
    return { state: next, applied: true, duplicate: false };
  }
  if (command.type === 'accept-order') {
    const order = next.orders[command.orderId];
    const customer = order ? next.customers[order.customerId] : null;
    if (!order || !customer) return commandError(state, 'order-not-found');
    if (order.status !== D1_ORDER_STATUS.UNACCEPTED || customer.phase !== D1_CUSTOMER_PHASE.ORDER_READY) {
      return commandError(state, 'order-not-ready');
    }
    if (acceptedOrderCount(next) >= definition.limits.maxActiveOrders) {
      return commandError(state, 'active-order-cap');
    }
    order.status = D1_ORDER_STATUS.ACCEPTED;
    order.acceptedAtMs = next.clock.elapsedMs;
    for (const customerId of order.customerIds ?? [customer.id]) {
      const member = next.customers[customerId];
      member.phase = D1_CUSTOMER_PHASE.WAITING;
      member.waitRemainingMs = member.patienceMs;
    }
    next.metrics.acceptedOrders += 1;
    return { state: next, applied: true, duplicate: false };
  }
  if (command.type === 'serve-item') {
    const customer = next.customers[command.customerId];
    const order = customer ? next.orders[customer.orderId] : null;
    if (!customer || !order) return commandError(state, 'customer-not-found');
    if (customer.phase !== D1_CUSTOMER_PHASE.WAITING) {
      return commandError(state, 'customer-not-waiting');
    }
    if (remainingForMenu(order, command.menuId, command.seasoning) <= 0) {
      return commandError(state, 'menu-mismatch');
    }
    const line = order.lines.find(
      (item) => item.menuId === command.menuId
        && seasoningMatches(item, command.seasoning)
        && item.servedQualities.length < item.quantity,
    );
    const policy = menuPolicy(definition, command.menuId);
    const quality = policy.qualityMode === 'none' ? null : command.quality;
    if (policy.qualityMode === 'graded' && !Object.values(D1_QUALITY).includes(quality)) {
      return commandError(state, 'invalid-quality');
    }
    line.servedQualities.push(quality);
    order.status = D1_ORDER_STATUS.PARTIAL;
    next.metrics.servedItems += 1;
    if (quality != null) next.metrics.quality[quality] += 1;
    next.metrics.waitSampleTotalMs += Math.max(0, customer.patienceMs - customer.waitRemainingMs);
    if (policy.saleLedger && definition.economy.menuPrices[command.menuId] > 0) {
      ledgerEntry(next, {
        id: `sale:${command.eventId}`,
        type: 'sale',
        amount: salePrice(definition, command.menuId, quality),
        orderId: order.id,
        customerId: customer.id,
        menuId: command.menuId,
        quality,
      });
    }
    if (quality === D1_QUALITY.FAIL) {
      failCustomers(next, definition, customer, 'fail-quality');
      return { state: next, applied: true, duplicate: false, left: true };
    }
    if (order.lines.every((item) => item.servedQualities.length === item.quantity)) {
      completeReceivedOrder(next, definition, customer, order);
      spawnEligibleWaves(next, definition);
      return { state: next, applied: true, duplicate: false, completedOrder: true };
    }
    customer.waitRemainingMs = Math.min(
      customer.patienceMs,
      customer.waitRemainingMs + policy.waitRecoveryMs,
    );
    return {
      state: next,
      applied: true,
      duplicate: false,
      partial: true,
      remaining: order.lines.reduce(
        (sum, item) => sum + item.quantity - item.servedQualities.length,
        0,
      ),
    };
  }
  if (command.type === 'begin-cleanup') {
    const seat = next.seats.find((item) => item.id === command.seatId);
    if (!seat || seat.status !== 'cleanup') return commandError(state, 'seat-not-cleanable');
    seat.cleanup.active = true;
    seat.cleanup.progressMs = 0;
    return { state: next, applied: true, duplicate: false };
  }
  if (command.type === 'cancel-cleanup') {
    const seat = next.seats.find((item) => item.id === command.seatId);
    if (!seat || seat.status !== 'cleanup') return commandError(state, 'seat-not-cleanable');
    seat.cleanup.active = false;
    seat.cleanup.progressMs = 0;
    return { state: next, applied: true, duplicate: false };
  }
  if (command.type === 'lower-charcoal') {
    if (next.phase !== D1_DAY_PHASE.CHARCOAL_DOWN) return commandError(state, 'day-not-drained');
    if (next.limits.riskProcessCount !== 0) return commandError(state, 'risk-process-active');
    const disposed = command.disposedPreparedItems ?? 0;
    if (!Number.isInteger(disposed) || disposed < 0) {
      return commandError(state, 'invalid-disposed-count');
    }
    next.metrics.disposedPreparedItems = disposed;
    next.phase = D1_DAY_PHASE.SETTLEMENT;
    next.settlement.summary = summarizeD1Settlement(next);
    return { state: next, applied: true, duplicate: false };
  }
  if (command.type === 'reveal-settlement-step') {
    if (next.phase !== D1_DAY_PHASE.SETTLEMENT) return commandError(state, 'not-settlement');
    const index = next.settlement.revealedSteps.length;
    if (index >= D1_SETTLEMENT_STEPS.length) return commandError(state, 'settlement-already-ready');
    next.settlement.revealedSteps.push(D1_SETTLEMENT_STEPS[index]);
    next.settlement.ready = next.settlement.revealedSteps.length === D1_SETTLEMENT_STEPS.length;
    return {
      state: next,
      applied: true,
      duplicate: false,
      stepId: D1_SETTLEMENT_STEPS[index],
      ready: next.settlement.ready,
    };
  }
  return commandError(state, 'unsupported-command');
}

function sumLedger(state, type) {
  return state.ledger
    .filter((entry) => entry.type === type)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function summarizeD1Settlement(state) {
  const revenue = sumLedger(state, 'sale');
  const tip = sumLedger(state, 'tip');
  const reputation = sumLedger(state, 'reputation');
  return {
    dayId: state.dayId,
    completionId: state.settlement.completionId,
    customers: {
      visited: state.metrics.visitedCustomers,
      lost: state.metrics.lostCustomers,
      cleanedSeats: state.metrics.cleanedSeats,
    },
    orders: {
      accepted: state.metrics.acceptedOrders,
      completed: state.metrics.completedOrders,
      abandoned: state.metrics.abandonedOrders,
    },
    quality: clone(state.metrics.quality),
    wait: {
      averageMs: state.metrics.servedItems
        ? Math.round(state.metrics.waitSampleTotalMs / state.metrics.servedItems)
        : 0,
    },
    economy: {
      revenue,
      tip,
      total: revenue + tip,
      reputation,
    },
    operations: {
      peakActiveOrders: state.limits.peakActiveOrders,
      peakRiskProcesses: state.limits.peakRiskProcesses,
      disposedPreparedItems: state.metrics.disposedPreparedItems,
      elapsedMs: state.clock.elapsedMs,
    },
  };
}

export function buildD1CampaignReward(summary) {
  return {
    balance: summary.economy.total,
    reputation: summary.economy.reputation,
    unlockIds: ['recipe-momo', 'menu-momo', 'day-d2'],
    storyFlagIds: ['d1-complete', 'momo-restored'],
  };
}

export function buildBusinessDayCampaignReward(summary, definition) {
  if (definition.id === 'd1') return buildD1CampaignReward(summary);
  return {
    balance: summary.economy.total,
    reputation: summary.economy.reputation,
    unlockIds: [...(definition.campaignReward?.unlockIds ?? [`day-${definition.nextNodeId}`])],
    storyFlagIds: [...(definition.campaignReward?.storyFlagIds ?? [`${definition.id}-complete`])],
  };
}

export function markD1BusinessDayComplete(state) {
  if (state.phase !== D1_DAY_PHASE.SETTLEMENT || !state.settlement.ready) {
    throw new TypeError('정산 5단계를 모두 확인한 뒤에만 D1을 완료할 수 있습니다.');
  }
  return { ...clone(state), phase: D1_DAY_PHASE.COMPLETE };
}

export function validateD1BusinessDayState(state, definition) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { valid: false, errors: ['D1 상태가 객체가 아닙니다.'] };
  }
  if (state.stateVersion !== 1) errors.push('지원하지 않는 D1 stateVersion입니다.');
  if (state.dayId !== definition.id) errors.push('D1 dayId가 정의와 다릅니다.');
  if (!Object.values(D1_DAY_PHASE).includes(state.phase)) errors.push('D1 phase가 올바르지 않습니다.');
  if (state.seats?.length !== definition.seatIds.length) errors.push('D1 좌석 수가 정의와 다릅니다.');
  if (new Set(state.handledEventIds ?? []).size !== (state.handledEventIds ?? []).length) {
    errors.push('D1 처리 이벤트 ID가 중복됐습니다.');
  }
  if (state.limits?.riskProcessCount > definition.limits.maxRiskProcesses) {
    errors.push('D1 위험 공정 상한을 넘었습니다.');
  }
  if (acceptedOrderCount(state) > definition.limits.maxActiveOrders) {
    errors.push('D1 활성 주문 상한을 넘었습니다.');
  }
  return { valid: errors.length === 0, errors };
}

export function d1DebugView(state) {
  return {
    phase: state.phase,
    clock: clone(state.clock),
    activeOrders: acceptedOrderCount(state),
    riskProcesses: state.limits.riskProcessCount,
    waves: clone(state.waves),
    seats: clone(state.seats),
    customers: clone(state.customers),
    orders: clone(state.orders),
    settlement: clone(state.settlement),
  };
}
