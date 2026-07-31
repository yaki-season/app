import { describe, expect, it } from 'vitest';
import {
  D1_DEFINITION_CONSUMER_ERROR_CODE,
  consumeD1BusinessDayReleaseDefinition,
  loadD1BusinessDayReleaseDefinition,
} from '../../src/application/ports/d1BusinessDayDefinition.js';

function validReleaseDefinition() {
  return {
    id: 'd1-release-definition',
    schemaVersion: 1,
    source: {
      dayId: 'd1',
      developmentFixtureId: 'd1',
      runtimeContractId: 'd1-public-runtime-contract',
    },
    sessionTargetMs: 420_000,
    seatIds: ['seat-01', 'seat-02', 'seat-03', 'seat-04', 'seat-05', 'seat-06'],
    timingMs: {
      thinkMin: 4_000,
      thinkMax: 6_000,
      eat: 15_000,
      leave: 1_000,
      cleanup: 3_000,
      waitRecovery: 10_000,
    },
    limits: {
      maxActiveOrders: 2,
      maxRiskProcesses: 1,
    },
    totals: {
      customers: 1,
      orders: 1,
      items: 3,
    },
    economy: {
      baseTip: 2,
      menuPrices: {
        beer: 6,
        negima: 3,
      },
    },
    waves: [{
      id: 'd1-guided-first-order',
      atMs: 0,
      requiresOrderCompletionIds: [],
      customers: [{
        id: 'REGULAR_TSUKIOKA',
        typeId: 'regular',
        source: { kind: 'fixed-character', characterId: 'CHAR-TSUKIOKA' },
        groupId: null,
        patienceMs: 100_000,
        order: {
          id: 'D1-ORDER-001',
          guided: true,
          lines: [
            { menuId: 'beer', quantity: 1, seasoning: 'none' },
            { menuId: 'negima', quantity: 2, seasoning: 'none' },
          ],
        },
      }],
    }],
  };
}

const at = (record, path) => path.reduce((value, key) => value[key], record);

describe('D1BusinessDayDefinition consumer port', () => {
  it('release definition이 없으면 개발 fixture로 fallback하지 않고 명시적 오류를 반환한다', () => {
    expect(consumeD1BusinessDayReleaseDefinition(null)).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: D1_DEFINITION_CONSUMER_ERROR_CODE.CONTRACT_MISSING,
        recoverable: false,
      }),
    });
  });

  it.each([
    ['schemaVersion', ['schemaVersion']],
    ['source', ['source']],
    ['totals', ['totals']],
    ['seatIds', ['seatIds']],
    ['timingMs.leave', ['timingMs', 'leave']],
    ['timingMs.cleanup', ['timingMs', 'cleanup']],
    ['economy.menuPrices', ['economy', 'menuPrices']],
    ['waves[0].atMs', ['waves', 0, 'atMs']],
    ['waves[0].requiresOrderCompletionIds', ['waves', 0, 'requiresOrderCompletionIds']],
    ['waves[0].customers[0].id', ['waves', 0, 'customers', 0, 'id']],
    ['waves[0].customers[0].source', ['waves', 0, 'customers', 0, 'source']],
    ['waves[0].customers[0].groupId', ['waves', 0, 'customers', 0, 'groupId']],
    ['waves[0].customers[0].order.id', ['waves', 0, 'customers', 0, 'order', 'id']],
  ])('%s 누락을 contract invalid로 반환한다', (field, path) => {
    const release = validReleaseDefinition();
    const parent = at(release, path.slice(0, -1));
    delete parent[path.at(-1)];

    expect(consumeD1BusinessDayReleaseDefinition(release)).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: D1_DEFINITION_CONSUMER_ERROR_CODE.CONTRACT_INVALID,
        fields: expect.arrayContaining([field]),
      }),
    });
  });

  it('versioned release definition 하나를 검증해 domain definition으로 넘긴다', () => {
    const release = validReleaseDefinition();
    const result = consumeD1BusinessDayReleaseDefinition(release);

    expect(result).toMatchObject({
      ok: true,
      release: {
        id: 'd1-release-definition',
        schemaVersion: 1,
        source: { dayId: 'd1' },
        totals: { customers: 1, orders: 1, items: 3 },
      },
      definition: {
        id: 'd1',
        seatIds: ['seat-01', 'seat-02', 'seat-03', 'seat-04', 'seat-05', 'seat-06'],
        timingMs: { leave: 1_000, cleanup: 3_000 },
        economy: { menuPrices: { beer: 6, negima: 3 } },
        waves: [{
          atMs: 0,
          requiresOrderCompletionIds: [],
          customers: [{
            id: 'REGULAR_TSUKIOKA',
            groupId: null,
            order: { id: 'D1-ORDER-001' },
          }],
        }],
      },
    });
  });

  it('release endpoint 실패도 fixture fallback 없이 load error로 반환한다', async () => {
    const result = await loadD1BusinessDayReleaseDefinition({
      url: '/content/releases/d1-business-day-definition.json',
      fetchImpl: async () => ({ ok: false, status: 404 }),
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: D1_DEFINITION_CONSUMER_ERROR_CODE.LOAD_FAILED,
        status: 404,
        recoverable: false,
      }),
    });
  });
});
