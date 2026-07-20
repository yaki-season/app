// 단일 야키토리 주문의 게임 세션 상태 원본.
// 렌더링·DOM 이벤트와 분리된 순수 함수로 구현한다 (SYS-001 §상세요구사항 14).
// 모든 시간 값은 performance.now()와 같은 단조 증가 밀리초를 호출자가 넘긴다.

import { RECIPE, classifyDoneness, canAdvance } from '../config/recipe.js';

export const STATUS = {
  LOADING: 'loading',
  ASSEMBLY: 'assembly',
  GRILL_FRONT: 'grillFront',
  GRILL_BACK: 'grillBack',
  PLATED: 'plated',
  SERVED: 'served',
  FAILED: 'failed',
};

export const PROCESS = {
  ASSEMBLY: 'assembly',
  GRILL: 'grill',
  COUNTER: 'counter',
};

function baseSessionFields() {
  return {
    status: STATUS.LOADING,
    process: PROCESS.ASSEMBLY,
    completedProcesses: [],

    assemblyIndex: 0,
    lastMismatch: null, // { expected, got, atMs } — 오입력 피드백용, 상태를 바꾸지 않음

    faceStartAtMs: null,
    pausedAtMs: null,
    frontResult: null,
    backResult: null,

    plateSelected: false,
    servedQuality: null, // 'good' | 'low'

    assetsLoaded: false,
    loadError: null,
  };
}

export function createInitialState() {
  return baseSessionFields();
}

function withCompletedProcess(list, process) {
  return list.includes(process) ? list : [...list, process];
}

// ── 에셋 로딩 ────────────────────────────────────────────────

export function assetsLoaded(state) {
  if (state.status !== STATUS.LOADING) return state;
  return { ...state, status: STATUS.ASSEMBLY, assetsLoaded: true, loadError: null };
}

export function assetsFailed(state, reason) {
  if (state.assetsLoaded) return state; // 늦게 도착한 이전 요청의 실패는 무시한다
  return { ...state, status: STATUS.LOADING, loadError: reason };
}

export function retryLoad(state) {
  if (state.assetsLoaded) return state;
  return { ...state, loadError: null };
}

// ── 조립 ─────────────────────────────────────────────────────

export function clickIngredient(state, ingredient, nowMs) {
  if (state.status !== STATUS.ASSEMBLY) return state;
  if (state.assemblyIndex >= RECIPE.length) return state; // 조립 완료 후 재료 입력 무시

  const expected = RECIPE[state.assemblyIndex];
  if (ingredient !== expected) {
    return {
      ...state,
      lastMismatch: { expected, got: ingredient, atMs: nowMs },
    };
  }

  return {
    ...state,
    assemblyIndex: state.assemblyIndex + 1,
    lastMismatch: null,
  };
}

export function isAssemblyComplete(state) {
  return state.assemblyIndex >= RECIPE.length;
}

// 조립 완료 꼬치를 클릭 → 그릴 화면으로 이동 (아직 그릴에 배치되지 않음)
export function clickAssembledSkewer(state) {
  if (state.status !== STATUS.ASSEMBLY) return state;
  if (!isAssemblyComplete(state)) return state;
  return {
    ...state,
    process: PROCESS.GRILL,
    completedProcesses: withCompletedProcess(state.completedProcesses, PROCESS.ASSEMBLY),
  };
}

// ── 그릴 ─────────────────────────────────────────────────────

// 대기 꼬치를 클릭 → 그릴 칸에 배치, 앞면 굽기 즉시 시작
export function placeOnGrill(state, nowMs) {
  if (state.status !== STATUS.ASSEMBLY) return state;
  if (!isAssemblyComplete(state)) return state;
  return {
    ...state,
    status: STATUS.GRILL_FRONT,
    faceStartAtMs: nowMs,
    pausedAtMs: null,
  };
}

export function faceElapsedMs(state, nowMs) {
  if (state.status !== STATUS.GRILL_FRONT && state.status !== STATUS.GRILL_BACK) return 0;
  if (state.faceStartAtMs == null) return 0;
  const effectiveNow = state.pausedAtMs != null ? state.pausedAtMs : nowMs;
  return Math.max(0, effectiveNow - state.faceStartAtMs);
}

