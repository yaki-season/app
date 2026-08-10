import { describe, expect, it } from 'vitest';
import { computeSeats, D1_SEATING_RECT, OBJECTS, SCREEN_BY_ID } from '../../src/config/screenLayout.js';

describe('드링크 스테이션 화면 배치', () => {
  it('개발용 슬롯은 숨기고 승인 빈잔 덱 위치에 클릭 영역만 노출한다', () => {
    expect(SCREEN_BY_ID['SCR-SVC-DRINK'].objects).toContain('glassRack');
    expect(OBJECTS.glassRack.hitRect).toBeDefined();
    expect(OBJECTS.glassRack.invisible).toBe(true);
    expect(OBJECTS.glassRack.rect).toEqual(OBJECTS.drinkGlassDeck.rect);
    expect(OBJECTS.glassRack.hitRect).toEqual(OBJECTS.drinkGlassDeck.rect);
  });

  it('맥주 머신은 전체 화면 cover가 아닌 승인 원경 rect를 쓴다', () => {
    expect(OBJECTS.drinkStation.full).not.toBe(true);
    expect(OBJECTS.drinkStation.rect).toEqual({ x: 0.045, y: -0.04, width: 0.91, height: 1.02 });
  });
});

describe('손님 화면 원경 배치', () => {
  it('배경은 원경으로 두고 일자형 카운터는 화면 전체 폭의 낮은 전경으로 둔다', () => {
    expect(OBJECTS.custBg.imageScale).toBeLessThan(1.3);
    expect(OBJECTS.custCounter.imageScale).toBe(1);
    expect(OBJECTS.custCounter.imageScaleX).toBeUndefined();
    expect(OBJECTS.custCounter.imageScaleY).toBe(0.78);
    expect(OBJECTS.custCounter.imageOffsetY).toBeGreaterThan(0);
    expect(OBJECTS.custBg.stableAssetId).toBe('BG-INTERIOR-BASE');
    expect(OBJECTS.custCounter.stableAssetId).toBe('BG-SERVICE-TABLE-ARTIST009');
    expect(SCREEN_BY_ID['SCR-SVC-CUSTOMERS'].objects).toContain('custSeating');
    expect(D1_SEATING_RECT.y).toBeCloseTo(190 / 1080);
  });

  it('손님 하단을 새 카운터 상판 높이에 맞춘다', () => {
    const seat = computeSeats(6)[0];
    expect(seat.actor.y + seat.actor.height).toBeCloseTo(0.81);
    expect(seat.actor.width).toBe(0.16875);
    expect(seat.bubble.y).toBeLessThan(seat.actor.y);
    // 첫 논리 손님은 승인 seating/츠키오카 합성 계약의 물리 4번 좌석에 놓인다.
    expect(seat.actor.x + seat.actor.width / 2).toBeCloseTo(1108.7 / 1920);
  });
});
