// Developer 3 작업 005: S0~D3 콘텐츠 계획을 렌더러 없이 결정적으로 소비하는 어댑터.
// gameplay 상태 머신을 구현하지 않고, 검증된 날짜·주문 데이터의 stable contract만 제공한다.

function requiredRecord(records, id, kind) {
  const record = (records || []).find((candidate) => candidate.id === id);
  if (!record) throw new TypeError(`${kind} 레코드가 없습니다: ${id}`);
  return record;
}

export function buildEarlyCampaignDayContract(bundle, dayId) {
  const day = requiredRecord(bundle.days, dayId, '영업일');
  const scenario = requiredRecord(bundle.scenarios, dayId, '시나리오');
  const orderById = new Map((bundle.orders || []).map((order) => [order.id, order]));
  const plannedOrders = day.plannedOrderIds.map((orderId) => {
    const order = orderById.get(orderId);
    if (!order) throw new TypeError(`계획 주문이 없습니다: ${orderId}`);
    return structuredClone(order);
  });

  return Object.freeze({
    dayId,
    nextNodeId: scenario.nextDay,
    businessWindow: structuredClone(day.businessWindow),
    arrivalPolicy: structuredClone(day.arrivalPolicy),
    totals: structuredClone(day.totals),
    limits: Object.freeze({
      maxActiveOrders: day.maxActiveOrders,
      maxRiskProcesses: day.maxRiskProcesses,
    }),
    tutorial: Object.freeze({
      newActionId: day.newActionId,
      reviewActionIds: Object.freeze([...day.reviewActionIds]),
      ...structuredClone(day.tutorialPolicy),
    }),
    settlement: structuredClone(day.settlement),
    segments: Object.freeze(day.segments.map((segment) => Object.freeze({
      ...structuredClone(segment),
      orders: Object.freeze(
        plannedOrders
          .filter((order) => order.arrivalSegmentId === segment.id)
          .map((order) => Object.freeze(order)),
      ),
    }))),
  });
}

export function simulateEarlyCampaignPlan(bundle, dayId) {
  const contract = buildEarlyCampaignDayContract(bundle, dayId);
  const segmentResults = contract.segments.map((segment) => {
    const customers = segment.orders.reduce((sum, order) => sum + order.customerCount, 0);
    const orders = segment.orders.length;
    const items = segment.orders.reduce(
      (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );
    return Object.freeze({
      segmentId: segment.id,
      customers,
      orders,
      items,
      maxActiveOrders: segment.maxActiveOrders,
      maxRiskProcesses: segment.maxRiskProcesses,
    });
  });

  return Object.freeze({
    dayId,
    nextNodeId: contract.nextNodeId,
    customers: segmentResults.reduce((sum, segment) => sum + segment.customers, 0),
    orders: segmentResults.reduce((sum, segment) => sum + segment.orders, 0),
    items: segmentResults.reduce((sum, segment) => sum + segment.items, 0),
    peakActiveOrders: Math.max(...segmentResults.map((segment) => segment.maxActiveOrders)),
    peakRiskProcesses: Math.max(...segmentResults.map((segment) => segment.maxRiskProcesses)),
    segmentResults: Object.freeze(segmentResults),
  });
}