export function currentDoneness(state, nowMs) {
  const elapsedSec = faceElapsedMs(state, nowMs) / 1000;
  return classifyDoneness(elapsedSec);
}

// 그릴 위 꼬치 클릭 = 현재 상태에 따라 뒤집기 또는 접시 회수 (UI-001 §상세요구사항 10)
export function clickGrillSkewer(state, nowMs) {
  if (state.pausedAtMs != null) return state; // 백그라운드 중 입력 무시
  const doneness = currentDoneness(state, nowMs);
  if (!canAdvance(doneness)) return state; // 너무 이른 클릭은 무시

  if (state.status === STATUS.GRILL_FRONT) {
    return {
      ...state,
      status: STATUS.GRILL_BACK,
      frontResult: doneness,
      faceStartAtMs: nowMs,
      pausedAtMs: null,
    };
  }

  if (state.status === STATUS.GRILL_BACK) {
    return {
      ...state,
      status: STATUS.PLATED,
      backResult: doneness,
      faceStartAtMs: null,
      process: PROCESS.GRILL,
      completedProcesses: withCompletedProcess(state.completedProcesses, PROCESS.GRILL),
    };
  }

  return state;
}

// 매 프레임(또는 테스트에서 수동으로) 호출 — 방치로 인한 실패만 판정한다.
// 한 번의 호출은 최대 한 번의 상태 전이만 만든다.
export function tick(state, nowMs) {
  if (state.status !== STATUS.GRILL_FRONT && state.status !== STATUS.GRILL_BACK) return state;
  if (state.pausedAtMs != null) return state;

  const doneness = currentDoneness(state, nowMs);
  if (doneness !== 'burnt') return state;

  const isFront = state.status === STATUS.GRILL_FRONT;
  return {
    ...state,
    status: STATUS.FAILED,
    frontResult: isFront ? doneness : state.frontResult,
    backResult: isFront ? state.backResult : doneness,
    faceStartAtMs: null,
  };
}

// ── 가시성 (숨김/복귀) ────────────────────────────────────────

export function visibilityHidden(state, nowMs) {
  if (state.status !== STATUS.GRILL_FRONT && state.status !== STATUS.GRILL_BACK) return state;
  if (state.pausedAtMs != null) return state;
  return { ...state, pausedAtMs: nowMs };
}

export function visibilityVisible(state, nowMs) {
  if (state.pausedAtMs == null) return state;
  const pausedDurationMs = nowMs - state.pausedAtMs;
  return {
    ...state,
    faceStartAtMs: state.faceStartAtMs + pausedDurationMs,
    pausedAtMs: null,
  };
}

// ── 카운터 (접시 · 서빙) ───────────────────────────────────────

export function clickPlate(state) {
  if (state.status !== STATUS.PLATED) return state;
  return { ...state, plateSelected: true, process: PROCESS.COUNTER };
}

export function clickEmpty(state) {
  if (!state.plateSelected) return state;
  return { ...state, plateSelected: false };
}

export function clickOrderMat(state) {
  if (state.status !== STATUS.PLATED || !state.plateSelected) return state;

  const quality =
    state.frontResult === 'over' || state.backResult === 'over' ? 'low' : 'good';

  return {
    ...state,
    status: STATUS.SERVED,
    plateSelected: false,
    servedQuality: quality,
    completedProcesses: withCompletedProcess(state.completedProcesses, PROCESS.COUNTER),
  };
}

// ── 공정 탭 이동 ────────────────────────────────────────────

export function clickTab(state, process) {
  if (process === state.process) return state;
  const isReachable =
    process === PROCESS.ASSEMBLY ||
    state.completedProcesses.includes(process) ||
    (process === PROCESS.GRILL && state.process === PROCESS.GRILL) ||
    (process === PROCESS.COUNTER && state.status === STATUS.PLATED);
  if (!isReachable) return state;
  return { ...state, process };
}

// ── 재시작 ───────────────────────────────────────────────────

export function restart(state) {
  if (state.status !== STATUS.SERVED && state.status !== STATUS.FAILED) return state;
  return {
    ...baseSessionFields(),
    status: STATUS.ASSEMBLY,
    assetsLoaded: true,
  };
}
