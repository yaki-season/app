import {
  D1_CUSTOMER_PHASE,
  D1_DAY_PHASE,
  D1_ORDER_STATUS,
  D1_QUALITY,
  D1_SETTLEMENT_STEPS,
} from '../../domain/businessDay/d1BusinessDay.js';

export const D1_UI_INTENT = Object.freeze({
  ACCEPT_ORDER: 'accept-order',
  SERVE_ITEM: 'serve-item',
  BEGIN_CLEANUP: 'begin-cleanup',
  CANCEL_CLEANUP: 'cancel-cleanup',
  SET_RISK_COUNT: 'set-risk-count',
  LOWER_CHARCOAL: 'lower-charcoal',
  REVEAL_SETTLEMENT_STEP: 'reveal-settlement-step',
  PAUSE: 'pause',
  RESUME: 'resume',
});

export const D1_UI_ERROR_CODE = Object.freeze({
  NOT_STARTED: 'D1_NOT_STARTED',
  INVALID_INTENT: 'D1_INVALID_INTENT',
  UNSUPPORTED_INTENT: 'D1_UNSUPPORTED_INTENT',
  ORDER_NOT_FOUND: 'D1_ORDER_NOT_FOUND',
  ORDER_NOT_READY: 'D1_ORDER_NOT_READY',
  ACTIVE_ORDER_CAP: 'D1_ACTIVE_ORDER_CAP',
  CUSTOMER_NOT_FOUND: 'D1_CUSTOMER_NOT_FOUND',
  CUSTOMER_NOT_WAITING: 'D1_CUSTOMER_NOT_WAITING',
  MENU_MISMATCH: 'D1_MENU_MISMATCH',
  INVALID_QUALITY: 'D1_INVALID_QUALITY',
  SEAT_NOT_CLEANABLE: 'D1_SEAT_NOT_CLEANABLE',
  RISK_CAP_EXCEEDED: 'D1_RISK_CAP_EXCEEDED',
  DAY_NOT_DRAINED: 'D1_DAY_NOT_DRAINED',
  RISK_PROCESS_ACTIVE: 'D1_RISK_PROCESS_ACTIVE',
  INVALID_DISPOSED_COUNT: 'D1_INVALID_DISPOSED_COUNT',
  NOT_SETTLEMENT: 'D1_NOT_SETTLEMENT',
  SETTLEMENT_ALREADY_READY: 'D1_SETTLEMENT_ALREADY_READY',
  SETTLEMENT_NOT_READY: 'D1_SETTLEMENT_NOT_READY',
  INVALID_STATE: 'D1_INVALID_STATE',
  SAVE_FAILED: 'D1_SAVE_FAILED',
});

