// 프로덕션 영업 화면 전환 상태 머신 (순수 로직, 프레임워크 비의존).
//
// 책임: 어떤 화면이 활성인지, 전환 중인지, 새 화면 조작을 잠글지 추적한다.
// 카메라 포즈 보간은 렌더러가 라이브 포즈에서 목표 프리셋으로 lerp하며 담당한다(급한 전환 수렴은
// 그 라이브 lerp가 자연히 처리한다, SYS-002 §104). 이 모듈은 화면 인덱스·전환 시계·잠금만 다룬다.
//
// 계약 근거: SYS-002 v3 §71(전환 중 상태 보존·새 화면 조작 잠금), §104(급한 전환은 마지막 목표로 수렴).

export function createStationDirector({ screens, initial, transitionMs = 300 } = {}) {
  if (!Array.isArray(screens) || screens.length === 0) {
    throw new Error('stationDirector: screens 배열이 필요합니다.');
  }
  const order = screens.slice();
  const indexOf = (id) => order.indexOf(id);

  let currentIndex = initial != null ? indexOf(initial) : 0;
  if (currentIndex < 0) throw new Error(`stationDirector: 알 수 없는 초기 화면 ${initial}`);

  let fromIndex = currentIndex; // 전환 출발 화면 (렌더러 참고용; 포즈는 라이브 lerp)
  let transition = null; // { startMs, endMs } 또는 null

  function activeScreenId() {
    return order[currentIndex];
  }

  // 화면 요청. 이미 활성이면 무시. 전환 중 재요청은 목표만 바꿔 마지막으로 수렴한다(§104).
  function request(id, nowMs) {
    const next = indexOf(id);
    if (next < 0) throw new Error(`stationDirector: 알 수 없는 화면 ${id}`);
    if (next === currentIndex && !transition) return false;
    if (next === currentIndex && transition) return false; // 이미 그리로 가는 중
    fromIndex = currentIndex;
    currentIndex = next;
    transition = { startMs: nowMs, endMs: nowMs + transitionMs };
    return true;
  }

  function left(nowMs) {
    const target = Math.max(0, currentIndex - 1);
    return request(order[target], nowMs);
  }
  function right(nowMs) {
    const target = Math.min(order.length - 1, currentIndex + 1);
    return request(order[target], nowMs);
  }

  // 전환 시계를 진행한다. 완료되면 전환 종료. 상태가 바뀌면 true.
  function tick(nowMs) {
    if (!transition) return false;
    if (nowMs >= transition.endMs) {
      transition = null;
      fromIndex = currentIndex;
      return true;
    }
    return false;
  }

  function isTransitioning() {
    return transition != null;
  }

  // 전환 중에는 새 화면(활성 화면)의 조작을 잠근다 (§71).
  function controlsLocked() {
    return transition != null;
  }

  // 전환 진행도 0..1. 렌더러 크로스페이드/포즈 보간 참고용.
  function progress(nowMs) {
    if (!transition) return 1;
    const span = transition.endMs - transition.startMs;
    if (span <= 0) return 1;
    return Math.min(1, Math.max(0, (nowMs - transition.startMs) / span));
  }

  return {
    order: order.slice(),
    activeScreenId,
    fromScreenId: () => order[fromIndex],
    request,
    left,
    right,
    tick,
    isTransitioning,
    controlsLocked,
    progress,
    canLeft: () => currentIndex > 0,
    canRight: () => currentIndex < order.length - 1,
  };
}
