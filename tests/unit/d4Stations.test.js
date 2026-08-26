import { describe, expect, it } from 'vitest';
import { createHighballStation, evaluateHighballQuality } from '../../src/application/stations/highballStation.js';
import { createInstantServiceStation } from '../../src/application/stations/instantServiceStation.js';

describe('D4 즉시 제공 스테이션', () => {
  it('2.5초 연속 홀드 한 번에 사라다 한 접시만 만든다', () => {
    const station = createInstantServiceStation({ holdMs: 2_500 });
    expect(station.begin(1_000)).toBe(true);
    expect(station.tick(3_499).completed).toBe(false);
    expect(station.tick(3_500)).toMatchObject({ completed: true, quantity: 1 });
    expect(station.tick(9_000).completed).toBe(false);
    expect(station.release()).toBe(true);
    expect(station.view()).toMatchObject({ phase: 'idle', progressMs: 0 });
  });

  it('홀드 중 손을 떼면 진행을 0으로 되돌린다', () => {
    const station = createInstantServiceStation({ holdMs: 2_500 });
    station.begin(0);
    station.tick(2_000);
    expect(station.release()).toBe(false);
    expect(station.view()).toMatchObject({ phase: 'idle', progressMs: 0, ratio: 0 });
  });
});

describe('D4 하이볼 스테이션', () => {
  it('잔→얼음→위스키 1→탄산수 3→레몬을 Perfect로 완성한다', () => {
    const station = createHighballStation();
    expect(station.placeGlass().ok).toBe(true);
    expect(station.addIce().ok).toBe(true);
    expect(station.press('whiskey', 0).ok).toBe(true);
    station.release(1_000);
    expect(station.press('soda', 1_000).ok).toBe(true);
    station.release(4_000);
    const result = station.addLemon();
    expect(result.ok).toBe(true);
    expect(result.completed).toMatchObject({ menuId: 'highball', quality: 'Perfect' });
    expect(station.view().phase).toBe('empty');
  });

  it('4.8 단위에서 자동 차단하고 낮은 품질 계속 선택을 Fail로 확정한다', () => {
    const station = createHighballStation();
    station.placeGlass();
    station.addIce();
    station.press('whiskey', 0);
    station.release(1_000);
    station.press('soda', 1_000);
    expect(station.tick(5_000).overflowed).toBe(true);
    expect(station.view()).toMatchObject({ phase: 'overflow', totalUnits: 4.8 });
    expect(station.acceptOverflow().ok).toBe(true);
    expect(station.addLemon().completed.quality).toBe('Fail');
  });

  it('위스키·탄산수 양과 비율을 모두 판정한다', () => {
    expect(evaluateHighballQuality({ whiskeyUnits: 1, sodaUnits: 3 })).toBe('Perfect');
    expect(evaluateHighballQuality({ whiskeyUnits: 0.7, sodaUnits: 2.1 })).toBe('Good');
    expect(evaluateHighballQuality({ whiskeyUnits: 0.5, sodaUnits: 3 })).toBe('OK');
  });
});
