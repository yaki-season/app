// 작업 008: 검증된 D1 전체 영업 fixture를 정본 콘텐츠와 교차 검증해 release adapter 입력으로 승격한다.

function clone(value) {
  return structuredClone(value);
}

function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, immutable(child)])));
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function byId(records, id, label) {
  const record = (records || []).find((candidate) => candidate.id === id);
  if (!record) throw new TypeError(`${label}가 없습니다: ${id}`);
  return record;
}

function extraRuntimeId(typeId, ordinal) {
  return `D1-${typeId.toUpperCase()}-${String.fromCharCode(65 + ordinal)}`;
}

function extraGroupId(dayId, typeId) {
  return `${dayId.toUpperCase()}-GROUP-${typeId.toUpperCase()}`;
}

/** null runtimeCustomerId 엑스트라의 저장 가능한 결정적 ID 규칙을 공개한다. */
export function deriveD1ExtraRuntimeId(typeId, ordinalInWave) {
  if (!Number.isInteger(ordinalInWave) || ordinalInWave < 0 || ordinalInWave > 25) {
    throw new TypeError('엑스트라 wave 순번은 0~25 정수여야 합니다.');
  }
  return extraRuntimeId(typeId, ordinalInWave);
}

function canonicalLines(order) {
  return order.items.map(({ menuId, quantity, seasoning }) => ({ menuId, quantity, seasoning }));
}

/**
 * 정본 bundle + 검증된 development fixture + 작업 007 contract를 versioned release definition으로 만든다.
 */
export function buildD1ReleaseDefinition({ bundle, developmentFixture, runtimeContract }) {
  const day = byId(bundle.days, 'd1', 'D1 영업일');
  const orderById = new Map((bundle.orders || []).map((order) => [order.id, order]));
  const customerById = new Map((bundle.customers || []).map((customer) => [customer.id, customer]));
  const waves = developmentFixture.waves.map((fixtureWave) => {
    const extraOrdinalByType = new Map();
    const customers = fixtureWave.customers.map((fixtureCustomer) => {
      const order = orderById.get(fixtureCustomer.order.id);
      if (!order) throw new TypeError(`D1 fixture가 미정의 주문을 참조함: ${fixtureCustomer.order.id}`);
      const typeId = order.source.kind === 'extra-type' ? order.source.customerTypeId : fixtureCustomer.typeId;
      const customerType = customerById.get(typeId);
      if (!customerType) throw new TypeError(`D1 fixture가 미정의 손님 유형을 참조함: ${typeId}`);
      const ordinal = extraOrdinalByType.get(typeId) ?? 0;
      if (order.source.kind === 'extra-type') extraOrdinalByType.set(typeId, ordinal + 1);
      const groupId = customerType.groupSize > 1 ? extraGroupId(day.id, typeId) : null;
      return {
        id: order.runtimeCustomerId ?? deriveD1ExtraRuntimeId(typeId, ordinal),
        typeId,
        source: clone(order.source),
        groupId,
        patienceMs: customerType.patienceSec * 1000,
        order: {
          id: order.id,
          guided: fixtureCustomer.order.guided === true,
          lines: canonicalLines(order),
        },
      };
    });
    const requiresOrderCompletionIds = [...new Set(customers.flatMap((customer) => {
      return orderById.get(customer.order.id).requiresOrderCompletionIds || [];
    }))];
    return { id: fixtureWave.id, atMs: fixtureWave.atMs, requiresOrderCompletionIds, customers };
  });

  return immutable({
    id: 'd1-release-definition',
    schemaVersion: 1,
    source: {
      dayId: day.id,
      developmentFixtureId: developmentFixture.id,
      runtimeContractId: runtimeContract.id,
    },
    sessionTargetMs: day.businessWindow.targetSessionSec * 1000,
    seatIds: clone(developmentFixture.seatIds),
    timingMs: clone(developmentFixture.timingMs),
    limits: { maxActiveOrders: day.maxActiveOrders, maxRiskProcesses: day.maxRiskProcesses },
    economy: clone(developmentFixture.economy),
    totals: clone(runtimeContract.runtime.expected),
    waves,
  });
}

