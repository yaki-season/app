import {
  D1_CUSTOMER_PHASE,
  D1_DAY_PHASE,
  D1_ORDER_STATUS,
  D1_SETTLEMENT_STEPS,
} from '../../domain/businessDay/d1BusinessDay.js';
import {
  D1_UI_ERROR_CODE,
  createD1UiError,
  freezeD1UiValue,
  normalizeD1MenuId,
} from './d1BusinessDayUiContract.js';

const MENU_LABEL = Object.freeze({
  beer: '생맥주',
  negima: '네기마',
  momo: '모모',
});

const CUSTOMER_PHASE_VIEW = Object.freeze({
  [D1_CUSTOMER_PHASE.THINKING]: 'thinking',
  [D1_CUSTOMER_PHASE.ORDER_READY]: 'ordering',
  [D1_CUSTOMER_PHASE.WAITING]: 'waiting',
  [D1_CUSTOMER_PHASE.RECEIVED_WAITING_GROUP]: 'done',
  [D1_CUSTOMER_PHASE.EATING]: 'eating',
  [D1_CUSTOMER_PHASE.MEAL_COMPLETE]: 'done',
  [D1_CUSTOMER_PHASE.LEAVING]: 'leaving',
  [D1_CUSTOMER_PHASE.CLEANUP]: 'cleanup',
});

const ACTIVE_ORDER_STATUSES = Object.freeze([
  D1_ORDER_STATUS.ACCEPTED,
  D1_ORDER_STATUS.PARTIAL,
]);

const FINISHED_ORDER_STATUSES = Object.freeze([
  D1_ORDER_STATUS.COMPLETED,
  D1_ORDER_STATUS.FAILED,
  D1_ORDER_STATUS.ABANDONED,
]);

function menuLabel(menuId) {
  return MENU_LABEL[menuId] ?? menuId;
}

