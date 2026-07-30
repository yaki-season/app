import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildD1PublicRuntimeContract,
  calculateD1PublicSettlement,
  validateD1PublicRuntimeFixture,
} from '../../src/content/d1PublicRuntimeContract.js';

const root = new URL('../../', import.meta.url);
const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, root)), 'utf8'));
const bundle = {
  days: [read('content/campaign/day-d1.json')],
  orders: read('content/orders/early-campaign.json'),
};
const contract = buildD1PublicRuntimeContract(bundle);
const fixtureDir = fileURLToPath(new URL('../fixtures/d1-public-runtime/', import.meta.url));
const fixtures = readdirSync(fixtureDir)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => read(`tests/fixtures/d1-public-runtime/${file}`));

describe('작업 007 D1 공개 runtime 데이터 계약', () => {
  it('정본 D1에서 공개 runtime config를 투영한다', () => {
    expect(contract.runtime).toMatchObject({
      spawnIntervalSec: 30,
      economy: { basePrice: 3, qualityMultGood: 1, qualityMultLow: 0.4, tipBase: 2 },
      expected: { customers: 4, orders: 4, items: 9 },
      firstOrder: {
        id: 'D1-ORDER-001',
        items: [
          { menuId: 'beer', quantity: 1, seasoning: 'none' },
          { menuId: 'negima', quantity: 3, seasoning: 'none' },
        ],
      },
      grill: { slotCount: 6, slotUpgradeEnabled: false },
    });
  });

  it('정상 fixture와 과거 상수·D1 불변식 오류 fixture를 구분한다', () => {
    for (const fixture of fixtures) {
      const result = validateD1PublicRuntimeFixture(contract, fixture);
      expect(result.valid, `${fixture.id}: ${result.errors.join('\n')}`).toBe(fixture.expectedValid);
    }
  });

  it('Good 1건과 Low 1건의 정산 기대값을 계약 economy에서 계산한다', () => {
    const calculated = calculateD1PublicSettlement(contract.runtime.economy, ['good', 'low']);
    expect(contract.settlementExample).toEqual(calculated);
    const legacy = fixtures.find(({ id }) => id === 'D1-PUBLIC-RUNTIME-ERR-LEGACY-SETTLEMENT-250');
    expect(validateD1PublicRuntimeFixture(contract, legacy).valid).toBe(false);
  });
});
