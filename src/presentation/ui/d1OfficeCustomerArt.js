import {
  customerArtFrameForRole,
  timedCustomerActionRole,
} from './customerArtFrameSelector.js';

export const D1_OFFICE_CUSTOMER_FRAME_INTERVAL_MS = 1200;

const OFFICE_IDS = Object.freeze(['a', 'b', 'c', 'd', 'e']);

export function d1OfficeCustomerVariant(customerId) {
  const match = /^D[1-3]-OFFICE-([A-E])$/.exec(customerId ?? '');
  if (match) return match[1].toLowerCase();
  if (/^D[2-3]-COMMUTER-/.test(customerId ?? '')) return 'c';
  return null;
}

function frameFor(bundle, variant, state) {
  if (variant === 'a' && state === 'waiting') {
    return Object.freeze({ ...bundle, frameRole: 'office-a-waiting' });
  }
  return customerArtFrameForRole(bundle, `office-${variant}-${state}`);
}

export function resolveD1OfficeCustomerFrame(
  bundle,
  {
    customerId,
    servedNegima = false,
    servedBeer = false,
    nowMs = 0,
  } = {},
) {
  const variant = d1OfficeCustomerVariant(customerId);
  if (!variant || !OFFICE_IDS.includes(variant)) return bundle;

  const waiting = frameFor(bundle, variant, 'waiting') ?? bundle;
  const availableActions = [];
  if (servedNegima) availableActions.push('eating-negima');
  if (servedBeer) availableActions.push('drinking-beer');
  if (availableActions.length === 0) return waiting;

  const action = timedCustomerActionRole(
    availableActions,
    nowMs,
    D1_OFFICE_CUSTOMER_FRAME_INTERVAL_MS,
  );
  return frameFor(bundle, variant, action) ?? waiting;
}

export function isD1OfficeBeerFrame(frame) {
  return frame?.frameRole?.endsWith('-drinking-beer') === true;
}
