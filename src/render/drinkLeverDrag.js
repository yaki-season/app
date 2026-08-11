export const DRINK_LEVER_DRAG_THRESHOLD_PX = 12;

export function drinkLeverZoneForDelta(
  deltaY,
  threshold = DRINK_LEVER_DRAG_THRESHOLD_PX,
  currentZone = null,
) {
  if (deltaY >= threshold) return 'beer';
  if (deltaY <= -threshold) return 'foam';
  // 실제 손 드래그는 활성 경계 근처에서 흔들린다. 한 번 방향이 걸린 뒤에는
  // 포인터를 놓거나 반대 경계를 넘을 때까지 유지해 거품도 안정적으로 따르게 한다.
  return currentZone;
}
