import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { consumeD1BusinessDayReleaseDefinition } from '../../src/application/ports/d1BusinessDayDefinition.js';
import { buildD1PublicRuntimeContract } from '../../src/content/d1PublicRuntimeContract.js';
import { buildD1ReleaseDefinition } from '../../src/content/d1ReleaseDefinition.js';

const root = new URL('../../', import.meta.url);
const read = (relativePath) => JSON.parse(readFileSync(
  fileURLToPath(new URL(relativePath, root)),
  'utf8',
));

function developer3ReleaseDefinition() {
  const bundle = {
    days: [read('content/campaign/day-d1.json')],
    orders: read('content/orders/early-campaign.json'),
    customers: read('content/customers/types.json'),
  };
  return buildD1ReleaseDefinition({
    bundle,
    developmentFixture: read('tests/fixtures/business-days/d1-full-day.json'),
    runtimeContract: buildD1PublicRuntimeContract(bundle),
  });
}

describe('Developer 3 D1 release definition → Developer 1 consumer', () => {
  it('versioned release 하나에서 전체 영업 domain 입력과 golden 합계를 보존한다', () => {
    const consumed = consumeD1BusinessDayReleaseDefinition(developer3ReleaseDefinition());
    expect(consumed.ok).toBe(true);

    const definition = consumed.definition;
    const customers = definition.waves.flatMap((wave) => wave.customers);
    const orders = customers.map((customer) => customer.order);
    const items = orders.reduce(
      (total, order) => total + order.lines.reduce((sum, line) => sum + line.quantity, 0),
      0,
    );
    expect({
      release: consumed.release,
      sessionTargetMs: definition.sessionTargetMs,
      seats: definition.seatIds.length,
      waveAtMs: definition.waves.map((wave) => wave.atMs),
      customers: customers.map(({ id, groupId }) => ({ id, groupId })),
      orderIds: orders.map(({ id }) => id),
      prerequisites: definition.waves.map((wave) => wave.requiresOrderCompletionIds),
      totals: { customers: customers.length, orders: orders.length, items },
      timing: { leave: definition.timingMs.leave, cleanup: definition.timingMs.cleanup },
      prices: definition.economy.menuPrices,
    }).toEqual({
      release: {
        id: 'd1-release-definition',
        schemaVersion: 1,
        source: {
          dayId: 'd1',
          developmentFixtureId: 'd1',
          runtimeContractId: 'd1-public-runtime-contract',
        },
        totals: { customers: 4, orders: 4, items: 8 },
      },
      sessionTargetMs: 420_000,
      seats: 6,
      waveAtMs: [0, 100_000, 220_000],
      customers: [
        { id: 'REGULAR_TSUKIOKA', groupId: null },
        { id: 'D1-OFFICE-A', groupId: 'D1-GROUP-OFFICE' },
        { id: 'D1-OFFICE-B', groupId: 'D1-GROUP-OFFICE' },
        { id: 'D1-SOLO-A', groupId: null },
      ],
      orderIds: ['D1-ORDER-001', 'D1-ORDER-002-A', 'D1-ORDER-002-B', 'D1-ORDER-003'],
      prerequisites: [
        [],
        ['D1-ORDER-001'],
        ['D1-ORDER-002-A', 'D1-ORDER-002-B'],
      ],
      totals: { customers: 4, orders: 4, items: 8 },
      timing: { leave: 1_000, cleanup: 3_000 },
      prices: { beer: 6, negima: 3 },
    });
    expect(orders[0].lines).toEqual([
      { menuId: 'beer', quantity: 1, seasoning: 'none' },
      { menuId: 'negima', quantity: 2, seasoning: 'none' },
    ]);
  });
});
