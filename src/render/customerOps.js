// 손님 운영 상태 머신 (순수 로직, GPL-003 §48-166).
//
// 좌석 생애주기: 비어있음 → 착석·고민(4-6초 `...`) → 주문 중(주문서) → 수령 대기(인내심 감소)
// → 서빙 → 식사 → (재주문 or 퇴장) → 정리(3초) → 비어있음.
// 심화: 재주문(orderSequence 진행·만족도별 확률 §27,126), 2인 그룹(인접 2좌석·공동 퇴장 §78,80,29),
// 러시(파동식 입장·활성 상한 §41). 렌더는 customerAdapter가, 수치는 콘텐츠가 소유한다.

import { mulberry32 } from '../state/businessDay.js';

const MENU = { skewer: '네기마', drink: '생맥주' };
// 재주문 확률: 만족도(§126, candidate). 100%→0.4, 70~99%→0.2, 그 미만→0.
function reorderProb(satisfaction) {
  if (satisfaction >= 100) return 0.4;
  if (satisfaction >= 70) return 0.2;
  return 0;
}

export function createCustomerOps({ seatIds, types, config = {} }) {
  const cfg = {
    spawnIntervalMs: (config.spawnIntervalSec ?? 12) * 1000,
    thinkMinMs: (config.orderThinkMin ?? 4) * 1000,
    thinkMaxMs: (config.orderThinkMax ?? 6) * 1000,
    eatMs: (config.eatSec ?? 15) * 1000,
    leaveMs: (config.leaveSec ?? 1) * 1000,
    cleanupMs: (config.cleanupSec ?? 3) * 1000,
    maxActive: config.maxActive ?? 4,
    waveSize: config.waveSize ?? 2, // 한 파동에 시도하는 최대 입장 수(러시)
  };
  const rng = config.rng ?? mulberry32(config.seed ?? 1); // 재현 가능한 난수(§176)
  const seats = new Map(seatIds.map((id) => [id, null]));
  let lastSpawnMs = 0;
  let started = false;
  let autoSpawn = true;
  let records = [];
  let groupSeq = 0;
  let reorderOverride = null; // 'always' | 'never' | null (테스트 결정론)

  const activeCount = () => seatIds.filter((id) => seats.get(id)).length;
  const emptySeats = () => seatIds.filter((id) => !seats.get(id));
  const pickRng = (arr) => arr[Math.floor(rng() * arr.length)];
  const thinkMs = () => cfg.thinkMinMs + rng() * (cfg.thinkMaxMs - cfg.thinkMinMs);

  function makeCustomer(now, type, groupId) {
    const seq = type.orderSequence && type.orderSequence.length ? type.orderSequence : ['skewer'];
    return {
      typeId: type.id,
      orderSeq: seq,
      orderIndex: 0,
      menu: MENU[seq[0]] ?? '네기마',
      groupId: groupId ?? null,
      phase: 'thinking',
      mood: 'waiting',
      phaseUntil: now + thinkMs(),
      patienceMs: (type.patienceSec ?? 60) * 1000,
      patienceUntil: null,
      tipMultiplier: type.tipMultiplier ?? 1,
      lastSatisfaction: 0,
      served: false,
    };
  }

  // 인접한(연속 인덱스) 빈 좌석 쌍을 찾는다 (§10,11).
  function adjacentEmptyPair() {
    for (let i = 0; i < seatIds.length - 1; i++) {
      if (!seats.get(seatIds[i]) && !seats.get(seatIds[i + 1])) return [seatIds[i], seatIds[i + 1]];
    }
    return null;
  }

  function spawnSingle(now, seatId, type) {
    seats.set(seatId, makeCustomer(now, type, null));
  }
  function spawnGroup(now, pair, type) {
    const gid = `g${++groupSeq}`;
    seats.set(pair[0], makeCustomer(now, type, gid));
    seats.set(pair[1], makeCustomer(now, type, gid));
  }

  // 한 번의 입장 시도. 성공하면 채운 인원 수를 반환.
  function trySpawnOne(now) {
    const type = pickRng(types.filter((t) => t.active !== false));
    if (!type) return 0;
    if (type.groupSize === 2) {
      const pair = adjacentEmptyPair();
      if (pair && activeCount() + 2 <= cfg.maxActive) { spawnGroup(now, pair, type); return 2; }
      // 인접석이 없으면 이번 파동은 단일 손님으로 대체(§166 분리 착석 금지)
      const singles = types.filter((t) => t.groupSize === 1 && t.active !== false);
      const empty = emptySeats();
      if (singles.length && empty.length && activeCount() < cfg.maxActive) { spawnSingle(now, pickRng(empty), pickRng(singles)); return 1; }
      return 0;
    }
    const empty = emptySeats();
    if (empty.length && activeCount() < cfg.maxActive) { spawnSingle(now, pickRng(empty), type); return 1; }
    return 0;
  }

  function tick(now) {
    if (!started) { started = true; lastSpawnMs = now - cfg.spawnIntervalMs; }

    // 입장(파동): 한 간격마다 waveSize만큼 채우려 시도하되 활성 상한을 넘기지 않는다.
    if (autoSpawn && now - lastSpawnMs >= cfg.spawnIntervalMs) {
      let filled = 0;
      for (let i = 0; i < cfg.waveSize; i++) {
        if (activeCount() >= cfg.maxActive) break;
        const n = trySpawnOne(now);
        if (n === 0) break;
        filled += n;
      }
      if (filled > 0) lastSpawnMs = now;
    }

    // 개별 진행
    for (const id of seatIds) {
      const c = seats.get(id);
      if (!c) continue;
      if (c.phase === 'thinking' && now >= c.phaseUntil) {
        c.phase = 'ordering';
        c.patienceUntil = now + c.patienceMs;
      } else if ((c.phase === 'ordering' || c.phase === 'waiting') && c.patienceUntil != null && now >= c.patienceUntil) {
        leaveAngry(c, now); // 인내심 초과 → 화난 퇴장
      } else if (c.phase === 'eating' && now >= c.phaseUntil) {
        finishMeal(c, now); // 재주문 판정
      } else if (c.phase === 'leaving' && now >= c.phaseUntil) {
        c.phase = 'cleanup';
      }
    }

    syncGroups(now);
  }

  function leaveAngry(c, now) {
    if (!c.served) records.push({ served: false, tipMultiplier: c.tipMultiplier });
    c.phase = 'leaving';
    c.mood = 'retry';
    c.served = false;
    c.phaseUntil = now + cfg.leaveMs;
  }

  // 식사 종료(§27): 다음 항목이 있고 만족도별 확률을 통과하면 재주문, 아니면 완료.
  function finishMeal(c, now) {
    const hasNext = c.orderIndex + 1 < c.orderSeq.length;
    const roll = reorderOverride === 'always' ? true : reorderOverride === 'never' ? false : rng() < reorderProb(c.lastSatisfaction);
    if (hasNext && roll) {
      c.orderIndex += 1;
      c.menu = MENU[c.orderSeq[c.orderIndex]] ?? '네기마';
      c.phase = 'thinking';
      c.phaseUntil = now + thinkMs();
      c.patienceUntil = null;
      c.served = false;
      return;
    }
    // 완료: 그룹이면 동행을 기다리고(done), 단일이면 바로 퇴장.
    if (c.groupId) { c.phase = 'done'; }
    else { c.phase = 'leaving'; c.phaseUntil = now + cfg.leaveMs; }
  }

  // 그룹 동기화: 한 명이 화나서 떠나면 동행도 즉시(§29), 모두 완료면 함께 퇴장(§80).
  function syncGroups(now) {
    const groups = new Map();
    for (const id of seatIds) {
      const c = seats.get(id);
      if (c && c.groupId) {
        if (!groups.has(c.groupId)) groups.set(c.groupId, []);
        groups.get(c.groupId).push(c);
      }
    }
    for (const members of groups.values()) {
      const angry = members.some((m) => m.phase === 'leaving' && m.mood === 'retry');
      if (angry) {
        for (const m of members) {
          if (m.phase !== 'leaving' && m.phase !== 'cleanup') leaveAngry(m, now);
        }
        continue;
      }
      const allSettled = members.every((m) => m.phase === 'done' || m.phase === 'leaving' || m.phase === 'cleanup');
      if (allSettled && members.some((m) => m.phase === 'done')) {
        for (const m of members) if (m.phase === 'done') { m.phase = 'leaving'; m.phaseUntil = now + cfg.leaveMs; }
      }
    }
  }

  function acceptOrder(id) {
    const c = seats.get(id);
    if (c && c.phase === 'ordering') { c.phase = 'waiting'; return true; }
    return false;
  }

  function serve(id, item, now) {
    const c = seats.get(id);
    if (!c || c.phase !== 'waiting') return { ok: false, reason: 'not-waiting' };
    if (!item || item.menu !== c.menu) return { ok: false, reason: 'mismatch' };
    c.mood = item.good ? 'satisfied' : 'neutral';
    c.served = true;
    c.lastSatisfaction = item.good ? 100 : 40;
    const waitSec = c.patienceUntil != null ? (c.patienceMs - (c.patienceUntil - now)) / 1000 : 0;
    records.push({ served: true, good: !!item.good, waitSec: Math.max(0, waitSec), patienceSec: c.patienceMs / 1000, tipMultiplier: c.tipMultiplier });
    c.phase = 'eating';
    c.phaseUntil = now + cfg.eatMs;
    c.patienceUntil = null;
    return { ok: true };
  }

  function cleanup(id) {
    const c = seats.get(id);
    if (c && c.phase === 'cleanup') { seats.set(id, null); return true; }
    return false;
  }

  function views(now) {
    return seatIds.map((id) => {
      const c = seats.get(id);
      if (!c) return { seatId: id, occupied: false, phase: 'empty', mood: 'waiting', orderLabel: '', waitRatio: 0 };
      const counting = (c.phase === 'ordering' || c.phase === 'waiting') && c.patienceUntil != null;
      const waitRatio = counting ? Math.max(0, Math.min(1, (c.patienceUntil - now) / c.patienceMs)) : 1;
      return {
        seatId: id,
        occupied: true,
        phase: c.phase,
        mood: c.mood,
        menu: c.menu,
        orderLabel: c.menu,
        waitRatio,
        group: !!c.groupId,
        thinking: c.phase === 'thinking',
        canOrder: c.phase === 'ordering',
        canServe: c.phase === 'waiting',
        cleanupNeeded: c.phase === 'cleanup',
      };
    });
  }

  // ── 테스트·데모 훅 ──────────────────────────────────────────
  function debugElapse(sec) {
    const ms = sec * 1000;
    lastSpawnMs -= ms;
    for (const id of seatIds) {
      const c = seats.get(id);
      if (!c) continue;
      if (c.phaseUntil != null) c.phaseUntil -= ms;
      if (c.patienceUntil != null) c.patienceUntil -= ms;
    }
  }
  function forceSpawn(seatId, typeId, now, thinkSec = 5) {
    const type = types.find((t) => t.id === typeId) || types.find((t) => t.groupSize === 1);
    const c = makeCustomer(now, type, null);
    c.phaseUntil = now + thinkSec * 1000;
    seats.set(seatId, c);
  }
  function forceGroup(seatA, seatB, typeId, now, thinkSec = 5) {
    const type = types.find((t) => t.id === typeId) || types.find((t) => t.groupSize === 2);
    const gid = `g${++groupSeq}`;
    for (const s of [seatA, seatB]) {
      const c = makeCustomer(now, type, gid);
      c.phaseUntil = now + thinkSec * 1000;
      seats.set(s, c);
    }
  }

  function clearAll() { for (const id of seatIds) seats.set(id, null); }
  function resetDay() { clearAll(); records = []; }
  return {
    tick, acceptOrder, serve, cleanup, views, debugElapse, forceSpawn, forceGroup, clearAll, resetDay,
    setReorderOverride: (v) => { reorderOverride = v; },
    records: () => records.slice(),
    setAutoSpawn: (v) => { autoSpawn = v; }, getSeat: (id) => seats.get(id), activeCount, cfg,
  };
}