const MENU_LABEL = Object.freeze({
  beer: '생맥주',
  negima: '네기마',
  momo: '모모',
  'cabbage-salad': '양배추 사라다',
  highball: '하이볼',
});
const MENU_ID = Object.freeze({
  beer: 'beer',
  negima: 'negima',
  momo: 'momo',
  'cabbage-salad': 'cabbage-salad',
  highball: 'highball',
  생맥주: 'beer',
  네기마: 'negima',
  모모: 'momo',
  '양배추 사라다': 'cabbage-salad',
  사라다: 'cabbage-salad',
  하이볼: 'highball',
});
const ERROR_BY_REASON = Object.freeze({
  'order-not-found': D1_UI_ERROR_CODE.ORDER_NOT_FOUND,
  'order-not-ready': D1_UI_ERROR_CODE.ORDER_NOT_READY,
  'active-order-cap': D1_UI_ERROR_CODE.ACTIVE_ORDER_CAP,
  'customer-not-found': D1_UI_ERROR_CODE.CUSTOMER_NOT_FOUND,
  'customer-not-waiting': D1_UI_ERROR_CODE.CUSTOMER_NOT_WAITING,
  'menu-mismatch': D1_UI_ERROR_CODE.MENU_MISMATCH,
  'invalid-quality': D1_UI_ERROR_CODE.INVALID_QUALITY,
  'seat-not-cleanable': D1_UI_ERROR_CODE.SEAT_NOT_CLEANABLE,
  'risk-cap-exceeded': D1_UI_ERROR_CODE.RISK_CAP_EXCEEDED,
  'day-not-drained': D1_UI_ERROR_CODE.DAY_NOT_DRAINED,
  'risk-process-active': D1_UI_ERROR_CODE.RISK_PROCESS_ACTIVE,
  'invalid-disposed-count': D1_UI_ERROR_CODE.INVALID_DISPOSED_COUNT,
  'not-settlement': D1_UI_ERROR_CODE.NOT_SETTLEMENT,
  'settlement-already-ready': D1_UI_ERROR_CODE.SETTLEMENT_ALREADY_READY,
  'settlement-not-ready': D1_UI_ERROR_CODE.SETTLEMENT_NOT_READY,
  'invalid-d1-state': D1_UI_ERROR_CODE.INVALID_STATE,
  'unsupported-command': D1_UI_ERROR_CODE.UNSUPPORTED_INTENT,
});
const ERROR_MESSAGE = Object.freeze({
  [D1_UI_ERROR_CODE.NOT_STARTED]: 'D1 영업을 먼저 시작해야 합니다.',
  [D1_UI_ERROR_CODE.INVALID_INTENT]: '처리할 수 없는 입력입니다.',
  [D1_UI_ERROR_CODE.UNSUPPORTED_INTENT]: '지원하지 않는 D1 입력입니다.',
  [D1_UI_ERROR_CODE.ORDER_NOT_FOUND]: '주문을 찾을 수 없습니다.',
  [D1_UI_ERROR_CODE.ORDER_NOT_READY]: '아직 접수할 수 없는 주문입니다.',
  [D1_UI_ERROR_CODE.ACTIVE_ORDER_CAP]: '현재 처리 가능한 주문 수를 넘었습니다.',
  [D1_UI_ERROR_CODE.CUSTOMER_NOT_FOUND]: '손님을 찾을 수 없습니다.',
  [D1_UI_ERROR_CODE.CUSTOMER_NOT_WAITING]: '이 손님은 현재 제공을 기다리지 않습니다.',
  [D1_UI_ERROR_CODE.MENU_MISMATCH]: '주문과 다른 메뉴입니다.',
  [D1_UI_ERROR_CODE.INVALID_QUALITY]: '지원하지 않는 품질입니다.',
  [D1_UI_ERROR_CODE.SEAT_NOT_CLEANABLE]: '현재 정리할 수 없는 좌석입니다.',
  [D1_UI_ERROR_CODE.RISK_CAP_EXCEEDED]: '동시 위험 공정 상한을 넘었습니다.',
  [D1_UI_ERROR_CODE.DAY_NOT_DRAINED]: '남은 손님과 주문을 모두 처리해야 합니다.',
  [D1_UI_ERROR_CODE.RISK_PROCESS_ACTIVE]: '진행 중인 위험 공정을 먼저 끝내야 합니다.',
  [D1_UI_ERROR_CODE.INVALID_DISPOSED_COUNT]: '폐기 수량이 올바르지 않습니다.',
  [D1_UI_ERROR_CODE.NOT_SETTLEMENT]: '정산 단계가 아닙니다.',
  [D1_UI_ERROR_CODE.SETTLEMENT_ALREADY_READY]: '정산 결과가 이미 모두 공개됐습니다.',
  [D1_UI_ERROR_CODE.SETTLEMENT_NOT_READY]: '정산 5단계를 모두 확인해야 합니다.',
  [D1_UI_ERROR_CODE.INVALID_STATE]: 'D1 저장 상태를 검증할 수 없습니다.',
  [D1_UI_ERROR_CODE.SAVE_FAILED]: '정산 결과를 저장하지 못했습니다.',
});

function immutable(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}

function uiError(code, reason = null, details = {}) {
  return immutable({
    code,
    reason,
    message: ERROR_MESSAGE[code] ?? ERROR_MESSAGE[D1_UI_ERROR_CODE.INVALID_INTENT],
    recoverable: code !== D1_UI_ERROR_CODE.INVALID_STATE,
    ...details,
  });
}

function normalizeMenuId(value) {
  return MENU_ID[value] ?? null;
}

function normalizeQuality(value) {
  const match = Object.values(D1_QUALITY)
    .find((quality) => quality.toLowerCase() === String(value ?? '').toLowerCase());
  return match ?? null;
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
  return {
    [D1_CUSTOMER_PHASE.THINKING]: 'thinking',
    [D1_CUSTOMER_PHASE.ORDER_READY]: 'ordering',
    [D1_CUSTOMER_PHASE.WAITING]: 'waiting',
    [D1_CUSTOMER_PHASE.RECEIVED_WAITING_GROUP]: 'done',
    [D1_CUSTOMER_PHASE.EATING]: 'eating',
    [D1_CUSTOMER_PHASE.MEAL_COMPLETE]: 'done',
    [D1_CUSTOMER_PHASE.LEAVING]: 'leaving',
    [D1_CUSTOMER_PHASE.CLEANUP]: 'cleanup',
  }[customer.phase] ?? 'waiting';
}

function orderLabel(order) {
  if (!order) return '';
  return order.lines
    .filter((line) => line.servedQualities.length < line.quantity)
    .map((line) => (
      line.quantity > 1
        ? `${lineMenuLabel(line)} ${line.servedQualities.length}/${line.quantity}`
        : lineMenuLabel(line)
    ))
    .join(' · ');
}

