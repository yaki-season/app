import { describe, expect, it } from 'vitest';
import {
  DRINK_LEVER_DRAG_THRESHOLD_PX,
  drinkLeverZoneForDelta,
} from '../../src/render/drinkLeverDrag.js';

describe('drinkLeverZoneForDelta', () => {
  it('중립 범위에서는 아무것도 따르지 않는다', () => {
    expect(drinkLeverZoneForDelta(0)).toBeNull();
    expect(drinkLeverZoneForDelta(DRINK_LEVER_DRAG_THRESHOLD_PX - 1)).toBeNull();
    expect(drinkLeverZoneForDelta(-DRINK_LEVER_DRAG_THRESHOLD_PX + 1)).toBeNull();
  });

  it('아래로 드래그하면 맥주, 위로 드래그하면 거품이다', () => {
    expect(drinkLeverZoneForDelta(DRINK_LEVER_DRAG_THRESHOLD_PX)).toBe('beer');
    expect(drinkLeverZoneForDelta(-DRINK_LEVER_DRAG_THRESHOLD_PX)).toBe('foam');
  });
});
