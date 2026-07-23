import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runBusinessDay, cookTimePerOrder } from '../../tools/simulator.js';

// 도구가 편집하는 기본 데이터로 시뮬레이터를 검증한다.
const DATA = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../tools/balance-data.json', import.meta.url)), 'utf-8'),
);

// 값 하나를 바꾼 사본을 만든다.
function withValue(group, key, value) {
  const copy = structuredClone(DATA);
  copy.groups[group][key].value = value;
  return copy;
}

describe('로직 시뮬레이터', () => {
  it('같은 수치·같은 시드는 같은 결과를 낸다 (SYS-005 §11)', () => {
    const a = runBusinessDay(DATA, 42);
    const b = runBusinessDay(DATA, 42);
    expect(a).toEqual(b);
  });

  it('시드가 다르면 품질 분포가 달라질 수 있다', () => {
    const a = runBusinessDay(DATA, 1);
    const b = runBusinessDay(DATA, 999);
    // 총 서빙 수는 시간 기반이라 같지만 품질(무작위)은 갈릴 수 있다
    expect(a.served).toBe(b.served);
    expect(a.good + a.low).toBe(a.served);
  });

  it('인내심이 낮으면 이탈이 늘어난다', () => {
    const patient = runBusinessDay(withValue('손님', 'patienceSec', 60), 7);
    const impatient = runBusinessDay(withValue('손님', 'patienceSec', 10), 7);
    expect(impatient.left).toBeGreaterThan(patient.left);
  });

  it('조리 시간이 길어지면 대기와 이탈이 늘어난다', () => {
    const fast = runBusinessDay(withValue('조리', 'perfectStartSec', 1.0), 7);
    const slow = runBusinessDay(withValue('조리', 'perfectStartSec', 5.0), 7);
    expect(slow.cookTimePerOrderSec).toBeGreaterThan(fast.cookTimePerOrderSec);
    expect(slow.left).toBeGreaterThanOrEqual(fast.left);
  });

  it('적정 성공률이 높으면 좋음 품질 비중이 커진다', () => {
    const sloppy = runBusinessDay(withValue('자동정책', 'successRate', 0.2), 7);
    const skilled = runBusinessDay(withValue('자동정책', 'successRate', 1.0), 7);
    expect(skilled.good).toBeGreaterThan(sloppy.good);
    expect(skilled.low).toBe(0); // 성공률 1이면 과다가 없다
  });

  it('판매가는 품질에, 팁은 대기 잔량에 반영된다 (역할 분리)', () => {
    const cheap = runBusinessDay(withValue('경제', 'basePrice', 50), 7);
    const pricey = runBusinessDay(withValue('경제', 'basePrice', 300), 7);
    // 판매가만 바뀌면 팁은 그대로여야 한다
    expect(pricey.tip).toBe(cheap.tip);
    expect(pricey.revenue).toBeGreaterThan(cheap.revenue);
  });

  it('cookTimePerOrder는 조립·양면·식사 시간을 합친다', () => {
    // perfect 2.5, over 5.5 → perSide = 2.5 + 0.4*3 = 3.7, 조립 2, 식사 1.5
    // 합 = 2 + 2*3.7 + 1.5 = 10.9
    expect(cookTimePerOrder(DATA)).toBeCloseTo(10.9, 1);
  });
});
