export const D1_SOLO_CUSTOMER_FRAME_INTERVAL_MS = 1200;

function companionFor(bundle, role) {
  return (bundle?.companions ?? []).find((companion) => companion.role === role) ?? null;
}

function actionFrame(bundle, role) {
  const frame = companionFor(bundle, role);
  return frame ? Object.freeze({ ...frame, frameRole: frame.role }) : null;
}

export function resolveD1SoloCustomerFrame(
  bundle,
  {
    servedSkewer = false,
    servedBeer = false,
    nowMs = 0,
  } = {},
) {
  const availableActions = [];
  if (servedSkewer) availableActions.push('solo-eating-skewer');
  if (servedBeer) availableActions.push('solo-drinking-beer');
  if (availableActions.length === 0) return bundle;

  const index = availableActions.length === 1
    ? 0
    : Math.floor(Math.max(0, nowMs) / D1_SOLO_CUSTOMER_FRAME_INTERVAL_MS)
      % availableActions.length;
  return actionFrame(bundle, availableActions[index]) ?? bundle;
}

export function isD1SoloBeerFrame(frame) {
  return frame?.frameRole === 'solo-drinking-beer';
}
