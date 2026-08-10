import { createBusinessDayDefinition } from '../../domain/businessDay/d1BusinessDay.js';
import { randomizeBusinessDayRecord } from '../../domain/businessDay/randomizeBusinessDay.js';

export const D2_BUSINESS_DAY_DEFINITION_URL = '/content/releases/d2-business-day-domain.v1.json';

export async function loadD2BusinessDayDefinition({
  url = D2_BUSINESS_DAY_DEFINITION_URL,
  fetchImpl = globalThis.fetch,
  // 하루의 손님 구성을 뽑는 씨앗. 같은 값이면 같은 하루가 나온다(새로고침해도 같은 손님).
  // null이면 정의에 적힌 그대로 쓴다.
  seed = null,
} = {}) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return { ok: false, error: { code: 'D2_DEFINITION_HTTP', message: `D2 정의 HTTP ${response.status}` } };
    const record = await response.json();
    const rolled = seed === null ? record : randomizeBusinessDayRecord(record, { seed });
    return { ok: true, definition: createBusinessDayDefinition(rolled, { expectedId: 'd2' }) };
  } catch (cause) {
    return { ok: false, error: { code: 'D2_DEFINITION_INVALID', message: cause.message, cause } };
  }
}
