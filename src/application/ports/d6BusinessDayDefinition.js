import { createBusinessDayDefinition } from '../../domain/businessDay/d1BusinessDay.js';

export const D6_BUSINESS_DAY_DEFINITION_URL = '/content/releases/d6-business-day-domain.v1.json';

export function consumeD6BusinessDayDefinition(record) {
  const definition = createBusinessDayDefinition(record, { expectedId: 'd6' });
  const customers = definition.waves.flatMap(wave => wave.customers);
  const lines = customers.flatMap(customer => customer.order.lines);
  const menus = new Set(['negima', 'momo', 'kawa', 'beer', 'highball', 'cabbage-salad']);
  if (customers.length !== 10 || new Set(customers.map(c => c.order.id)).size !== 10
    || lines.reduce((sum, line) => sum + line.quantity, 0) !== 22
    || lines.some(line => !menus.has(line.menuId))
    || lines.filter(line => ['negima', 'momo', 'kawa'].includes(line.menuId))
      .reduce((sum, line) => sum + line.quantity, 0) > 12
    || definition.waves.length !== 5
    || definition.waves.some(wave => (wave.requiresOrderCompletionIds ?? []).length > 0)
    || definition.limits.maxActiveOrders !== 3 || definition.limits.maxRiskProcesses !== 2
    || definition.seatIds.length !== 6
    || definition.nextNodeId !== 'd6-complete'
    || definition.arrivalPolicy.receivedGroupOrdersBlockArrival !== false
    || JSON.stringify(definition.campaignReward?.unlockIds) !== JSON.stringify(['day-d6-completed', 'day-d7'])
    || JSON.stringify(definition.stationProcesses).includes('fan')) {
    throw new TypeError('D6는 기존 메뉴 10명·10주문·22항목, 6석, 주문 3·위험 2 상한을 사용해야 합니다.');
  }
  return definition;
}

export async function loadD6BusinessDayDefinition({
  url = D6_BUSINESS_DAY_DEFINITION_URL, fetchImpl = globalThis.fetch,
} = {}) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return { ok: false, error: { code: 'D6_DEFINITION_HTTP', message: `D6 정의 HTTP ${response.status}` } };
    return { ok: true, definition: consumeD6BusinessDayDefinition(await response.json()) };
  } catch (cause) {
    return { ok: false, error: { code: 'D6_DEFINITION_INVALID', message: cause.message, cause } };
  }
}
