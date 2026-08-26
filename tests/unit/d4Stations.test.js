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
    // 레몬을 올려도 잔은 작업대에 남는다. 플레이어가 집어 올려야 픽업대로 간다(생맥주와 같은 흐름).
    expect(station.view()).toMatchObject({ phase: 'ready', readyQuality: 'Perfect' });
  });

  it('완성한 잔은 플레이어가 집어 올릴 때까지 작업대에 남는다', () => {
    const station = createHighballStation();
    station.placeGlass();
    station.addIce();
    station.press('whiskey', 0);
    station.release(1_000);
    station.press('soda', 1_000);
    station.release(4_000);
    station.addLemon();

    // 완성 대기 중에는 새 잔·얼음·따르기를 받지 않는다.
    expect(station.placeGlass()).toMatchObject({ ok: false, reason: 'pickup-required' });
    expect(station.addIce()).toMatchObject({ ok: false, reason: 'pickup-required' });
    expect(station.press('soda', 5_000)).toMatchObject({ ok: false, reason: 'pickup-required' });
    expect(station.addLemon()).toMatchObject({ ok: false, reason: 'pickup-required' });

    const picked = station.pickUp();
    expect(picked).toMatchObject({ ok: true });
    expect(picked.completed).toMatchObject({ menuId: 'highball', quality: 'Perfect' });
    expect(station.view().phase).toBe('empty');
    expect(station.pickUp()).toMatchObject({ ok: false, reason: 'nothing-to-pick-up' });
  });

  it('완성 대기 상태는 새로고침 뒤에도 남는다', () => {
    const station = createHighballStation();
    station.placeGlass();
    station.addIce();
    station.press('whiskey', 0);
    station.release(1_000);
    station.press('soda', 1_000);
    station.release(4_000);
    station.addLemon();

    const restored = createHighballStation({ snapshot: station.snapshot() });
    expect(restored.view()).toMatchObject({ phase: 'ready', readyQuality: 'Perfect' });
    expect(restored.pickUp().completed).toMatchObject({ quality: 'Perfect' });
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
