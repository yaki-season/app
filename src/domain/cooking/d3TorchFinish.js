// D3 타레 모모 토치 마감 순수 도메인.
// 렌더 입력 빈도와 무관하게 구간별 적용 시간으로 coverage·집중 과열·품질을 판정한다.

export const TORCH_STATE = Object.freeze({
  NONE: 'none',
  ACTIVE: 'active',
  UNDER: 'under',
  PROPER: 'proper',
  OVER: 'over',
  FAILED: 'failed',
});

export const D3_TORCH_RULES = Object.freeze({
  zoneCount: 5,
  coveredZoneMs: 180,
  properCoverage: 0.8,
  properMinMs: 900,
  overTotalMs: 10_000,
  focusWarnMs: 3_000,
  focusFailMs: 5_000,
  riskDelta: 1,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function torchReadiness(state) {
  const coverageProgress = (state.torchCoverage ?? 0) / D3_TORCH_RULES.properCoverage;
  const durationProgress = (state.torchTotalMs ?? 0) / D3_TORCH_RULES.properMinMs;
  return clamp(Math.min(coverageProgress, durationProgress), 0, 1);
}

export function createD3TorchFinishState() {
  return {
    tareApplied: false,
    tareCoatCount: 0,
    tareReheatCount: 0,
    torchState: TORCH_STATE.NONE,
    torchCoverage: 0,
    torchFocusMs: 0,
    torchCompleted: false,
    torchTotalMs: 0,
    torchZoneMs: Array(D3_TORCH_RULES.zoneCount).fill(0),
    fireRiskDelta: 0,
  };
}
export function applyTare(state) {
  if (state.torchState === TORCH_STATE.ACTIVE) return { ok: false, reason: 'torch-active' };
  if (state.torchCompleted) return { ok: false, reason: 'torch-completed' };
  state.tareApplied = true;
  state.tareCoatCount = (state.tareCoatCount ?? 0) + 1;
  return { ok: true, tareCoatCount: state.tareCoatCount, tareReheatCount: state.tareReheatCount };
}

export function reheatTare(state) {
  if (state.torchState === TORCH_STATE.ACTIVE) return { ok: false, reason: 'torch-active' };
  if ((state.tareCoatCount ?? 0) <= (state.tareReheatCount ?? 0)) {
    return { ok: false, reason: 'tare-coat-required' };
  }
  state.tareReheatCount = (state.tareReheatCount ?? 0) + 1;
  return { ok: true, tareCoatCount: state.tareCoatCount, tareReheatCount: state.tareReheatCount };
}

export function beginTorch(state, { bothFacesCooked = false, safetyBlocked = false } = {}) {
  if (!bothFacesCooked) return { ok: false, reason: 'both-faces-required' };
  if ((state.tareCoatCount ?? 0) === 0) return { ok: false, reason: 'tare-required' };
  if (Math.min(state.tareCoatCount ?? 0, state.tareReheatCount ?? 0) < 2) {
    return { ok: false, reason: 'tare-finish-required' };
  }
  if (safetyBlocked) return { ok: false, reason: 'safety-blocked' };
  if (state.torchCompleted) return { ok: false, reason: 'already-completed' };
  if (state.torchState === TORCH_STATE.ACTIVE) return { ok: false, reason: 'already-active' };
  state.torchState = TORCH_STATE.ACTIVE;
  state.fireRiskDelta = D3_TORCH_RULES.riskDelta;
  return { ok: true, fireRiskDelta: state.fireRiskDelta };
}

export function sweepTorch(state, { position, deltaMs }) {
  if (state.torchState !== TORCH_STATE.ACTIVE) return { ok: false, reason: 'torch-not-active' };
  if (!Number.isFinite(position) || !Number.isFinite(deltaMs) || deltaMs <= 0) {
    return { ok: false, reason: 'invalid-sweep' };
  }
  const zone = Math.min(
    D3_TORCH_RULES.zoneCount - 1,
    Math.floor(clamp(position, 0, 1) * D3_TORCH_RULES.zoneCount),
  );
  state.torchZoneMs[zone] += deltaMs;
  state.torchTotalMs += deltaMs;
  state.torchFocusMs = Math.max(state.torchFocusMs, state.torchZoneMs[zone]);
  const covered = state.torchZoneMs.filter((ms) => ms >= D3_TORCH_RULES.coveredZoneMs).length;
  state.torchCoverage = covered / D3_TORCH_RULES.zoneCount;
  return {
    ok: true,
    zone,
    torchCoverage: state.torchCoverage,
    torchFocusMs: state.torchFocusMs,
    safetyDrainMs: deltaMs,
  };
}

export function finishTorch(state) {
  if (state.torchState !== TORCH_STATE.ACTIVE) return { ok: false, reason: 'torch-not-active' };
  if (state.torchFocusMs >= D3_TORCH_RULES.focusFailMs) {
    state.torchState = TORCH_STATE.FAILED;
  } else if (state.torchTotalMs > D3_TORCH_RULES.overTotalMs) {
    state.torchState = TORCH_STATE.OVER;
  } else if (
    state.torchCoverage >= D3_TORCH_RULES.properCoverage
    && state.torchTotalMs >= D3_TORCH_RULES.properMinMs
  ) {
    state.torchState = TORCH_STATE.PROPER;
  } else {
    state.torchState = TORCH_STATE.UNDER;
  }
  state.torchCompleted = true;
  return { ok: true, torchState: state.torchState, quality: torchQuality(state) };
}

export function torchQuality(state) {
  switch (state.torchState) {
    case TORCH_STATE.PROPER:
      return { grade: 'Perfect', good: true, smokyBonus: true, servable: true };
    case TORCH_STATE.UNDER:
      return { grade: 'Good', good: true, smokyBonus: false, servable: true };
    case TORCH_STATE.OVER:
      return { grade: 'OK', good: false, smokyBonus: false, servable: true };
    case TORCH_STATE.FAILED:
      return { grade: 'Fail', good: false, smokyBonus: false, servable: true };
    default:
      return null;
  }
}

export function canRetrieveTorchMenu(state) {
  if ((state.tareCoatCount ?? 0) === 0) return { ok: false, reason: 'tare-required' };
  return Math.min(state.tareCoatCount ?? 0, state.tareReheatCount ?? 0) >= 2
    ? { ok: true }
    : { ok: false, reason: 'tare-finish-required' };
}

export function tareQuality(state) {
  const cycles = Math.min(state.tareCoatCount ?? 0, state.tareReheatCount ?? 0);
  return cycles >= 2
    ? { grade: 'Perfect', good: true, smokyBonus: false, servable: true }
    : { grade: 'Good', good: true, smokyBonus: false, servable: true };
}
