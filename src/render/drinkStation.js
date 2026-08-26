// 생맥주 따르기 상태 머신 (순수 로직, GPL-004 §34-46,49-2).
//
// 단일 레버 순차: 아래 영역을 누르는 동안 맥주, 위 영역을 누르는 동안 거품이 흐른다. 손을 떼면 멈춘다.
// 총 채움이 4.7초를 넘으면 넘침으로 자동 차단하고, 플레이어가 낮은 품질 제공/폐기를 고른다.
// 판정 소유는 이 모듈이 아니라 GPL-004 수치이며, 아래 상수는 그 정본값이다(추후 content 이관 후보).

export const DRINK = {
  beerTargetSec: 3,
  foamTargetSec: 1,
  beerRange: [2.3, 3.7], // 맥주 적정(초), 목표 3.0
  foamRange: [0.3, 1.7], // 거품 적정(초), 목표 1.0
  beerVisualShare: 0.7, // 시각 정본: 맥주 7 : 거품 3
  foamVisualShare: 0.3,
  glassCapacity: 4.0, // 잔이 시각적으로 가득 차는 목표량(맥주 3.0초 + 거품 1.0초)
  totalCap: 4.7, // 총 채움 넘침 임계(초) = 목표 4.0 + 0.7
};

const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
const clamp01 = (value) => Math.max(0, Math.min(1, value));

// 품질 판정은 홀드 시간(3초·1초), 잔 내부 표현은 시각 정본(7:3)을 사용한다.
// 두 값을 동일한 비율로 취급하면 3초·1초가 잘못된 3:1 시각 비율로 노출된다.
export function drinkVisualFill(state, config = DRINK) {
  const beerFill = clamp01(
    (Math.max(0, Number(state?.beerSec) || 0) / config.beerTargetSec) * config.beerVisualShare,
  );
  const foamFill = Math.min(
    1 - beerFill,
    clamp01((Math.max(0, Number(state?.foamSec) || 0) / config.foamTargetSec) * config.foamVisualShare),
  );
  return Object.freeze({ beerFill, foamFill, totalFill: beerFill + foamFill });
}

export function createDrinkPour(config = DRINK) {
  let beerMs = 0;
  let foamMs = 0;
  let active = null; // 'beer' | 'foam' | null
  let lastNow = 0;
  let overflow = false;
  let quality = null; // 'Perfect' | 'Good' | 'OK' | 'Fail' | null(폐기)
  let finalized = false;
  let paused = false;

  function commit(now) {
    if (active && now > lastNow) {
      const dt = now - lastNow;
      if (active === 'beer') beerMs += dt;
      else foamMs += dt;
    }
    lastNow = now;
    // 넘침: 총 채움이 cap을 넘으면 초과분을 잘라내고 흐름을 자동 차단
    const capMs = config.totalCap * 1000;
    if (!overflow && beerMs + foamMs >= capMs) {
      const excess = beerMs + foamMs - capMs;
      if (active === 'beer') beerMs -= excess;
      else if (active === 'foam') foamMs -= excess;
      active = null;
      overflow = true;
    }
  }

  function press(zone, now) {
    if (paused || finalized || overflow) return false;
    commit(now);
    active = zone === 'beer' || zone === 'foam' ? zone : null;
    lastNow = now;
    return active !== null;
  }
  function release(now) {
    if (paused) return false;
    commit(now);
    active = null;
    return true;
  }
  function tick(now) {
    if (paused) return false;
    commit(now);
    return true;
  }

  function pause(now) {
    if (paused) return false;
    commit(now);
    active = null;
    paused = true;
    return true;
  }

  function resume(now) {
    if (!paused) return false;
    lastNow = now;
    paused = false;
    return true;
  }

  function computeQuality() {
    const beerOk = inRange(beerMs / 1000, config.beerRange);
    const foamOk = inRange(foamMs / 1000, config.foamRange);
    const out = (beerOk ? 0 : 1) + (foamOk ? 0 : 1);
    return out === 0 ? 'Perfect' : out === 1 ? 'Good' : 'OK';
  }

  // 넘침이 아닐 때 따르기를 마무리 → 품질 확정.
  function finish() {
    if (finalized || overflow) return quality;
    quality = computeQuality();
    finalized = true;
    active = null;
    return quality;
  }
  // 넘친 잔을 낮은 품질로 제공 → Fail.
  function serveOverflow() {
    if (!overflow || finalized) return quality;
    quality = 'Fail';
    finalized = true;
    return quality;
  }
  // 넘친 잔을 폐기 → 완성품 없음.
  function discard() {
    if (!overflow || finalized) return null;
    quality = null;
    finalized = true;
    return null;
  }
  function reset() {
    beerMs = 0; foamMs = 0; active = null; lastNow = 0;
    paused = false;
    overflow = false; quality = null; finalized = false;
  }

  function phase() {
    if (finalized) return 'done';
    if (overflow) return 'overflow';
    if (active) return 'pouring';
    if (beerMs + foamMs > 0) return 'ready';
    return 'idle';
  }

  function state() {
    return {
      phase: phase(),
      beerSec: beerMs / 1000,
      foamSec: foamMs / 1000,
      totalSec: (beerMs + foamMs) / 1000,
      active,
      overflow,
      quality,
      paused,
      beerOk: inRange(beerMs / 1000, config.beerRange),
      foamOk: inRange(foamMs / 1000, config.foamRange),
    };
  }

  return { press, release, tick, pause, resume, finish, serveOverflow, discard, reset, state };
}
