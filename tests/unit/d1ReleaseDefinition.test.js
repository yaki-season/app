import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildD1PublicRuntimeContract } from '../../src/content/d1PublicRuntimeContract.js';
import {
  buildD1ReleaseDefinition,
  deriveD1ExtraRuntimeId,
  validateD1ReleaseInputs,
} from '../../src/content/d1ReleaseDefinition.js';
import { validateD1ReleaseDefinition } from '../../src/content/validateD1ReleaseDefinition.js';

const root = new URL('../../', import.meta.url);
const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, root)), 'utf8'));
const schema = read('content/schema/d1-release-definition.schema.json');
const fixtureDir = fileURLToPath(new URL('../fixtures/d1-release-definition/', import.meta.url));
const fixtures = readdirSync(fixtureDir).filter((file) => file.endsWith('.json')).sort()
  .map((file) => read(`tests/fixtures/d1-release-definition/${file}`));

function baseInputs() {
  const bundle = {
    days: [read('content/campaign/day-d1.json')],
    orders: read('content/orders/early-campaign.json'),
    customers: read('content/customers/types.json'),
  };
  return {
    bundle,
    developmentFixture: read('tests/fixtures/business-days/d1-full-day.json'),
    runtimeContract: buildD1PublicRuntimeContract(bundle),
  };
}

function applyInputPatch(inputs, patch) {
  if (!patch) return inputs;
  const next = structuredClone(inputs);
  if (patch.kind === 'order-line') {
    const customer = next.developmentFixture.waves.flatMap((wave) => wave.customers)
      .find(({ order }) => order.id === patch.orderId);
    customer.order.lines = patch.lines;
  }
  if (patch.kind === 'menu-price') next.developmentFixture.economy.menuPrices[patch.menuId] = patch.price;
  if (patch.kind === 'timing') next.developmentFixture.timingMs[patch.field] = patch.value;
  return next;
}

function applyDefinitionPatch(definition, patch) {
  const next = structuredClone(definition);
  if (patch?.kind === 'wave-time') next.waves.find(({ id }) => id === patch.waveId).atMs = patch.atMs;
  return next;
}

describe('작업 008 D1 release definition', () => {
  it('정본 order/customer source를 검증된 fixture wave로 결정적으로 투영한다', () => {
    const inputs = baseInputs();
    const definition = buildD1ReleaseDefinition(inputs);
    expect(definition).toMatchObject({
      schemaVersion: 1,
      sessionTargetMs: 420000,
      seatIds: ['seat-01', 'seat-02', 'seat-03', 'seat-04', 'seat-05', 'seat-06'],
      timingMs: { thinkMin: 4000, thinkMax: 6000, eat: 15000, leave: 1000, cleanup: 3000, waitRecovery: 10000 },
      limits: { maxActiveOrders: 2, maxRiskProcesses: 1 },
      economy: { baseTip: 2, menuPrices: { beer: 6, negima: 3 } },
      totals: { customers: 4, orders: 4, items: 9 },
    });
    expect(definition.waves.map(({ atMs }) => atMs)).toEqual([0, 100000, 220000]);
    expect(definition.waves.flatMap((wave) => wave.customers).map(({ id }) => id))
      .toEqual(['REGULAR_TSUKIOKA', 'D1-OFFICE-A', 'D1-OFFICE-B', 'D1-SOLO-A']);
    expect(definition.waves[1]).toMatchObject({
      requiresOrderCompletionIds: ['D1-ORDER-001'],
      customers: [{ groupId: 'D1-GROUP-OFFICE' }, { groupId: 'D1-GROUP-OFFICE' }],
    });
    expect(definition.waves[2].requiresOrderCompletionIds).toEqual(['D1-ORDER-002-A', 'D1-ORDER-002-B']);
  });

  it('null runtimeCustomerId 엑스트라에 저장 가능한 결정적 runtime ID를 만든다', () => {
    expect(deriveD1ExtraRuntimeId('office', 0)).toBe('D1-OFFICE-A');
    expect(deriveD1ExtraRuntimeId('office', 1)).toBe('D1-OFFICE-B');
    expect(deriveD1ExtraRuntimeId('solo', 0)).toBe('D1-SOLO-A');
  });

  it('정상/오류 fixture에서 schema와 정본 교차 검증을 수행한다', () => {
    for (const fixture of fixtures) {
      const inputs = applyInputPatch(baseInputs(), fixture.inputPatch);
      const definition = applyDefinitionPatch(buildD1ReleaseDefinition(inputs), fixture.definitionPatch);
      const result = validateD1ReleaseDefinition({ definition, inputs, schema });
      expect(result.valid, `${fixture.id}: ${result.errors.join('\n')}`).toBe(fixture.expectedValid);
    }
  });

  it('정본과 fixture가 정상일 때 입력 교차 검증을 통과한다', () => {
    expect(validateD1ReleaseInputs(baseInputs())).toEqual({ valid: true, errors: [] });
  });
});
