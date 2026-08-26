import { createBusinessDayDefinition } from '../../domain/businessDay/d1BusinessDay.js';

export const D4_BUSINESS_DAY_DEFINITION_URL = '/content/releases/d4-business-day-domain.v1.json';

export async function loadD4BusinessDayDefinition({
  url = D4_BUSINESS_DAY_DEFINITION_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: 'D4_DEFINITION_HTTP',
          message: 'D4 정의 HTTP ' + response.status,
        },
      };
    }
    const record = await response.json();
    return {
      ok: true,
      definition: createBusinessDayDefinition(record, { expectedId: 'd4' }),
    };
  } catch (cause) {
    return {
      ok: false,
      error: {
        code: 'D4_DEFINITION_INVALID',
        message: cause.message,
        cause,
      },
    };
  }
}
