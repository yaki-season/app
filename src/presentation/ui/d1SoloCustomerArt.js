import {
  customerArtFrameForRole,
  timedCustomerActionRole,
} from './customerArtFrameSelector.js';

export const D1_SOLO_CUSTOMER_FRAME_INTERVAL_MS = 1200;

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

  const action = timedCustomerActionRole(
    availableActions,
    nowMs,
    D1_SOLO_CUSTOMER_FRAME_INTERVAL_MS,
  );
  return customerArtFrameForRole(bundle, action) ?? bundle;
}

export function isD1SoloBeerFrame(frame) {
  return frame?.frameRole === 'solo-drinking-beer';
}
