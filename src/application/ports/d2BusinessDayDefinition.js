import { createBusinessDayDefinition } from '../../domain/businessDay/d1BusinessDay.js';

export const D2_BUSINESS_DAY_DEFINITION_URL = '/content/releases/d2-business-day-domain.v1.json';

export async function loadD2BusinessDayDefinition({
  url = D2_BUSINESS_DAY_DEFINITION_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return { ok: false, error: { code: 'D2_DEFINITION_HTTP', message: `D2 정의 HTTP ${response.status}` } };
    const record = await response.json();
    return { ok: true, definition: createBusinessDayDefinition(record, { expectedId: 'd2' }) };
  } catch (cause) {
    return { ok: false, error: { code: 'D2_DEFINITION_INVALID', message: cause.message, cause } };
  }
}
