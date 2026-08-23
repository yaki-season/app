import { D1_QUALITY } from '../../domain/businessDay/d1BusinessDay.js';

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

const MENU_ID = Object.freeze({
  beer: 'beer',
  negima: 'negima',
  momo: 'momo',
  생맥주: 'beer',
  네기마: 'negima',
  모모: 'momo',
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

export function freezeD1UiValue(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeD1UiValue);
    Object.freeze(value);
  }
  return value;
}

export function createD1UiError(code, reason = null, details = {}) {
  return freezeD1UiValue({
    code,
    reason,
    message: ERROR_MESSAGE[code] ?? ERROR_MESSAGE[D1_UI_ERROR_CODE.INVALID_INTENT],
    recoverable: code !== D1_UI_ERROR_CODE.INVALID_STATE,
    ...details,
  });
}

export function normalizeD1MenuId(value) {
  return MENU_ID[value] ?? null;
}

function normalizeQuality(value) {
  const match = Object.values(D1_QUALITY)
    .find((quality) => quality.toLowerCase() === String(value ?? '').toLowerCase());
  return match ?? null;
}

function findOrderIdBySeat(state, seatId) {
  const seat = state.seats.find((item) => item.id === seatId);
  return seat?.customerId ? state.customers[seat.customerId]?.orderId ?? null : null;
}

function findCustomerIdBySeat(state, seatId) {
  return state.seats.find((item) => item.id === seatId)?.customerId ?? null;
}

export function commandForD1UiIntent(state, intent) {
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
      menuId: normalizeD1MenuId(intent.menuId ?? intent.menu),
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
}

export function errorCodeForD1UiReason(reason) {
  return ERROR_BY_REASON[reason] ?? D1_UI_ERROR_CODE.INVALID_INTENT;
}

export function errorCodeForD1Finalization(reason) {
  if (reason === 'settlement-not-ready') return D1_UI_ERROR_CODE.SETTLEMENT_NOT_READY;
  if (reason === 'invalid-d1-state') return D1_UI_ERROR_CODE.INVALID_STATE;
  return D1_UI_ERROR_CODE.SAVE_FAILED;
}
