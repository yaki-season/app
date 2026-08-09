export const DRINK_LEVER_DRAG_THRESHOLD_PX = 24;

export function drinkLeverZoneForDelta(deltaY, threshold = DRINK_LEVER_DRAG_THRESHOLD_PX) {
  if (deltaY >= threshold) return 'beer';
  if (deltaY <= -threshold) return 'foam';
  return null;
}
