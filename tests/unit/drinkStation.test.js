// 생맥주 따르기 판정 검증 (GPL-004 §41,44,49-2).
import { describe, it, expect } from 'vitest';
import { createDrinkPour } from '../../src/render/drinkStation.js';

// 특정 시간만큼 한 존을 흘린다.
function pour(p, zone, seconds, t0 = 0) {
  p.press(zone, t0);
  p.release(t0 + seconds * 1000);
  return t0 + seconds * 1000;
}

describe('createDrinkPour', () => {
  it('맥주·거품 모두 적정이면 Perfect', () => {
    const p = createDrinkPour();
    let t = pour(p, 'beer', 3.0);
    pour(p, 'foam', 1.0, t);
    expect(p.finish()).toBe('Perfect');
    const s = p.state();
    expect(s.beerOk).toBe(true);
    expect(s.foamOk).toBe(true);
  });

  it('한 단계만 범위를 벗어나면 Good', () => {
    const p = createDrinkPour();
    let t = pour(p, 'beer', 3.0); // 적정
    pour(p, 'foam', 0.1, t); // 거품 부족(범위 밖)
    expect(p.finish()).toBe('Good');
  });

  it('두 단계 모두 벗어나면 OK', () => {
    const p = createDrinkPour();
    let t = pour(p, 'beer', 1.5, 0); // 맥주 부족
    pour(p, 'foam', 0.1, t); // 거품 부족
    expect(p.finish()).toBe('OK');
  });

  it('총 4.7초를 넘으면 넘침으로 자동 차단된다', () => {
    const p = createDrinkPour();
    p.press('beer', 0);
    p.tick(5000); // 5초 계속 → cap 초과
    const s = p.state();
    expect(s.overflow).toBe(true);
    expect(s.phase).toBe('overflow');
    expect(s.totalSec).toBeCloseTo(4.7, 2); // cap으로 잘림
    expect(s.active).toBeNull(); // 흐름 차단
  });

  it('넘친 잔을 낮은 품질 제공하면 Fail, 폐기하면 완성품 없음', () => {
    const p = createDrinkPour();
    p.press('beer', 0); p.tick(5000);
    expect(p.serveOverflow()).toBe('Fail');

    const p2 = createDrinkPour();
    p2.press('beer', 0); p2.tick(5000);
    expect(p2.discard()).toBeNull();
    expect(p2.state().phase).toBe('done');
  });

  it('넘침 상태에서는 더 눌러도 흐르지 않는다', () => {
    const p = createDrinkPour();
    p.press('beer', 0); p.tick(5000);
    const before = p.state().totalSec;
    p.press('foam', 5000); p.tick(6000);
    expect(p.state().totalSec).toBeCloseTo(before, 5);
  });
});
