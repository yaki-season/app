import { createD1BusinessDayDefinition } from '../../domain/businessDay/d1BusinessDay.js';

export const D1_BUSINESS_DAY_RELEASE_SCHEMA_VERSION = 1;
export const D1_BUSINESS_DAY_RELEASE_DEFINITION_URL = '/content/releases/d1-business-day-definition.v1.json';

export const D1_DEFINITION_CONSUMER_ERROR_CODE = Object.freeze({
  CONTRACT_MISSING: 'D1_DEFINITION_CONTRACT_MISSING',
  CONTRACT_INVALID: 'D1_DEFINITION_CONTRACT_INVALID',
  VERSION_UNSUPPORTED: 'D1_DEFINITION_VERSION_UNSUPPORTED',
  LOAD_FAILED: 'D1_DEFINITION_LOAD_FAILED',
});

function failure(code, message, details = {}) {
  return {
    ok: false,
    error: Object.freeze({
      code,
      message,
      recoverable: false,
      ...details,
    }),
  };
}

const has = (record, key) => Object.prototype.hasOwnProperty.call(record ?? {}, key);

function requiredFields(record) {
  const missing = [];
  const require = (parent, key, path) => {
    if (!has(parent, key)) missing.push(path);
  };

  for (const field of ['id', 'schemaVersion', 'source', 'sessionTargetMs', 'businessWindow', 'arrivalPolicy', 'seatIds', 'timingMs', 'limits', 'economy', 'totals', 'waves']) {
    require(record, field, field);
  }
  if (record?.source) {
    for (const field of ['dayId', 'developmentFixtureId', 'runtimeContractId']) {
      require(record.source, field, `source.${field}`);
    }
  }
  if (record?.businessWindow) {
    for (const field of ['startMinute', 'endMinute', 'spansMidnight']) {
      require(record.businessWindow, field, `businessWindow.${field}`);
    }
  }
  if (record?.arrivalPolicy) {
    for (const field of ['maxAllSeatsEmptyWaitSec', 'autoCloseAfterFinalCustomer']) {
      require(record.arrivalPolicy, field, `arrivalPolicy.${field}`);
    }
  }
  if (record?.timingMs) {
    for (const field of ['thinkMin', 'thinkMax', 'eat', 'leave', 'cleanup', 'waitRecovery']) {
      require(record.timingMs, field, `timingMs.${field}`);
    }
  }
  if (record?.limits) {
    for (const field of ['maxActiveOrders', 'maxRiskProcesses']) {
      require(record.limits, field, `limits.${field}`);
    }
  }
  if (record?.economy) {
    require(record.economy, 'baseTip', 'economy.baseTip');
    require(record.economy, 'menuPrices', 'economy.menuPrices');
  }
  if (record?.totals) {
    for (const field of ['customers', 'orders', 'items']) {
      require(record.totals, field, `totals.${field}`);
    }
  }
  if (Array.isArray(record?.waves)) {
    record.waves.forEach((wave, waveIndex) => {
      const wavePath = `waves[${waveIndex}]`;
      for (const field of ['id', 'atMs', 'requiresOrderCompletionIds', 'customers']) {
        require(wave, field, `${wavePath}.${field}`);
      }
      if (!Array.isArray(wave?.customers)) return;
      wave.customers.forEach((customer, customerIndex) => {
        const customerPath = `${wavePath}.customers[${customerIndex}]`;
        for (const field of ['id', 'typeId', 'source', 'groupId', 'patienceMs', 'order']) {
          require(customer, field, `${customerPath}.${field}`);
        }
        if (!customer?.order) return;
        for (const field of ['id', 'lines']) {
          require(customer.order, field, `${customerPath}.order.${field}`);
        }
        if (!Array.isArray(customer.order.lines)) return;
        customer.order.lines.forEach((line, lineIndex) => {
          for (const field of ['menuId', 'quantity', 'seasoning']) {
            require(line, field, `${customerPath}.order.lines[${lineIndex}].${field}`);
          }
        });
      });
    });
  }
  return missing;
}

/**
 * Developer 3가 배포한 versioned D1 release definition 하나를 domain 입력으로 좁히는 consumer port.
 * 누락·버전 오류 때 개발 fixture나 코드 기본값을 사용하지 않는다.
 */