function lineMenuLabel(line) {
  const base = MENU_LABEL[line.menuId] ?? line.menuId;
  if (line.seasoning === 'tare') return `타레 ${base}`;
  if (line.seasoning === 'salt') return `소금 ${base}`;
  return base;
}

function remainingOrderItems(order) {
  if (!order) return [];
  return order.lines
    .map((line) => ({
      menuId: line.menuId,
      seasoning: line.seasoning ?? null,
      menuLabel: lineMenuLabel(line),
      remaining: Math.max(0, line.quantity - line.servedQualities.length),
    }))
    .filter((line) => line.remaining > 0);
}

function remainingOrderLabel(items) {
  return items.map((item) => `${item.menuLabel} ${item.remaining}개`).join(' · ');
}

function seatView(state, definition, seat) {
  const customer = seat.customerId ? state.customers[seat.customerId] : null;
  if (!customer || seat.status === 'empty') {
    return {
      seatId: seat.id,
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

export function canServeD1MenuToSeat(seat, menu, seasoning = null) {
  const menuId = normalizeMenuId(typeof menu === 'object' ? menu.menuId ?? menu.menu : menu);
  const preparedSeasoning = typeof menu === 'object' ? menu.seasoning ?? seasoning : seasoning;
  return Boolean(
    menuId
    && seat?.canServe
    && seat.remainingItems?.some((item) => (
      item.menuId === menuId
      && item.remaining > 0
      && (preparedSeasoning == null
        || (item.seasoning === 'tare' ? preparedSeasoning === 'tare' : preparedSeasoning !== 'tare'))
    )),
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
      seasoning: line.seasoning ?? null,
      menuLabel: lineMenuLabel(line),
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
    return immutable({
      ready: false,
      dayId: 'D1',
      phase: null,
      suggestedScreenId: 'SCR-DAY-PREP',
      seats: [],
      orders: [],
      error: uiError(D1_UI_ERROR_CODE.NOT_STARTED),
    });
  }
  const seats = state.seats.map((seat) => seatView(state, definition, seat));
  const orders = Object.values(state.orders).map((order) => orderView(state, order));
  const unfinishedCustomerCount = Object.values(state.customers)
    .filter((customer) => customer.phase !== D1_CUSTOMER_PHASE.DONE).length;
  const unfinishedOrderCount = orders.filter((order) => ![
    D1_ORDER_STATUS.COMPLETED,
    D1_ORDER_STATUS.FAILED,
    D1_ORDER_STATUS.ABANDONED,
  ].includes(order.status)).length;
  const cleanupSeatCount = seats.filter((seat) => seat.cleanupNeeded).length;
  return immutable({
    ready: true,
    dayId: state.dayId.toUpperCase(),
    runId: state.runId,
    phase: state.phase,
    suggestedScreenId: suggestedScreenId(state.phase),
    clock: clockView(state.clock),
    seats,
    orders,
    limits: {
      activeOrderCount: orders.filter((order) => [
        D1_ORDER_STATUS.ACCEPTED,
        D1_ORDER_STATUS.PARTIAL,
      ].includes(order.status)).length,
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

function findOrderIdBySeat(state, seatId) {
  const seat = state.seats.find((item) => item.id === seatId);
  return seat?.customerId ? state.customers[seat.customerId]?.orderId ?? null : null;
}

function findCustomerIdBySeat(state, seatId) {
  return state.seats.find((item) => item.id === seatId)?.customerId ?? null;
}

function commandForIntent(state, intent) {
  const eventId = intent.intentId;
  if (typeof eventId !== 'string' || eventId.length === 0) return null;
  if (intent.type === D1_UI_INTENT.ACCEPT_ORDER) {
    return {
      eventId,
      type: 'accept-order',
      orderId: intent.orderId ?? findOrderIdBySeat(state, intent.seatId),
    };
  }
  if (intent.type === D1_UI_INTENT.SERVE_ITEM) {
    return {
      eventId,
      type: 'serve-item',
      customerId: intent.customerId ?? findCustomerIdBySeat(state, intent.seatId),
      menuId: normalizeMenuId(intent.menuId ?? intent.menu),
      seasoning: intent.seasoning ?? null,
      quality: normalizeQuality(intent.quality),
    };
  }
  if (intent.type === D1_UI_INTENT.BEGIN_CLEANUP) {
    return { eventId, type: 'begin-cleanup', seatId: intent.seatId };
  }
  if (intent.type === D1_UI_INTENT.CANCEL_CLEANUP) {
    return { eventId, type: 'cancel-cleanup', seatId: intent.seatId };
  }
  if (intent.type === D1_UI_INTENT.SET_RISK_COUNT) {
    return { eventId, type: 'set-risk-count', count: intent.count };
  }
  if (intent.type === D1_UI_INTENT.LOWER_CHARCOAL) {
    return {
      eventId,
      type: 'lower-charcoal',
      disposedPreparedItems: intent.disposedPreparedItems ?? 0,
    };
  }
  if (intent.type === D1_UI_INTENT.REVEAL_SETTLEMENT_STEP) {
    return { eventId, type: 'reveal-settlement-step' };
  }
  if (intent.type === D1_UI_INTENT.PAUSE) return { eventId, type: 'pause' };
  if (intent.type === D1_UI_INTENT.RESUME) return { eventId, type: 'resume' };
  return undefined;
}

export class D1BusinessDayUiPort {
  constructor({ runtime, definition }) {
    if (!runtime) throw new TypeError('D1 runtime이 필요합니다.');
    if (!definition) throw new TypeError('D1 definition이 필요합니다.');
    this.runtime = runtime;
    this.definition = definition;
  }

  getViewModel() {
    return buildD1BusinessDayViewModel(this.runtime.getState(), this.definition);
  }

  getStatus() {
    const runtimeStatus = this.runtime.getStatus();
    return immutable({
      ...runtimeStatus,
      phase: this.runtime.getState()?.phase ?? null,
      viewReady: this.runtime.getState() !== null,
    });
  }

  async start(options) {
    const result = await this.runtime.start(options);
    if (!result.ok) {
      return {
        ok: false,
        error: uiError(D1_UI_ERROR_CODE.SAVE_FAILED, result.error?.code ?? null),
        view: this.getViewModel(),
      };
    }
    return { ok: true, view: this.getViewModel(), checkpoint: result.checkpoint };
  }

  advance(deltaMs) {
    if (!this.runtime.getState()) {
      return {
        ok: false,
        error: uiError(D1_UI_ERROR_CODE.NOT_STARTED),
        view: this.getViewModel(),
      };
    }
    this.runtime.advance(deltaMs);
    return { ok: true, view: this.getViewModel() };
  }

  dispatch(intent) {
    const state = this.runtime.getState();
    if (!state) {
      return {
        ok: false,
        error: uiError(D1_UI_ERROR_CODE.NOT_STARTED),
        view: this.getViewModel(),
      };
    }
    if (!intent || typeof intent !== 'object') {
      return {
        ok: false,
        error: uiError(D1_UI_ERROR_CODE.INVALID_INTENT),
        view: this.getViewModel(),
      };
    }
    const command = commandForIntent(state, intent);
    if (command === null) {
      return {
        ok: false,
        error: uiError(D1_UI_ERROR_CODE.INVALID_INTENT, 'intent-id-required'),
        view: this.getViewModel(),
      };
    }
    if (command === undefined) {
      return {
        ok: false,
        error: uiError(D1_UI_ERROR_CODE.UNSUPPORTED_INTENT, intent.type),
        view: this.getViewModel(),
      };
    }
    const result = this.runtime.dispatch(command);
    if (!result.applied && !result.duplicate) {
      const code = ERROR_BY_REASON[result.reason] ?? D1_UI_ERROR_CODE.INVALID_INTENT;
      return {
        ok: false,
        error: uiError(code, result.reason, {
          expectedMenuId: result.expectedMenuId ?? null,
          maxRiskProcesses: result.maxRiskProcesses ?? null,
        }),
        view: this.getViewModel(),
      };
    }
    return {
      ok: true,
      applied: result.applied,
      duplicate: result.duplicate,
      partial: result.partial ?? false,
      remaining: result.remaining ?? null,
      completedOrder: result.completedOrder ?? false,
      left: result.left ?? false,
      stepId: result.stepId ?? null,
      view: this.getViewModel(),
    };
  }

  async finalize() {
    if (!this.runtime.getState()) {
      return {
        ok: false,
        error: uiError(D1_UI_ERROR_CODE.NOT_STARTED),
        view: this.getViewModel(),
      };
    }
    const result = await this.runtime.finalize();
    if (!result.ok) {
      const code = result.reason === 'settlement-not-ready'
        ? D1_UI_ERROR_CODE.SETTLEMENT_NOT_READY
        : result.reason === 'invalid-d1-state'
          ? D1_UI_ERROR_CODE.INVALID_STATE
          : D1_UI_ERROR_CODE.SAVE_FAILED;
      return {
        ok: false,
        error: uiError(code, result.reason ?? result.error?.code ?? null, {
          errors: result.errors ?? [],
        }),
        view: this.getViewModel(),
      };
    }
    return {
      ok: true,
      duplicate: result.duplicate,
      campaign: result.campaign,
      settlement: result.settlement,
      save: result.save,
      view: this.getViewModel(),
    };
  }
}
