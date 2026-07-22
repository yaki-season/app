import { describe, it, expect } from 'vitest';
import {
  STATUS,
  PROCESS,
  createInitialState,
  assetsLoaded,
  assetsFailed,
  clickIngredient,
  clickAssembledSkewer,
  placeOnGrill,
  clickGrillSkewer,
  tick,
  visibilityHidden,
  visibilityVisible,
  clickPlate,
  clickEmpty,
  clickOrderMat,
  restart,
  isAssemblyComplete,
} from '../../src/state/gameState.js';
import { INGREDIENT } from '../../src/config/recipe.js';

function assembleFullSkewer(state) {
  const order = [
    INGREDIENT.CHICKEN,
    INGREDIENT.LEEK,
    INGREDIENT.CHICKEN,
    INGREDIENT.LEEK,
    INGREDIENT.CHICKEN,
  ];
  return order.reduce((s, ing) => clickIngredient(s, ing, 0), state);
}

function readyState() {
  return assetsLoaded(createInitialState());
}

describe('로딩 상태', () => {
  it('에셋 로딩 전에는 조립 입력이 무시된다', () => {
    const s0 = createInitialState();
    const s1 = clickIngredient(s0, INGREDIENT.CHICKEN, 0);
    expect(s1).toBe(s0);
    expect(s0.status).toBe(STATUS.LOADING);
  });

  it('에셋 로딩 성공 시 assembly로 전이한다', () => {
    const s1 = assetsLoaded(createInitialState());
    expect(s1.status).toBe(STATUS.ASSEMBLY);
  });

  it('로딩 성공 후 도착한 지연 실패 응답은 상태를 덮어쓰지 않는다', () => {
    const s1 = assetsLoaded(createInitialState());
    const s2 = assetsFailed(s1, 'stale');
    expect(s2).toBe(s1);
    expect(s2.status).toBe(STATUS.ASSEMBLY);
  });

  it('에셋 로딩 실패 시 오류 사유를 기록한다', () => {
    const s1 = assetsFailed(createInitialState(), '텍스처 로드 실패');
    expect(s1.status).toBe(STATUS.LOADING);
    expect(s1.loadError).toBe('텍스처 로드 실패');
  });
});

describe('조립', () => {
  it('올바른 순서 5회 클릭으로 조립이 완료된다', () => {
    const s = assembleFullSkewer(readyState());
    expect(isAssemblyComplete(s)).toBe(true);
    expect(s.assemblyIndex).toBe(5);
  });

  it('잘못된 재료 클릭은 진행 상태를 바꾸지 않고 원인을 기록한다', () => {
    const s0 = readyState();
    const s1 = clickIngredient(s0, INGREDIENT.LEEK, 100); // 첫 재료는 닭이어야 함
    expect(s1.assemblyIndex).toBe(0);
    expect(s1.lastMismatch).toEqual({ expected: INGREDIENT.CHICKEN, got: INGREDIENT.LEEK, atMs: 100 });
  });

  it('조립 완료 후 추가 재료 클릭은 무시된다', () => {
    const s0 = assembleFullSkewer(readyState());
    const s1 = clickIngredient(s0, INGREDIENT.CHICKEN, 0);
    expect(s1).toBe(s0);
  });

  it('조립 완료 전 완성 꼬치 클릭은 무시된다', () => {
    const s0 = readyState();
    const s1 = clickAssembledSkewer(s0);
    expect(s1).toBe(s0);
  });
});

describe('그릴 — 앞뒤면 독립 판정', () => {
  function grillReadyState() {
    const s0 = assembleFullSkewer(readyState());
    const s1 = clickAssembledSkewer(s0);
    return placeOnGrill(s1, 0);
  }

  it('그릴 배치 즉시 앞면 굽기가 시작된다', () => {
    const s = grillReadyState();
    expect(s.status).toBe(STATUS.GRILL_FRONT);
    expect(s.faceStartAtMs).toBe(0);
  });

  it('너무 이른 클릭(2.5초 미만)은 무시된다', () => {
    const s0 = grillReadyState();
    const s1 = clickGrillSkewer(s0, 1000);
    expect(s1).toBe(s0);
    expect(s1.status).toBe(STATUS.GRILL_FRONT);
  });

  it('적정 구간에서 클릭하면 뒤집혀 뒷면 시간이 새로 시작된다', () => {
    const s0 = grillReadyState();
    const s1 = clickGrillSkewer(s0, 3000);
    expect(s1.status).toBe(STATUS.GRILL_BACK);
    expect(s1.frontResult).toBe('perfect');
    expect(s1.faceStartAtMs).toBe(3000);
  });

  it('앞뒤 조리 시간은 독립적으로 계산된다 (뒷면 시작 후 3초는 뒷면 기준 적정)', () => {
    const s0 = grillReadyState();
    const s1 = clickGrillSkewer(s0, 3000); // 앞면 3초 시점에 뒤집음
    const s2 = clickGrillSkewer(s1, 3000 + 3000); // 뒷면 시작 후 3초 경과
    expect(s2.status).toBe(STATUS.PLATED);
    expect(s2.backResult).toBe('perfect');
  });

  it('과다 상태에서도 뒤집기·회수는 허용되고 낮은 품질로 기록된다', () => {
    const s0 = grillReadyState();
    const s1 = clickGrillSkewer(s0, 6000); // 과다 구간
    expect(s1.status).toBe(STATUS.GRILL_BACK);
    expect(s1.frontResult).toBe('over');
  });

  it('7초 이상 방치하면 tick으로 실패 상태가 된다', () => {
    const s0 = grillReadyState();
    const s1 = tick(s0, 7000);
    expect(s1.status).toBe(STATUS.FAILED);
    expect(s1.frontResult).toBe('burnt');
  });

  it('실패 이후 tick을 반복 호출해도 추가 전이가 없다 (한 프레임 한 전이)', () => {
    const s0 = grillReadyState();
    const s1 = tick(s0, 7000);
    const s2 = tick(s1, 999999);
    expect(s2).toBe(s1);
  });

  it('실패 상태에서는 그릴 클릭이 무시된다', () => {
    const s0 = grillReadyState();
    const s1 = tick(s0, 7000);
    const s2 = clickGrillSkewer(s1, 8000);
    expect(s2).toBe(s1);
  });
});

