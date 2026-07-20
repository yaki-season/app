// 런타임 에셋 경로의 단일 정의 위치 (ART-001 §적용요구사항 1, 6).
// 여기 등록된 항목은 모두 필수 에셋으로 취급해 로딩이 끝나기 전에는
// 핵심 입력을 활성화하지 않는다 (SYS-001 §상세요구사항 8).

const BASE = '../art/generated';

export const ASSETS = {
  // 배경
  bgAssembly: `${BASE}/bg-assembly.png`,
  bgGrill: `${BASE}/bg-grill.png`,
  bgCounter: `${BASE}/bg-counter.png`,

  // 주문표 아이콘
  iconChicken: `${BASE}/icon-chicken.png`,
  iconLeek: `${BASE}/icon-leek.png`,

  // 재료
  ingredientChicken: `${BASE}/ingredient-chicken.png`,
  ingredientLeek: `${BASE}/ingredient-leek.png`,

  // 조립 파츠
  pieceChicken: `${BASE}/piece-chicken.png`,
  pieceLeek: `${BASE}/piece-leek.png`,
  skewerEmpty: `${BASE}/skewer-empty.png`,

  // 그릴
  brazier: `${BASE}/brazier.png`,
  brazierHot: `${BASE}/brazier-hot.png`,

  // 서빙
  plate: `${BASE}/plate.png`,
  orderMat: `${BASE}/order-mat.png`,

  // 손님
  customerIdle: `${BASE}/customer-idle.png`,
  customerHappy: `${BASE}/customer-happy.png`,
  customerMeh: `${BASE}/customer-meh.png`,

  // VFX
  vfxSmoke: `${BASE}/vfx-smoke.png`,
  vfxEmber: `${BASE}/vfx-ember.png`,
  vfxGloss: `${BASE}/vfx-gloss.png`,
  vfxPierce: `${BASE}/vfx-pierce.png`,
};

// 셰이더를 쓸 수 없는 환경의 상태별 래스터 대체 표현 (ART-001 §예외조건 3)
export const NEGIMA_RASTER = {
  raw: `${BASE}/skewer-negima-raw.png`,
  cooking: `${BASE}/skewer-negima-cooking.png`,
  perfect: `${BASE}/skewer-negima-perfect.png`,
  over: `${BASE}/skewer-negima-over.png`,
  burnt: `${BASE}/skewer-negima-burnt.png`,
};

export function allAssetUrls() {
  return [...Object.values(ASSETS), ...Object.values(NEGIMA_RASTER)];
}
