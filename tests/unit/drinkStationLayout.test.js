import { describe, expect, it } from 'vitest';
import { computeSeats, OBJECTS, SCREEN_BY_ID } from '../../src/config/screenLayout.js';

describe('드링크 스테이션 화면 배치', () => {
  it('빈잔 놓기 슬롯을 화면과 클릭 영역에 노출한다', () => {
    expect(SCREEN_BY_ID['SCR-SVC-DRINK'].objects).toContain('glassRack');
    expect(OBJECTS.glassRack.hitRect).toBeDefined();
    expect(OBJECTS.glassRack.rect.x + OBJECTS.glassRack.rect.width / 2).toBeCloseTo(0.5);
  });

  it('맥주 머신은 전체 화면 cover 대신 축소된 원경 rect를 쓴다', () => {
    expect(OBJECTS.drinkStation.full).not.toBe(true);
    expect(OBJECTS.drinkStation.rect.width).toBeLessThan(1);
    expect(OBJECTS.drinkStation.rect.height).toBeLessThan(1);
  });
});

describe('손님 화면 원경 배치', () => {
  it('배경은 원경으로 두고 3면 카운터는 화면 밖까지 이어지는 전경으로 당긴다', () => {
    expect(OBJECTS.custBg.imageScale).toBeLessThan(1.3);
    expect(OBJECTS.custCounter.imageScaleX).toBeGreaterThan(1);
    expect(OBJECTS.custCounter.imageScaleY).toBe(1);
    expect(OBJECTS.custCounter.imageOffsetY).toBeGreaterThan(0);
    expect(OBJECTS.custBg.url).toContain('background-complete-r4-b1.png');
    expect(OBJECTS.custCounter.url).toContain('service-counter-u-r4-b1.png');
  });

  it('손님 하단을 새 카운터 상판 높이에 맞춘다', () => {
    const seat = computeSeats(6)[0];
    expect(seat.actor.y + seat.actor.height).toBeCloseTo(0.755);
    expect(seat.actor.width).toBe(0.16);
    expect(seat.bubble.y).toBeLessThan(seat.actor.y);
    expect(seat.actor.x + seat.actor.width / 2).toBeCloseTo(0.25);
  });
});