export function consumeD1BusinessDayReleaseDefinition(releaseDefinition) {
  if (!releaseDefinition || typeof releaseDefinition !== 'object' || Array.isArray(releaseDefinition)) {
    return failure(
      D1_DEFINITION_CONSUMER_ERROR_CODE.CONTRACT_MISSING,
      'D1 release definition이 필요합니다.',
    );
  }

  const fields = requiredFields(releaseDefinition);
  if (fields.length > 0) {
    return failure(
      D1_DEFINITION_CONSUMER_ERROR_CODE.CONTRACT_INVALID,
      `D1 release definition 필드가 누락됐습니다: ${fields.join(', ')}`,
      { fields: Object.freeze(fields) },
    );
  }
  if (releaseDefinition.schemaVersion !== D1_BUSINESS_DAY_RELEASE_SCHEMA_VERSION) {
    return failure(
      D1_DEFINITION_CONSUMER_ERROR_CODE.VERSION_UNSUPPORTED,
      `지원하지 않는 D1 release definition 버전입니다: ${releaseDefinition.schemaVersion}`,
      {
        schemaVersion: releaseDefinition.schemaVersion,
        supportedSchemaVersion: D1_BUSINESS_DAY_RELEASE_SCHEMA_VERSION,
      },
    );
  }
  if (
    releaseDefinition.id !== 'd1-release-definition'
    || releaseDefinition.source.dayId !== 'd1'
  ) {
    return failure(
      D1_DEFINITION_CONSUMER_ERROR_CODE.CONTRACT_INVALID,
      'D1 release definition 식별자가 올바르지 않습니다.',
      { fields: Object.freeze(['id', 'source.dayId']) },
    );
  }

  try {
    const customers = releaseDefinition.waves.flatMap((wave) => wave.customers);
    const orders = customers.map((customer) => customer.order);
    const items = orders.reduce(
      (total, order) => total + order.lines.reduce((sum, line) => sum + line.quantity, 0),
      0,
    );
    if (
      releaseDefinition.totals.customers !== customers.length
      || releaseDefinition.totals.orders !== orders.length
      || releaseDefinition.totals.items !== items
    ) {
      return failure(
        D1_DEFINITION_CONSUMER_ERROR_CODE.CONTRACT_INVALID,
        'D1 release definition totals가 wave 주문 합계와 다릅니다.',
        { fields: Object.freeze(['totals']) },
      );
    }
    const domainRecord = structuredClone(releaseDefinition);
    domainRecord.id = releaseDefinition.source.dayId;
    delete domainRecord.schemaVersion;
    delete domainRecord.source;
    delete domainRecord.totals;
    const definition = createD1BusinessDayDefinition(domainRecord);
    return {
      ok: true,
      release: Object.freeze({
        id: releaseDefinition.id,
        schemaVersion: releaseDefinition.schemaVersion,
        source: Object.freeze(structuredClone(releaseDefinition.source)),
        totals: Object.freeze(structuredClone(releaseDefinition.totals)),
      }),
      definition,
    };
  } catch (cause) {
    return failure(
      D1_DEFINITION_CONSUMER_ERROR_CODE.CONTRACT_INVALID,
      cause instanceof Error ? cause.message : 'D1 release definition을 검증할 수 없습니다.',
      { fields: Object.freeze([]) },
    );
  }
}

export async function loadD1BusinessDayReleaseDefinition({ fetchImpl = globalThis.fetch, url } = {}) {
  if (typeof fetchImpl !== 'function' || typeof url !== 'string' || url.length === 0) {
    return failure(
      D1_DEFINITION_CONSUMER_ERROR_CODE.LOAD_FAILED,
      'D1 release definition loader의 fetch와 URL이 필요합니다.',
    );
  }

  try {
    const response = await fetchImpl(url);
    if (!response?.ok) {
      return failure(
        D1_DEFINITION_CONSUMER_ERROR_CODE.LOAD_FAILED,
        `D1 release definition을 불러오지 못했습니다: ${response?.status ?? 'unknown'}`,
        { status: response?.status ?? null, url },
      );
    }
    return consumeD1BusinessDayReleaseDefinition(await response.json());
  } catch (cause) {
    return failure(
      D1_DEFINITION_CONSUMER_ERROR_CODE.LOAD_FAILED,
      cause instanceof Error ? cause.message : 'D1 release definition을 불러오지 못했습니다.',
      { status: null, url },
    );
  }
}