describe('브라우저 숨김·복귀', () => {
  function grillReadyState() {
    const s0 = assembleFullSkewer(readyState());
    const s1 = clickAssembledSkewer(s0);
    return placeOnGrill(s1, 0);
  }

  it('숨김 중 경과 시간은 조리 시간에 누적되지 않는다', () => {
    const s0 = grillReadyState();
    const s1 = visibilityHidden(s0, 1000); // 1초 굽고 숨김
    const s2 = visibilityVisible(s1, 100000); // 아주 오래 뒤 복귀
    // 복귀 직후 elapsed는 여전히 1초여야 한다 (탄 상태가 아니어야 함)
    const s3 = clickGrillSkewer(s2, 100000);
    expect(s3.status).toBe(STATUS.GRILL_FRONT); // 아직 2.5초 미만이라 뒤집히지 않음
    const s4 = clickGrillSkewer(s2, 100000 + 1500); // 추가로 1.5초만 더 진행 = 총 2.5초
    expect(s4.status).toBe(STATUS.GRILL_BACK);
  });

  it('숨김 중에는 그릴 클릭이 무시된다', () => {
    const s0 = grillReadyState();
    const s1 = visibilityHidden(s0, 3000);
    const s2 = clickGrillSkewer(s1, 3000);
    expect(s2).toBe(s1);
  });

  it('숨김 중 tick은 실패로 전이하지 않는다', () => {
    const s0 = grillReadyState();
    const s1 = visibilityHidden(s0, 1000);
    const s2 = tick(s1, 999999);
    expect(s2).toBe(s1);
  });
});

describe('서빙과 재시작', () => {
  function platedState() {
    const s0 = assembleFullSkewer(readyState());
    const s1 = clickAssembledSkewer(s0);
    const s2 = placeOnGrill(s1, 0);
    const s3 = clickGrillSkewer(s2, 3000); // 앞면 적정
    return clickGrillSkewer(s3, 3000 + 3000); // 뒷면 적정 -> plated
  }

  it('접시 선택 후 주문 매트를 클릭하면 서빙된다', () => {
    // 품질 판정은 손님이 소유하므로 여기서는 서빙 발생만 확인한다 (customer.test.js가 판정 검증)
    const s0 = platedState();
    const s1 = clickPlate(s0);
    const s2 = clickOrderMat(s1);
    expect(s2.status).toBe(STATUS.SERVED);
  });

  it('접시 선택 없이 주문 매트를 클릭해도 서빙되지 않는다', () => {
    const s0 = platedState();
    const s1 = clickOrderMat(s0);
    expect(s1).toBe(s0);
  });

  it('빈 영역 클릭으로 접시 선택이 취소된다', () => {
    const s0 = clickPlate(platedState());
    const s1 = clickEmpty(s0);
    expect(s1.plateSelected).toBe(false);
  });

  it('서빙 성공 뒤 재시작하면 조립 상태로 초기화된다', () => {
    const s0 = clickOrderMat(clickPlate(platedState()));
    const s1 = restart(s0);
    expect(s1.status).toBe(STATUS.ASSEMBLY);
    expect(s1.assemblyIndex).toBe(0);
    expect(s1.frontResult).toBeNull();
  });

  it('탄 실패 뒤에도 재시작할 수 있다', () => {
    const s0 = placeOnGrill(clickAssembledSkewer(assembleFullSkewer(readyState())), 0);
    const s1 = tick(s0, 7000);
    const s2 = restart(s1);
    expect(s2.status).toBe(STATUS.ASSEMBLY);
  });

  it('진행 중에는 재시작이 무시된다', () => {
    const s0 = readyState();
    const s1 = restart(s0);
    expect(s1).toBe(s0);
  });
});
