export const HIGHBALL_DEFAULT_CONFIG = Object.freeze({
  flowUnitsPerSec: 1,
  overflowThresholdUnits: 4.8,
  whiskeyPerfect: Object.freeze([0.8, 1.2]),
  whiskeyGood: Object.freeze([0.6, 1.4]),
  sodaPerfect: Object.freeze([2.55, 3.45]),
  sodaGood: Object.freeze([2.1, 3.9]),
  ratioPerfect: Object.freeze([2.7, 3.3]),
  ratioGood: Object.freeze([2.4, 3.6]),
});

const LIQUIDS = new Set(['whiskey', 'soda']);
const inRange = (value, range) => value >= range[0] && value <= range[1];

export function evaluateHighballQuality({
  whiskeyUnits,
  sodaUnits,
  overflowAccepted = false,
  config = HIGHBALL_DEFAULT_CONFIG,
}) {
  if (overflowAccepted) return 'Fail';
  if (!(whiskeyUnits > 0) || !(sodaUnits > 0)) return null;
  const ratio = sodaUnits / whiskeyUnits;
  const allPerfect = inRange(whiskeyUnits, config.whiskeyPerfect)
    && inRange(sodaUnits, config.sodaPerfect)
    && inRange(ratio, config.ratioPerfect);
  if (allPerfect) return 'Perfect';
  const allGood = inRange(whiskeyUnits, config.whiskeyGood)
    && inRange(sodaUnits, config.sodaGood)
    && inRange(ratio, config.ratioGood);
  return allGood ? 'Good' : 'OK';
}

export function createHighballStation({
  config = HIGHBALL_DEFAULT_CONFIG,
  snapshot = null,
} = {}) {
  let glassPlaced = false;
  let iceAdded = false;
  let whiskeyUnits = 0;
  let sodaUnits = 0;
  let activeLiquid = null;
  let lastTickMs = null;
  let overflow = false;
  let overflowAccepted = false;

  function reset() {
    glassPlaced = false;
    iceAdded = false;
    whiskeyUnits = 0;
    sodaUnits = 0;
    activeLiquid = null;
    lastTickMs = null;
    overflow = false;
    overflowAccepted = false;
  }

  function restore(saved) {
    if (saved?.stateVersion !== 1) return false;
    glassPlaced = saved.glassPlaced === true;
    iceAdded = saved.iceAdded === true;
    whiskeyUnits = Math.max(0, Number(saved.whiskeyUnits) || 0);
    sodaUnits = Math.max(0, Number(saved.sodaUnits) || 0);
    overflow = saved.overflow === true;
    overflowAccepted = saved.overflowAccepted === true;
    activeLiquid = null;
    lastTickMs = null;
    return true;
  }

  if (snapshot) restore(snapshot);

  function placeGlass() {
    if (glassPlaced) return { ok: false, reason: 'glass-already-placed' };
    reset();
    glassPlaced = true;
    return { ok: true, state: view() };
  }

  function addIce() {
    if (!glassPlaced) return { ok: false, reason: 'glass-required' };
    if (iceAdded) return { ok: false, reason: 'ice-already-added' };
    iceAdded = true;
    return { ok: true, state: view() };
  }

  function press(liquid, nowMs) {
    if (!LIQUIDS.has(liquid)) return { ok: false, reason: 'unknown-liquid' };
    if (!glassPlaced) return { ok: false, reason: 'glass-required' };
    if (!iceAdded) return { ok: false, reason: 'ice-required' };
    if (overflow || overflowAccepted) return { ok: false, reason: 'overflow-decision-active' };
    if (activeLiquid) return { ok: false, reason: 'pour-active' };
    activeLiquid = liquid;
    lastTickMs = nowMs;
    return { ok: true, state: view() };
  }

  function tick(nowMs) {
    if (!activeLiquid || lastTickMs === null) return { overflowed: false, state: view() };
    // background/blur에서는 UI adapter가 release하므로 여기서는 실제 홀드 시간을 보존한다.
    // 테스트·저프레임 환경에서도 3초 홀드가 1초로 잘리지 않아야 한다.
    const deltaMs = Math.max(0, nowMs - lastTickMs);
    lastTickMs = nowMs;
    const increment = (deltaMs / 1000) * config.flowUnitsPerSec;
    const total = whiskeyUnits + sodaUnits;
    const remaining = Math.max(0, config.overflowThresholdUnits - total);
    const applied = Math.min(increment, remaining);
    if (activeLiquid === 'whiskey') whiskeyUnits += applied;
    else sodaUnits += applied;
    const overflowed = increment >= remaining;
    if (overflowed) {
      overflow = true;
      activeLiquid = null;
      lastTickMs = null;
    }
    return { overflowed, state: view() };
  }

  function release(nowMs) {
    if (!activeLiquid) return false;
    tick(nowMs);
    activeLiquid = null;
    lastTickMs = null;
    return true;
  }

  function acceptOverflow() {
    if (!overflow) return { ok: false, reason: 'not-overflowed' };
    overflow = false;
    overflowAccepted = true;
    return { ok: true, state: view() };
  }

  function addLemon() {
    if (!glassPlaced || !iceAdded) return { ok: false, reason: 'ice-required' };
    if (overflow) return { ok: false, reason: 'overflow-decision-required' };
    if (!(whiskeyUnits > 0) || !(sodaUnits > 0)) {
      return { ok: false, reason: 'both-liquids-required' };
    }
    const quality = evaluateHighballQuality({
      whiskeyUnits,
      sodaUnits,
      overflowAccepted,
      config,
    });
    const completed = {
      menuId: 'highball',
      quality,
      whiskeyUnits,
      sodaUnits,
      ratio: sodaUnits / whiskeyUnits,
      overflowAccepted,
    };
    reset();
    return { ok: true, completed, state: view() };
  }

  function discard() {
    const hadGlass = glassPlaced;
    reset();
    return hadGlass;
  }

  function view() {
    const totalUnits = whiskeyUnits + sodaUnits;
    return Object.freeze({
      phase: !glassPlaced
        ? 'empty'
        : overflow
          ? 'overflow'
          : overflowAccepted
            ? 'overflow-accepted'
            : activeLiquid
              ? 'pouring'
              : 'building',
      glassPlaced,
      iceAdded,
      whiskeyUnits,
      sodaUnits,
      totalUnits,
      fillRatio: Math.max(0, Math.min(1, totalUnits / config.overflowThresholdUnits)),
      activeLiquid,
      overflow,
      overflowAccepted,
      canAddLemon: iceAdded
        && whiskeyUnits > 0
        && sodaUnits > 0
        && !overflow,
      hasInProgressGlass: glassPlaced,
    });
  }

  function snapshotState() {
    return {
      stateVersion: 1,
      glassPlaced,
      iceAdded,
      whiskeyUnits,
      sodaUnits,
      overflow,
      overflowAccepted,
    };
  }

  return {
    placeGlass,
    addIce,
    press,
    tick,
    release,
    acceptOverflow,
    addLemon,
    discard,
    reset,
    restore,
    view,
    snapshot: snapshotState,
  };
}