/** 정본 콘텐츠·fixture·작업 007 contract 사이의 누락 정책 위반을 찾는다. */
export function validateD1ReleaseInputs({ bundle, developmentFixture, runtimeContract }) {
  const errors = [];
  const day = (bundle.days || []).find(({ id }) => id === 'd1');
  if (!day) return { valid: false, errors: ['[source] d1 day가 없음'] };
  if (developmentFixture.sessionTargetMs !== day.businessWindow.targetSessionSec * 1000) errors.push('[fixture.sessionTargetMs] D1 정본 세션 길이와 다름');
  if (developmentFixture.timingMs.thinkMin !== day.timingSec.orderThinkMin * 1000 || developmentFixture.timingMs.thinkMax !== day.timingSec.orderThinkMax * 1000) errors.push('[fixture.timingMs.think] D1 정본 고민 시간과 다름');
  if (developmentFixture.timingMs.eat !== day.timingSec.eat * 1000) errors.push('[fixture.timingMs.eat] D1 정본 식사 시간과 다름');
  if (developmentFixture.timingMs.waitRecovery !== day.waitRecoverySec * 1000) errors.push('[fixture.timingMs.waitRecovery] D1 정본 회복 시간과 다름');
  if (developmentFixture.limits.maxActiveOrders !== day.maxActiveOrders || developmentFixture.limits.maxRiskProcesses !== day.maxRiskProcesses) errors.push('[fixture.limits] D1 정본 공정 상한과 다름');
  if (developmentFixture.economy.baseTip !== day.economy.tipBase || developmentFixture.economy.menuPrices.negima !== runtimeContract.runtime.economy.basePrice) errors.push('[fixture.economy] D1 정본 economy와 다름');

  const orders = new Map((bundle.orders || []).map((order) => [order.id, order]));
  const types = new Map((bundle.customers || []).map((type) => [type.id, type]));
  const fixtureOrderIds = [];
  for (const wave of developmentFixture.waves || []) {
    for (const customer of wave.customers || []) {
      const order = orders.get(customer.order.id);
      fixtureOrderIds.push(customer.order.id);
      if (!order) { errors.push(`[fixture:${wave.id}] 미정의 주문: ${customer.order.id}`); continue; }
      const sourceTypeId = order.source.kind === 'extra-type' ? order.source.customerTypeId : customer.typeId;
      const type = types.get(sourceTypeId);
      if (!type || customer.typeId !== sourceTypeId) errors.push(`[fixture:${customer.order.id}] 손님 source/type 불일치`);
      if (!sameJson(customer.order.lines, order.items.map(({ menuId, quantity }) => ({ menuId, quantity })))) errors.push(`[fixture:${customer.order.id}] 주문 수량 또는 순서 불일치`);
      if (type && customer.patienceMs !== type.patienceSec * 1000) errors.push(`[fixture:${customer.order.id}] 인내심 불일치`);
    }
  }
  if (!sameJson(fixtureOrderIds, day.plannedOrderIds)) errors.push('[fixture.waves] D1 계획 주문 순서 또는 개수가 다름');
  const items = [...orders.values()].filter((order) => day.plannedOrderIds.includes(order.id)).reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  if (fixtureOrderIds.length !== runtimeContract.runtime.expected.orders || items !== runtimeContract.runtime.expected.items || developmentFixture.waves.reduce((sum, wave) => sum + wave.customers.length, 0) !== runtimeContract.runtime.expected.customers) errors.push('[fixture.totals] 작업 007 D1 공개 contract 합계와 다름');
  return { valid: errors.length === 0, errors };
}

export function releaseDefinitionEqualsExpected(definition, inputs) {
  return sameJson(definition, buildD1ReleaseDefinition(inputs));
}
