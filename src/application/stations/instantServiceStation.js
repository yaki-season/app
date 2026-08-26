export const INSTANT_SERVICE_DEFAULT_HOLD_MS = 2500;

export function createInstantServiceStation({
  holdMs = INSTANT_SERVICE_DEFAULT_HOLD_MS,
} = {}) {
  if (!Number.isFinite(holdMs) || holdMs <= 0) {
    throw new TypeError('instant service holdMs는 0보다 커야 합니다.');
  }

  let startedAtMs = null;
  let progressMs = 0;
  let completedForPress = false;

  function begin(nowMs) {
    if (!Number.isFinite(nowMs) || startedAtMs !== null || completedForPress) return false;
    startedAtMs = nowMs;
    progressMs = 0;
    return true;
  }

  function tick(nowMs) {
    if (startedAtMs === null || completedForPress) {
      return { completed: false, state: view() };
    }
    progressMs = Math.max(0, nowMs - startedAtMs);
    if (progressMs < holdMs) return { completed: false, state: view() };
    progressMs = holdMs;
    startedAtMs = null;
    completedForPress = true;
    return { completed: true, quantity: 1, state: view() };
  }

  function release() {
    const completed = completedForPress;
    startedAtMs = null;
    progressMs = 0;
    completedForPress = false;
    return completed;
  }

  function cancel() {
    const changed = startedAtMs !== null || progressMs > 0 || completedForPress;
    startedAtMs = null;
    progressMs = 0;
    completedForPress = false;
    return changed;
  }

  function view() {
    return Object.freeze({
      phase: completedForPress ? 'completed' : startedAtMs !== null ? 'holding' : 'idle',
      progressMs,
      holdMs,
      ratio: Math.max(0, Math.min(1, progressMs / holdMs)),
      completedForPress,
    });
  }

  return { begin, tick, release, cancel, view };
}
