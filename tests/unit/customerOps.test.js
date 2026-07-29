// 손님 운영 생애주기 검증 (GPL-003 §48-97).
import { describe, it, expect } from 'vitest';
import { createCustomerOps } from '../../src/render/customerOps.js';

const TYPES = [
  { id: 'solo', groupSize: 1, patienceSec: 60, orderSequence: ['skewer'] },
  { id: 'regular', groupSize: 1, patienceSec: 100, orderSequence: ['drink'] },
  { id: 'office', groupSize: 2, patienceSec: 60, orderSequence: ['skewer'] },
];
const CFG = { spawnIntervalSec: 12, orderThinkMin: 4, orderThinkMax: 6, eatSec: 15, leaveSec: 1, cleanupSec: 3, maxActive: 3 };
const make = () => createCustomerOps({ seatIds: ['seat-01', 'seat-02', 'seat-03'], types: TYPES, config: CFG });
const view = (ops, id, now) => ops.views(now).find((v) => v.seatId === id);

describe('createCustomerOps', () => {
  it('고민→주문→수령대기→서빙→식사→퇴장→정리→빈자리 생애주기', () => {
    const ops = make();
    ops.forceSpawn('seat-01', 'solo', 0, 5); // 5초 고민, 네기마
    expect(view(ops, 'seat-01', 0).phase).toBe('thinking');
    expect(view(ops, 'seat-01', 0).menu).toBe('네기마');

    ops.tick(5000); // 고민 종료
    expect(view(ops, 'seat-01', 5000).phase).toBe('ordering');
    expect(view(ops, 'seat-01', 5000).canOrder).toBe(true);

    expect(ops.acceptOrder('seat-01')).toBe(true); // 주문 접수
    expect(view(ops, 'seat-01', 5000).canServe).toBe(true);

    // 메뉴가 맞아야 서빙된다
    expect(ops.serve('seat-01', { menu: '생맥주', good: true }, 6000).ok).toBe(false);
    expect(ops.serve('seat-01', { menu: '네기마', good: true }, 6000).ok).toBe(true);
    expect(view(ops, 'seat-01', 6000).phase).toBe('eating');
    expect(view(ops, 'seat-01', 6000).mood).toBe('satisfied');

    ops.tick(6000 + 15000); // 식사 종료 → 퇴장
    expect(view(ops, 'seat-01', 21000).phase).toBe('leaving');
    ops.tick(21000 + 1000); // 퇴장 → 정리 필요
    expect(view(ops, 'seat-01', 22000).phase).toBe('cleanup');
    expect(view(ops, 'seat-01', 22000).cleanupNeeded).toBe(true);

    expect(ops.cleanup('seat-01')).toBe(true); // 정리 완료
    expect(view(ops, 'seat-01', 22000).occupied).toBe(false);
  });

  it('인내심을 넘기면 화난 채로 떠난다', () => {
    const ops = make();
    ops.forceSpawn('seat-02', 'solo', 0, 5);
    ops.tick(5000); // ordering, patience 60s 시작
    // 서빙 없이 인내심 초과
    ops.tick(5000 + 61000);
    const v = view(ops, 'seat-02', 66000);
    expect(v.phase).toBe('leaving');
    expect(v.mood).toBe('retry');
  });

  it('수령 대기 게이지는 시간이 지날수록 준다', () => {
    const ops = make();
    ops.forceSpawn('seat-03', 'solo', 0, 0);
    ops.tick(0); // ordering, patience 60s
    ops.acceptOrder('seat-03');
    const r0 = view(ops, 'seat-03', 0).waitRatio;
    const r30 = view(ops, 'seat-03', 30000).waitRatio;
    expect(r0).toBeCloseTo(1, 2);
    expect(r30).toBeCloseTo(0.5, 1);
  });

  it('자동 입장은 빈 좌석을 채우고 maxActive에서 멈춘다', () => {
    const ops = make();
    let t = 0;
    ops.tick(t); // 첫 손님 즉시
    expect(ops.activeCount()).toBe(1);
    for (let i = 0; i < 5; i++) { t += 12000; ops.tick(t); }
    expect(ops.activeCount()).toBe(3); // maxActive 3에서 멈춤
  });

  it('2인 그룹 유형은 (증분 5에서) 입장시키지 않는다', () => {
    const ops = createCustomerOps({ seatIds: ['seat-01'], types: [TYPES[2]], config: CFG });
    let t = 0;
    for (let i = 0; i < 3; i++) { ops.tick(t); t += 12000; }
    expect(ops.activeCount()).toBe(0); // office(그룹)만 있으면 아무도 안 옴
  });

  it('debugElapse로 마감시각을 앞당길 수 있다', () => {
    const ops = make();
    ops.forceSpawn('seat-01', 'solo', 0, 5);
    ops.debugElapse(5); // 고민 5초 경과 시뮬레이션
    ops.tick(0);
    expect(view(ops, 'seat-01', 0).phase).toBe('ordering');
  });
});
