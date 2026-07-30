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

  it('Fail 품질을 내면 손님이 즉시 화난 채로 떠난다', () => {
    const ops = make(() => 0.9);
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-01', 'solo', 0, 0);
    ops.tick(1);
    ops.acceptOrder('seat-01');
    const r = ops.serve('seat-01', { menu: '네기마', good: false, label: 'Fail' }, 2);
    expect(r.ok).toBe(true);
    expect(r.left).toBe(true);
    const v = view(ops, 'seat-01', 3);
    expect(v.phase).toBe('leaving');
    expect(v.mood).toBe('retry');
    expect(ops.records().some((x) => x.served === false)).toBe(true); // 이탈로 기록
  });

  it('낮은 품질(과다)은 중립으로 받아 먹는다', () => {
    const ops = make(() => 0.9);
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-02', 'solo', 0, 0);
    ops.tick(1);
    ops.acceptOrder('seat-02');
    const r = ops.serve('seat-02', { menu: '네기마', good: false, label: '과다' }, 2);
    expect(r.ok).toBe(true);
    expect(r.quality).toBe('ok');
    expect(view(ops, 'seat-02', 2).phase).toBe('eating');
    expect(view(ops, 'seat-02', 2).mood).toBe('neutral');
  });

  it('오배달(다른 메뉴 제공)은 인내심을 깎는다', () => {
    const ops = make(() => 0.9, { misservePenaltySec: 10 });
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-03', 'solo', 0, 0);
    ops.tick(1);
    ops.acceptOrder('seat-03'); // 수령 대기(인내심 카운트)
    const before = ops.getSeat('seat-03').patienceUntil;
    ops.serve('seat-03', { menu: '생맥주', good: true }, 2); // 네기마 주문인데 생맥주
    expect(ops.getSeat('seat-03').patienceUntil).toBe(before - 10000);
  });

  it('부분 서빙: 수량이 여러 개면 전량을 채워야 식사한다', () => {
    const ops = createCustomerOps({
      seatIds: SEATS,
      types: [{ id: 'double', groupSize: 1, patienceSec: 100, tipMultiplier: 1, orderSequence: ['skewer', 'skewer'] }],
      config: { ...BASE, rng: () => 0.9 },
    });
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-01', 'double', 0, 0);
    ops.tick(1);
    expect(view(ops, 'seat-01', 1).qtyNeeded).toBe(2);
    ops.acceptOrder('seat-01');
    // 1개 제공 → 부분(아직 대기)
    const r1 = ops.serve('seat-01', { menu: '네기마', good: true }, 2);
    expect(r1.partial).toBe(true);
    expect(r1.remaining).toBe(1);
    expect(view(ops, 'seat-01', 2).phase).toBe('waiting');
    expect(view(ops, 'seat-01', 2).orderLabel).toBe('네기마 1/2');
    // 2개째 제공 → 전량 → 식사
    const r2 = ops.serve('seat-01', { menu: '네기마', good: true }, 3);
    expect(r2.partial).toBeFalsy();
    expect(view(ops, 'seat-01', 3).phase).toBe('eating');
  });

  it('부분 서빙은 대기 인내심을 회복한다', () => {
    const ops = createCustomerOps({
      seatIds: SEATS,
      types: [{ id: 'double', groupSize: 1, patienceSec: 100, tipMultiplier: 1, orderSequence: ['skewer', 'skewer'] }],
      config: { ...BASE, waitRecoverySec: 10, rng: () => 0.9 },
    });
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-01', 'double', 0, 0);
    ops.tick(1);
    ops.acceptOrder('seat-01');
    ops.debugElapse(30); // 인내심 30초 소모
    const before = ops.getSeat('seat-01').patienceUntil;
    ops.serve('seat-01', { menu: '네기마', good: true }, 2); // 부분(1/2) → 10초 회복
    expect(ops.getSeat('seat-01').patienceUntil).toBe(before + 10000);
  });

  it('남은 인내심이 임계 이하이면 긴급으로 표시한다', () => {
    const ops = make(() => 0.9, { urgentThresholdSec: 15 });
    ops.setAutoSpawn(false);
    ops.forceSpawn('seat-01', 'solo', 0, 0); // 인내심 60초
    ops.tick(1);
    expect(view(ops, 'seat-01', 1).urgent).toBe(false); // 남은 ~60초
    ops.debugElapse(50); // 남은 ~10초 ≤ 15초
    expect(view(ops, 'seat-01', 1).urgent).toBe(true);
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

  it('좌석 수(capacity)를 넘겨 앉히지 않는다', () => {
    const ops = make(() => 0.5); // regular 단일 손님을 뽑는 고정 난수
    ops.setCapacity(2); // 좌석 2개만 활성
    ops.setAutoSpawn(true);
    for (let t = 0; t < 5; t += 1) ops.tick(t * 13000); // 여러 입장 파동
    const occupied = SEATS.filter((id) => ops.getSeat(id)).length;
    expect(occupied).toBeLessThanOrEqual(2);
    expect(ops.getSeat('seat-03')).toBeNull(); // 3번 이후는 비활성
    // 좌석을 늘리면 그 자리도 채울 수 있다
    ops.setCapacity(4);
    ops.tick(6 * 13000);
    expect(SEATS.filter((id) => ops.getSeat(id)).length).toBeGreaterThan(2);
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
