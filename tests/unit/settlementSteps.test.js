import { describe, expect, it } from 'vitest';
import { D1_SETTLEMENT_STEPS } from '../../src/domain/businessDay/d1BusinessDay.js';
import { SETTLEMENT_STEP_LABEL, settlementStepDetail } from '../../src/render/settlementSteps.js';

const cleanDay = {
  customers: { visited: 4, lost: 0, cleanedSeats: 4 },
  orders: { accepted: 4, completed: 4, abandoned: 0 },
  quality: { Perfect: 6, Good: 2, OK: 0, Fail: 0 },
  wait: { averageMs: 8_400 },
  economy: { revenue: 33, tip: 8, total: 41, reputation: 12 },
  operations: { peakActiveOrders: 2, peakRiskProcesses: 0, disposedPreparedItems: 0, elapsedMs: 245_000 },
};

const roughDay = {
  ...cleanDay,
  customers: { visited: 5, lost: 2, cleanedSeats: 3 },
  orders: { accepted: 5, completed: 3, abandoned: 2 },
  quality: { Perfect: 1, Good: 0, OK: 2, Fail: 3 },
  economy: { revenue: 12, tip: 0, total: 12, reputation: -4 },
  operations: { ...cleanDay.operations, disposedPreparedItems: 3 },
};

const lines = (stepId, summary, context) => settlementStepDetail(stepId, summary, context).lines;

describe('정산 단계 내용', () => {
  it('다섯 단계 모두 내용을 만든다', () => {
    for (const stepId of D1_SETTLEMENT_STEPS) {
      const detail = settlementStepDetail(stepId, cleanDay, { nextDayLabel: 'D2' });
      expect(detail.label).toBe(SETTLEMENT_STEP_LABEL[stepId]);
      expect(detail.lines.length).toBeGreaterThan(0);
      expect(detail.lines.every((line) => line.trim().length > 0)).toBe(true);
    }
  });

  it('손님과 주문은 방문·수락·완료를 숫자로 보여준다', () => {
    expect(lines('customers-orders', cleanDay)[0]).toBe('방문 4명 · 주문 수락 4건 · 완료 4건');
    expect(lines('customers-orders', cleanDay)[1]).toContain('놓친 손님 없이');
    expect(lines('customers-orders', roughDay)[1]).toBe('놓친 손님 2명 · 포기된 주문 2건');
  });

  it('품질은 개수가 있는 등급만 나열하고 평균 대기를 초로 보여준다', () => {
    expect(lines('quality-wait', cleanDay)[0]).toBe('제공 8개 — Perfect 6 · Good 2');
    expect(lines('quality-wait', cleanDay)[1]).toBe('평균 대기 8.4초');
  });

  it('매출은 팁과 합계를, 폐기가 있으면 폐기 수량을 보여준다', () => {
    expect(lines('revenue-tip', cleanDay)[0]).toBe('매출 33 + 팁 8 = 41');
    expect(lines('revenue-tip', cleanDay)[1]).toContain('폐기한 준비품이 없습니다');
    expect(lines('revenue-tip', roughDay)[1]).toBe('남아서 폐기한 준비품 3개');
  });

  it('명성은 부호를 붙여 오르내림을 알 수 있게 한다', () => {
    expect(lines('reputation-review', cleanDay)[0]).toBe('오늘 명성 +12');
    expect(lines('reputation-review', roughDay)[0]).toBe('오늘 명성 -4');
    expect(lines('reputation-review', roughDay)[1]).toContain('깎았습니다');
  });

  it('마지막 단계는 해금과 다음 날을 알려준다', () => {
    const unlocked = lines('recipe-goal', cleanDay, { nextDayLabel: 'D2', unlockLabels: ['모모 레시피'] });
    expect(unlocked[0]).toBe('해금 · 모모 레시피');
    expect(unlocked[1]).toContain('D2');
    expect(lines('recipe-goal', cleanDay)[0]).toContain('해금된 레시피는 없습니다');
  });

  it('요약이 아직 없으면 빈 내용으로 둔다', () => {
    expect(settlementStepDetail('revenue-tip', null)).toEqual({
      label: SETTLEMENT_STEP_LABEL['revenue-tip'],
      lines: [],
    });
  });
});
