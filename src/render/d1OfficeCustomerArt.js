export const D1_OFFICE_CUSTOMER_FRAME_INTERVAL_MS = 1200;

const OFFICE_IDS = Object.freeze(['a', 'b', 'c', 'd', 'e']);
const COMMUTER_VARIANTS = Object.freeze({ A: 'c', B: 'd', C: 'e', D: 'c', E: 'd' });
const ACTION_PHASES = new Set(['eating', 'done']);

export function d1OfficeCustomerVariant(customerId) {
  const match = /^D[1-3]-OFFICE-([A-E])$/.exec(customerId ?? '');
  if (match) return match[1].toLowerCase();
  const commuterMatch = /^D[2-3]-COMMUTER-([A-E])$/.exec(customerId ?? '');
  if (commuterMatch) {
    return COMMUTER_VARIANTS[commuterMatch[1]] ?? 'c';
  }
  return null;
}

function companionFor(bundle, role) {
  return (bundle?.companions ?? []).find((companion) => companion.role === role) ?? null;
}

function frameFor(bundle, variant, state) {
  if (variant === 'a' && state === 'waiting') {
    return Object.freeze({ ...bundle, frameRole: 'office-a-waiting' });
  }
  const frame = companionFor(bundle, `office-${variant}-${state}`);
  return frame ? Object.freeze({ ...frame, frameRole: frame.role }) : null;
}

export function resolveD1OfficeCustomerFrame(
  bundle,
  {
    customerId,
    phase = 'waiting',
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

  // A partially served order should visibly use the item already on the table.
  // Once the full order is being eaten, alternate only between actually served items.
  const acting = ACTION_PHASES.has(phase) || servedNegima || servedBeer;
  if (!acting) return waiting;
  const index = availableActions.length === 1
    ? 0
    : Math.floor(Math.max(0, nowMs) / D1_OFFICE_CUSTOMER_FRAME_INTERVAL_MS)
      % availableActions.length;
  return frameFor(bundle, variant, availableActions[index]) ?? waiting;
}

export function isD1OfficeBeerFrame(frame) {
  return frame?.frameRole?.endsWith('-drinking-beer') === true;
}
