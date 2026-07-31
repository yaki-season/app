// 작업 007: D1 공개 runtime과 E2E가 같은 콘텐츠 값을 소비하도록 하는 읽기 전용 계약.
// game/renderer/loader에 결합하지 않는다. 소비자는 로드한 bundle을 이 builder에 넘긴다.

const D1_PUBLIC_GRILL_BASELINE = Object.freeze({
  slotCount: 2,
  maxSlots: 8,
  slotUpgradeEnabled: true,
  slotUnlockPolicy: 'reputation',
  initialPlacementCount: 2,
  initialPlacementSlots: Object.freeze([1, 2]),
  initialBatch: Object.freeze({
    placementCount: 2,
    placementSlots: Object.freeze([1, 2]),
    placementState: 'staged',
    timerStartPolicy: 'afterInitialBatchPlaced',
    startPolicy: 'simultaneous',
  }),
});

const SETTLEMENT_QUALITIES = Object.freeze(['good', 'low']);

function recordById(records, id, kind) {
  const record = (records || []).find((candidate) => candidate.id === id);
  if (!record) throw new TypeError(`${kind} 레코드가 없습니다: ${id}`);
  return record;
}

function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, immutable(child)])));
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function calculateD1PublicSettlement(economy, qualities = SETTLEMENT_QUALITIES) {
  const qualityMultiplier = {
    good: economy.qualityMultGood,
    low: economy.qualityMultLow,
  };
  let revenue = 0;
  for (const quality of qualities) {
    if (!(quality in qualityMultiplier)) throw new TypeError(`지원하지 않는 공개 정산 품질: ${quality}`);
    revenue += economy.basePrice * qualityMultiplier[quality];
  }
  const tip = economy.tipBase * qualities.length;
  return immutable({
    qualities: [...qualities],
    revenue,
    tip,
    total: revenue + tip,
  });
}

/**
 * loadContent()가 만든 bundle의 D1 정본을 public runtime/E2E용으로 좁혀 투영한다.
 */
export function buildD1PublicRuntimeContract(bundle) {
  const day = recordById(bundle.days, 'd1', 'D1 영업일');
  const orderById = new Map((bundle.orders || []).map((order) => [order.id, order]));
  const orders = day.plannedOrderIds.map((id) => {
    const order = orderById.get(id);
    if (!order) throw new TypeError(`D1 계획 주문이 없습니다: ${id}`);
    return order;
  });
  const firstOrder = orders[0];
  if (!firstOrder) throw new TypeError('D1 첫 주문이 없습니다.');

  const expected = {
    customers: orders.reduce((sum, order) => sum + order.customerCount, 0),
    orders: orders.length,
    items: orders.reduce(
      (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    ),
  };
  const economy = clone(day.economy);
  return immutable({
    id: 'd1-public-runtime-contract',
    schemaVersion: 1,
    source: { dayId: day.id, plannedOrderIds: [...day.plannedOrderIds] },
    runtime: {
      spawnIntervalSec: day.spawnIntervalSec,
      economy,
      expected,
      firstOrder: {
        id: firstOrder.id,
        items: firstOrder.items.map(({ menuId, quantity, seasoning }) => ({ menuId, quantity, seasoning })),
      },
      grill: clone(D1_PUBLIC_GRILL_BASELINE),
    },
    settlementExample: calculateD1PublicSettlement(economy),
  });
}

function patchedContract(contract, patch = {}) {
  const next = clone(contract);
  if (patch.spawnIntervalSec !== undefined) next.runtime.spawnIntervalSec = patch.spawnIntervalSec;
  if (patch.economy) Object.assign(next.runtime.economy, patch.economy);
  if (patch.firstOrder) next.runtime.firstOrder = clone(patch.firstOrder);
  if (patch.grill) {
    Object.assign(next.runtime.grill, patch.grill);
    if (patch.grill.initialBatch) {
      next.runtime.grill.initialBatch = { ...contract.runtime.grill.initialBatch, ...patch.grill.initialBatch };
    }
  }
  return next;
}

/**
 * D1 공개 contract fixture의 과거 상수·초기 그릴·접촉면 위반을 독립 검증한다.
 */
export function validateD1PublicRuntimeFixture(contract, fixture) {
  const errors = [];
  const effective = patchedContract(contract, fixture.contractPatch);
  const baseline = contract.runtime;
  const runtime = effective.runtime;

  if (runtime.spawnIntervalSec !== baseline.spawnIntervalSec) {
    errors.push('[runtime.spawnIntervalSec] 정본 D1 입장 간격과 다름');
  }
  if (!sameJson(runtime.economy, baseline.economy)) {
    errors.push('[runtime.economy] 정본 D1 경제와 다름');
  }
  if (!sameJson(runtime.firstOrder, baseline.firstOrder)) {
    errors.push('[runtime.firstOrder] 정본 D1 첫 주문의 수량 또는 순서와 다름');
  }
  if (!sameJson(runtime.grill, baseline.grill)) {
    errors.push('[runtime.grill] 명성 해금 시작 2칸·최대 8칸·초기 배치 2개 계약과 다름');
  }

  const starts = fixture.initialBatchStartedAtMs || [];
  if (starts.length !== baseline.grill.initialBatch.placementCount || new Set(starts).size !== 1) {
    errors.push('[initialBatch] 첫 2개 staged 제작물은 같은 시각에 시작해야 함');
  }

  for (const transition of fixture.tickTransitions || []) {
    const { previous, next } = transition;
    const frontDelta = next.elapsedSec.front - previous.elapsedSec.front;
    const backDelta = next.elapsedSec.back - previous.elapsedSec.back;
    if (frontDelta < 0 || backDelta < 0) errors.push(`[tick:${transition.id}] 누적 시간이 감소함`);
    if (frontDelta > 0 && backDelta > 0) errors.push(`[tick:${transition.id}] 한 tick에 양면 시간이 함께 증가함`);
    if (previous.contactFace === 'front' && backDelta !== 0) errors.push(`[tick:${transition.id}] front 접촉 중 back 시간이 증가함`);
    if (previous.contactFace === 'back' && frontDelta !== 0) errors.push(`[tick:${transition.id}] back 접촉 중 front 시간이 증가함`);
  }

  if (fixture.settlementQualities) {
    const calculated = calculateD1PublicSettlement(runtime.economy, fixture.settlementQualities);
    const expectedTotal = fixture.expectedSettlementTotal
      ?? (sameJson(fixture.settlementQualities, contract.settlementExample.qualities)
        ? contract.settlementExample.total
        : undefined);
    if (expectedTotal !== calculated.total) {
      errors.push('[settlement] fixture 기대값이 현재 D1 economy 계산과 다름');
    }
  }

  return { valid: errors.length === 0, errors };
}