function clockView(clock) {
  const normalized = ((clock.gameMinute % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return {
    elapsedMs: clock.elapsedMs,
    targetMs: clock.targetMs,
    gameMinute: clock.gameMinute,
    dayOffset: Math.floor(clock.gameMinute / 1440),
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    paused: clock.paused,
    arrivalsClosed: clock.arrivalsClosed,
  };
}

function uiCustomerPhase(customer, seat) {
  if (seat.status === 'cleanup') return 'cleanup';
  if (seat.status === 'empty' || customer.phase === D1_CUSTOMER_PHASE.DONE) return 'empty';
  return CUSTOMER_PHASE_VIEW[customer.phase] ?? 'waiting';
}

function orderLabel(order) {
  if (!order) return '';
  return order.lines
    .filter((line) => line.servedQualities.length < line.quantity)
    .map((line) => (
      line.quantity > 1
        ? `${menuLabel(line.menuId)} ${line.servedQualities.length}/${line.quantity}`
        : menuLabel(line.menuId)
    ))
    .join(' · ');
}

function remainingOrderItems(order) {
  if (!order) return [];
  return order.lines
    .map((line) => ({
      menuId: line.menuId,
      menuLabel: menuLabel(line.menuId),
      remaining: Math.max(0, line.quantity - line.servedQualities.length),
    }))
    .filter((line) => line.remaining > 0);
}

function remainingOrderLabel(items) {
  return items.map((item) => `${item.menuLabel} ${item.remaining}개`).join(' · ');
}

function emptySeatView(seatId) {
  return {
    seatId,
    customerId: null,
    occupied: false,
    phase: 'empty',
    mood: 'waiting',
    orderLabel: '',
    waitRatio: 0,
    urgent: false,
    group: false,
    canOrder: false,
    canServe: false,
    cleanupNeeded: false,
    cleanupProgress: 0,
    acceptedMenuIds: [],
    remainingItems: [],
    remainingOrderLabel: '',
  };
}

function seatView(state, definition, seat) {
  const customer = seat.customerId ? state.customers[seat.customerId] : null;
  if (!customer || seat.status === 'empty') return emptySeatView(seat.id);

  const order = state.orders[customer.orderId];
  const remainingItems = remainingOrderItems(order);
  const phase = uiCustomerPhase(customer, seat);
  const waiting = customer.phase === D1_CUSTOMER_PHASE.WAITING;
  const waitRatio = waiting && customer.waitRemainingMs != null
    ? Math.max(0, Math.min(1, customer.waitRemainingMs / customer.patienceMs))
    : 1;
  const mood = customer.departureCause
    ? 'retry'
    : [D1_CUSTOMER_PHASE.EATING, D1_CUSTOMER_PHASE.MEAL_COMPLETE].includes(customer.phase)
      ? 'satisfied'
      : 'waiting';
  return {
    seatId: seat.id,
    customerId: customer.id,
    // leaving부터는 손님 액터가 좌석에 남아 있지 않는다. 좌석의 dirty/cleanup 상태는
    // cleanupNeeded로 따로 유지해 빈 식기와 정리 입력을 계속 노출한다.
    occupied: !['empty', 'leaving', 'cleanup'].includes(phase),
    phase,
    mood,
    orderId: order?.id ?? null,
    orderLabel: orderLabel(order),
    remainingItems,
    remainingOrderLabel: remainingOrderLabel(remainingItems),
    waitRatio,
    urgent: waiting && customer.waitRemainingMs <= 15_000,
    group: customer.groupId !== null,
    canOrder: customer.phase === D1_CUSTOMER_PHASE.ORDER_READY
      && order?.status === D1_ORDER_STATUS.UNACCEPTED,
    canServe: waiting,
    cleanupNeeded: seat.status === 'cleanup',
    cleanupProgress: seat.status === 'cleanup'
      ? Math.max(0, Math.min(1, seat.cleanup.progressMs / definition.timingMs.cleanup))
      : 0,
    acceptedMenuIds: waiting ? remainingItems.map((line) => line.menuId) : [],
  };
}

export function canServeD1MenuToSeat(seat, menu) {
  const menuId = normalizeD1MenuId(menu);
  return Boolean(
    menuId
    && seat?.canServe
    && seat.remainingItems?.some((item) => item.menuId === menuId && item.remaining > 0),
  );
}

function orderView(state, order) {
  const customer = state.customers[order.customerId];
  return {
    orderId: order.id,
    customerId: order.customerId,
    seatId: customer?.seatId ?? null,
    status: order.status,
    acceptedAtMs: order.acceptedAtMs,
    completedAtMs: order.completedAtMs,
    lines: order.lines.map((line) => ({
      menuId: line.menuId,
      menuLabel: menuLabel(line.menuId),
      quantity: line.quantity,
      served: line.servedQualities.length,
      remaining: line.quantity - line.servedQualities.length,
      qualities: [...line.servedQualities],
    })),
  };
}

function suggestedScreenId(phase) {
  if (phase === D1_DAY_PHASE.CHARCOAL_DOWN || phase === D1_DAY_PHASE.CLOSING_DRAIN) {
    return 'SCR-POST-CLOSING';
  }
  if (phase === D1_DAY_PHASE.SETTLEMENT) return 'SCR-POST-SETTLEMENT';
  if (phase === D1_DAY_PHASE.COMPLETE) return 'SCR-POST-DAY-COMPLETE';
  return null;
}

export function buildD1BusinessDayViewModel(state, definition) {
  if (!state) {
    return freezeD1UiValue({
      ready: false,
      dayId: 'D1',
      phase: null,
      suggestedScreenId: 'SCR-DAY-PREP',
      seats: [],
      orders: [],
      error: createD1UiError(D1_UI_ERROR_CODE.NOT_STARTED),
    });
  }
  const seats = state.seats.map((seat) => seatView(state, definition, seat));
  const orders = Object.values(state.orders).map((order) => orderView(state, order));
  const unfinishedCustomerCount = Object.values(state.customers)
    .filter((customer) => customer.phase !== D1_CUSTOMER_PHASE.DONE).length;
  const unfinishedOrderCount = orders
    .filter((order) => !FINISHED_ORDER_STATUSES.includes(order.status)).length;
  const cleanupSeatCount = seats.filter((seat) => seat.cleanupNeeded).length;
  return freezeD1UiValue({
    ready: true,
    dayId: state.dayId.toUpperCase(),
    runId: state.runId,
    phase: state.phase,
    suggestedScreenId: suggestedScreenId(state.phase),
    clock: clockView(state.clock),
    seats,
    orders,
    limits: {
      activeOrderCount: orders.filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status)).length,
      maxActiveOrders: definition.limits.maxActiveOrders,
      riskProcessCount: state.limits.riskProcessCount,
      maxRiskProcesses: definition.limits.maxRiskProcesses,
    },
    closing: {
      active: state.phase === D1_DAY_PHASE.CLOSING_DRAIN,
      unfinishedCustomerCount,
      unfinishedOrderCount,
      cleanupSeatCount,
      canLowerCharcoal: state.phase === D1_DAY_PHASE.CHARCOAL_DOWN
        && state.limits.riskProcessCount === 0,
    },
    settlement: {
      steps: [...D1_SETTLEMENT_STEPS],
      revealedSteps: [...state.settlement.revealedSteps],
      nextStepId: D1_SETTLEMENT_STEPS[state.settlement.revealedSteps.length] ?? null,
      ready: state.settlement.ready,
      summary: state.settlement.summary === null
        ? null
        : structuredClone(state.settlement.summary),
    },
    capabilities: {
      paused: state.clock.paused,
      canRevealSettlement: state.phase === D1_DAY_PHASE.SETTLEMENT
        && !state.settlement.ready,
      canFinalize: state.phase === D1_DAY_PHASE.SETTLEMENT
        && state.settlement.ready,
    },
  });
}
