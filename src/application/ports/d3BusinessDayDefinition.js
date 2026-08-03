import { createBusinessDayDefinition } from '../../domain/businessDay/d1BusinessDay.js';

export const D3_BUSINESS_DAY_DEFINITION_URL = '/content/releases/d3-business-day-domain.v1.json';

export async function loadD3BusinessDayDefinition({
  url = D3_BUSINESS_DAY_DEFINITION_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return { ok: false, error: { code: 'D3_DEFINITION_HTTP', message: `D3 정의 HTTP ${response.status}` } };
    const record = await response.json();
    return { ok: true, definition: createBusinessDayDefinition(record, { expectedId: 'd3' }) };
  } catch (cause) {
    return { ok: false, error: { code: 'D3_DEFINITION_INVALID', message: cause.message, cause } };
  }
}
