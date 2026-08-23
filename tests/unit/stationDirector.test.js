// 프로덕션 화면 전환 상태 머신 순수 로직 검증 (SYS-002 v3 §71,104).
import { describe, it, expect } from 'vitest';
import { createStationDirector } from '../../src/application/gameplay/stationDirector.js';

const SCREENS = ['SCR-SVC-CUSTOMERS', 'SCR-SVC-ASSEMBLY', 'SCR-SVC-GRILL', 'SCR-SVC-DRINK'];

const make = (initial = SCREENS[0]) =>
  createStationDirector({ screens: SCREENS, initial, transitionMs: 300 });

describe('createStationDirector', () => {
  it('정지 경과를 화면 전환 시간에 포함하지 않는다', () => {
    const d = make();
    d.request('SCR-SVC-GRILL', 1_000);
    d.pause(1_100);
    expect(d.progress(51_100)).toBeCloseTo(1 / 3, 4);
    expect(d.request('SCR-SVC-DRINK', 51_100)).toBe(false);
    d.resume(51_100);
    d.tick(51_299);
    expect(d.isTransitioning()).toBe(true);
    d.tick(51_300);
    expect(d.isTransitioning()).toBe(false);
  });

  it('초기 화면에서 시작하고 전환 중이 아니다', () => {
    const d = make('SCR-SVC-ASSEMBLY');
    expect(d.activeScreenId()).toBe('SCR-SVC-ASSEMBLY');
    expect(d.isTransitioning()).toBe(false);
    expect(d.controlsLocked()).toBe(false);
  });

  it('알 수 없는 초기 화면이면 던진다', () => {
    expect(() => createStationDirector({ screens: SCREENS, initial: 'NOPE' })).toThrow();
  });

  it('right/left가 인접 화면으로 이동하고 끝에서 멈춘다(클램프)', () => {
    const d = make('SCR-SVC-CUSTOMERS');
    expect(d.canLeft()).toBe(false);
    d.right(0);
    expect(d.activeScreenId()).toBe('SCR-SVC-ASSEMBLY');
    d.tick(300);
    d.right(300);
    d.tick(600);
    d.right(600);
    d.tick(900);
    expect(d.activeScreenId()).toBe('SCR-SVC-DRINK');
    expect(d.canRight()).toBe(false);
    // 끝에서 오른쪽은 변화 없음
    expect(d.right(900)).toBe(false);
    expect(d.activeScreenId()).toBe('SCR-SVC-DRINK');
  });

  it('quickTo(request)로 임의 화면 점프', () => {
    const d = make('SCR-SVC-CUSTOMERS');
    expect(d.request('SCR-SVC-DRINK', 0)).toBe(true);
    expect(d.activeScreenId()).toBe('SCR-SVC-DRINK');
  });

  it('같은 화면 재요청은 무시한다', () => {
    const d = make('SCR-SVC-GRILL');
    expect(d.request('SCR-SVC-GRILL', 0)).toBe(false);
    expect(d.isTransitioning()).toBe(false);
  });

  it('전환 중에는 조작이 잠기고 완료 시 풀린다 (§71)', () => {
    const d = make('SCR-SVC-CUSTOMERS');
    d.request('SCR-SVC-GRILL', 1000);
    expect(d.isTransitioning()).toBe(true);
    expect(d.controlsLocked()).toBe(true);
    // 아직 진행 중
    d.tick(1200);
    expect(d.controlsLocked()).toBe(true);
    expect(d.progress(1150)).toBeCloseTo(0.5, 2);
    // 완료
    d.tick(1300);
    expect(d.isTransitioning()).toBe(false);
    expect(d.controlsLocked()).toBe(false);
    expect(d.progress(1300)).toBe(1);
  });

  it('급한 연속 전환은 마지막 목표로 수렴한다 (§104)', () => {
    const d = make('SCR-SVC-CUSTOMERS');
    d.request('SCR-SVC-ASSEMBLY', 0);
    d.request('SCR-SVC-GRILL', 50); // 전환 중 재요청
    d.request('SCR-SVC-DRINK', 100); // 또 재요청
    expect(d.activeScreenId()).toBe('SCR-SVC-DRINK'); // 마지막 목표
    expect(d.isTransitioning()).toBe(true);
    // 마지막 요청 시점(100) + 300 = 400에 완료. 그 전엔 여전히 전환 중.
    d.tick(300);
    expect(d.isTransitioning()).toBe(true);
    d.tick(400);
    expect(d.isTransitioning()).toBe(false);
    expect(d.activeScreenId()).toBe('SCR-SVC-DRINK'); // 중간에 고정되지 않음
  });

  it('전환이 아니면 progress는 1', () => {
    const d = make();
    expect(d.progress(0)).toBe(1);
  });
});
