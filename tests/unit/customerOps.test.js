// 손님 운영 생애주기·재주문·그룹·러시 검증 (GPL-003).
import { describe, it, expect } from 'vitest';
import { createCustomerOps } from '../../src/render/customerOps.js';

const TYPES = [
  { id: 'solo', groupSize: 1, patienceSec: 60, tipMultiplier: 1, orderSequence: ['skewer'] },
  { id: 'regular', groupSize: 1, patienceSec: 100, tipMultiplier: 1, orderSequence: ['drink', 'skewer', 'skewer'] },
  { id: 'office', groupSize: 2, patienceSec: 60, tipMultiplier: 1.1, orderSequence: ['drink'] },
];
const SEATS = ['seat-01', 'seat-02', 'seat-03', 'seat-04', 'seat-05', 'seat-06'];
const BASE = { spawnIntervalSec: 12, orderThinkMin: 4, orderThinkMax: 6, eatSec: 15, leaveSec: 1, cleanupSec: 3, maxActive: 4, waveSize: 2 };
const make = (rng, over = {}) => createCustomerOps({ seatIds: SEATS, types: TYPES, config: { ...BASE, rng, ...over } });
const view = (ops, id, now) => ops.views(now).find((v) => v.seatId === id);

describe('createCustomerOps', () => {
  it('단일 손님 생애주기: 고민→주문→서빙→식사→퇴장→정리', () => {
    const ops = make(() => 0.9);
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-01', 'solo', 0, 5);
    ops.tick(5000);
    expect(view(ops, 'seat-01', 5000).phase).toBe('ordering');
    ops.acceptOrder('seat-01');
    expect(ops.serve('seat-01', { menu: '네기마', good: true }, 6000).ok).toBe(true);
    expect(view(ops, 'seat-01', 6000).phase).toBe('eating');
    ops.tick(6000 + 15000); // solo는 orderSeq 1개 → 재주문 없음 → 퇴장
    expect(view(ops, 'seat-01', 21000).phase).toBe('leaving');
    ops.tick(22000);
    expect(view(ops, 'seat-01', 22000).cleanupNeeded).toBe(true);
    expect(ops.cleanup('seat-01')).toBe(true);
    expect(view(ops, 'seat-01', 22000).occupied).toBe(false);
  });

  it('메뉴가 맞아야 서빙된다', () => {
    const ops = make(() => 0.9);
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-02', 'solo', 0, 0);
    ops.tick(1);
    ops.acceptOrder('seat-02');
    expect(ops.serve('seat-02', { menu: '생맥주', good: true }, 2).ok).toBe(false); // 네기마 주문
    expect(ops.serve('seat-02', { menu: '네기마', good: true }, 2).ok).toBe(true);
  });

  it('재주문: 만족도 100%면 확률 통과 시 다음 항목을 주문한다', () => {
    const ops = make(() => 0.1); // 0.1 < 0.4 → 재주문
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-03', 'regular', 0, 0); // orderSeq [drink,skewer,skewer]
    ops.tick(1);
    expect(view(ops, 'seat-03', 1).menu).toBe('생맥주');
    ops.acceptOrder('seat-03');
    ops.serve('seat-03', { menu: '생맥주', good: true }, 2); // 만족 100
    ops.tick(2 + 15000); // 식사 종료 → 재주문
    const v = view(ops, 'seat-03', 17002);
    expect(v.phase).toBe('thinking');
    expect(v.menu).toBe('네기마'); // 다음 항목(skewer)
  });

  it('재주문: 확률에 걸리면 퇴장한다', () => {
    const ops = make(() => 0.9); // 0.9 >= 0.4 → 재주문 없음
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-04', 'regular', 0, 0);
    ops.tick(1);
    ops.acceptOrder('seat-04');
    ops.serve('seat-04', { menu: '생맥주', good: true }, 2);
    ops.tick(2 + 15000);
    expect(view(ops, 'seat-04', 17002).phase).toBe('leaving');
  });

  it('2인 그룹: 인접 좌석에 함께 입장한다', () => {
    const ops = make(() => 0); // rng 0 → 항상 첫 후보(solo) … 그룹은 forceGroup으로 검증
    ops.setAutoSpawn(false);
    ops.forceGroup('seat-01', 'seat-02', 'office', 0, 0);
    ops.tick(1);
    expect(view(ops, 'seat-01', 1).group).toBe(true);
    expect(view(ops, 'seat-02', 1).group).toBe(true);
  });

  it('2인 그룹: 한 명의 인내심이 끝나면 동행도 함께 화난 퇴장한다 (§29)', () => {
    const ops = make(() => 0.9);
    ops.setAutoSpawn(false);
    ops.forceGroup('seat-01', 'seat-02', 'office', 0, 0);
    ops.tick(1); // 둘 다 ordering (patience 60)
    ops.acceptOrder('seat-01'); // 한 명은 접수만
    ops.tick(1 + 61000); // 인내심 초과
    expect(view(ops, 'seat-01', 62000).phase).toBe('leaving');
    expect(view(ops, 'seat-02', 62000).phase).toBe('leaving');
    expect(view(ops, 'seat-02', 62000).mood).toBe('retry');
  });

  it('2인 그룹: 둘 다 식사를 마치면 함께 퇴장한다 (§80)', () => {
    const ops = make(() => 0.9); // 재주문 없음(office orderSeq 1개라 어차피 없음)
    ops.setAutoSpawn(false);
    ops.forceGroup('seat-03', 'seat-04', 'office', 0, 0);
    ops.tick(1);
    for (const s of ['seat-03', 'seat-04']) { ops.acceptOrder(s); ops.serve(s, { menu: '생맥주', good: true }, 2); }
    // 한 명 먼저 식사 종료 → done, 동행은 아직 식사 중이면 함께 안 나간다
    ops.tick(2 + 15000);
    // 둘 다 같은 시각에 식사 종료 → 둘 다 leaving
    expect(view(ops, 'seat-03', 17002).phase).toBe('leaving');
    expect(view(ops, 'seat-04', 17002).phase).toBe('leaving');
  });

  it('러시: 파동마다 활성 상한까지 채우고 상한에서 멈춘다', () => {
    const ops = make(() => 0); // 항상 solo(단일) 입장
    let t = 0;
    ops.tick(t); // 첫 파동: waveSize 2
    expect(ops.activeCount()).toBe(2);
    t += 12000; ops.tick(t); // 두 번째 파동: +2 → 4 (maxActive)
    expect(ops.activeCount()).toBe(4);
    t += 12000; ops.tick(t); // 상한에서 멈춤
    expect(ops.activeCount()).toBe(4);
  });

  it('debugElapse로 마감시각을 앞당긴다', () => {
    const ops = make(() => 0.9);
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-01', 'solo', 0, 5);
    ops.debugElapse(5);
    ops.tick(0);
    expect(view(ops, 'seat-01', 0).phase).toBe('ordering');
  });
});
