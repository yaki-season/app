// 손님 운영 상태 머신 (순수 로직, GPL-003 §48-97).
//
// 좌석 생애주기: 비어있음 → 착석·고민(4-6초 `...`) → 주문 중(주문서) → 수령 대기(인내심 감소)
// → 서빙 → 식사 → 퇴장 → 정리(3초) → 비어있음. 단일 손님만 다루며 2인 그룹·재주문·러시·대기
// 회복은 후속. 이 모듈은 규칙·타이밍만 다루고 렌더는 customerAdapter가, 수치는 콘텐츠가 소유한다.

const MENU = { skewer: '네기마', drink: '생맥주' };

export function createCustomerOps({ seatIds, types, config = {} }) {
  const cfg = {
    spawnIntervalMs: (config.spawnIntervalSec ?? 12) * 1000,
    thinkMinMs: (config.orderThinkMin ?? 4) * 1000,
    thinkMaxMs: (config.orderThinkMax ?? 6) * 1000,
    eatMs: (config.eatSec ?? 15) * 1000,
    leaveMs: (config.leaveSec ?? 1) * 1000,
    cleanupMs: (config.cleanupSec ?? 3) * 1000,
    maxActive: config.maxActive ?? 3,
  };
  const singleTypes = types.filter((t) => t.groupSize === 1);
  const seats = new Map(seatIds.map((id) => [id, null]));
  let lastSpawnMs = 0;
  let started = false;
  let autoSpawn = true; // 테스트에서 끌 수 있음(결정론)
  let records = []; // 영업일 결과 기록 (정산용): { served, good, waitSec, patienceSec, tipMultiplier }

  const activeCount = () => seatIds.filter((id) => seats.get(id)).length;
  const emptySeats = () => seatIds.filter((id) => !seats.get(id));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function spawnAt(now, seatId, type, thinkMs) {
    seats.set(seatId, {
      typeId: type.id,
      menu: MENU[type.orderSequence[0]] ?? '네기마',
      phase: 'thinking',
      mood: 'waiting',
      phaseUntil: now + thinkMs,
      patienceMs: (type.patienceSec ?? 60) * 1000,
      patienceUntil: null,
      tipMultiplier: type.tipMultiplier ?? 1,
      served: false,
    });
    lastSpawnMs = now;
  }

  function tick(now) {
    if (!started) { started = true; lastSpawnMs = now - cfg.spawnIntervalMs; } // 첫 손님은 곧 입장
    // 입장
    if (autoSpawn && now - lastSpawnMs >= cfg.spawnIntervalMs && activeCount() < cfg.maxActive) {
      const empties = emptySeats();
      if (empties.length && singleTypes.length) {
        const think = cfg.thinkMinMs + Math.random() * (cfg.thinkMaxMs - cfg.thinkMinMs);
        spawnAt(now, pick(empties), pick(singleTypes), think);
      }
    }
    // 진행
    for (const id of seatIds) {
      const c = seats.get(id);
      if (!c) continue;
      if (c.phase === 'thinking' && now >= c.phaseUntil) {
        c.phase = 'ordering';
        c.patienceUntil = now + c.patienceMs;
      } else if ((c.phase === 'ordering' || c.phase === 'waiting') && c.patienceUntil != null && now >= c.patienceUntil) {
        c.phase = 'leaving'; // 인내심 초과 → 화난 퇴장
        c.mood = 'retry';
        c.served = false;
        c.phaseUntil = now + cfg.leaveMs;
        records.push({ served: false, tipMultiplier: c.tipMultiplier }); // 이탈 기록
      } else if (c.phase === 'eating' && now >= c.phaseUntil) {
        c.phase = 'leaving';
        c.phaseUntil = now + cfg.leaveMs;
      } else if (c.phase === 'leaving' && now >= c.phaseUntil) {
        c.phase = 'cleanup'; // 빈 식기 → 정리 필요
      }
    }
  }

  // 주문서를 눌러 접수 → 수령 대기.
  function acceptOrder(id) {
    const c = seats.get(id);
    if (c && c.phase === 'ordering') { c.phase = 'waiting'; return true; }
    return false;
  }

  // 완성품을 좌석에 냄. 메뉴가 맞아야 하며, 품질로 만족/아쉬움을 정한다.
  function serve(id, item, now) {
    const c = seats.get(id);
    if (!c || c.phase !== 'waiting') return { ok: false, reason: 'not-waiting' };
    if (!item || item.menu !== c.menu) return { ok: false, reason: 'mismatch' };
    c.mood = item.good ? 'satisfied' : 'neutral';
    c.served = true;
    // 대기 시간 = 인내심 - 남은 인내심 (정산 팁 계산용)
    const waitSec = c.patienceUntil != null ? (c.patienceMs - (c.patienceUntil - now)) / 1000 : 0;
    records.push({ served: true, good: !!item.good, waitSec: Math.max(0, waitSec), patienceSec: c.patienceMs / 1000, tipMultiplier: c.tipMultiplier });
    c.phase = 'eating';
    c.phaseUntil = now + cfg.eatMs;
    c.patienceUntil = null;
    return { ok: true };
  }

  // 정리 필요 좌석을 정리(3초 홀드 완료 시 호출) → 비어있음.
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
    const type = types.find((t) => t.id === typeId) || singleTypes[0];
    spawnAt(now, seatId, type, thinkSec * 1000);
  }

  function clearAll() { for (const id of seatIds) seats.set(id, null); }
  function resetDay() { clearAll(); records = []; }
  return {
    tick, acceptOrder, serve, cleanup, views, debugElapse, forceSpawn, clearAll, resetDay,
    records: () => records.slice(),
    setAutoSpawn: (v) => { autoSpawn = v; }, getSeat: (id) => seats.get(id), activeCount, cfg,
  };
}
