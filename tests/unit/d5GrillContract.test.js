import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulateD5GrillTick, validateD5GrillFixture } from '../../src/content/d5GrillContract.js';

const root = new URL('../../', import.meta.url);
const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, root)), 'utf8'));
const contract = read('content/d5/grill-contract.candidate.json');
const schemas = {
  contract: read('content/schema/d5-grill-contract.schema.json'),
  fixture: read('content/schema/d5-grill-fixture.schema.json'),
};
const fixtureDir = fileURLToPath(new URL('../fixtures/d5-grill/', import.meta.url));
const fixtures = readdirSync(fixtureDir)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => read(`tests/fixtures/d5-grill/${file}`));

describe('작업 006-A 격리 D5 고정 그릴·접촉면 계약', () => {
  it('slotCount=6, slotUpgradeEnabled=false를 계약 스키마로 강제한다', () => {
    expect(contract.grill).toEqual({ slotCount: 6, slotUpgradeEnabled: false });
    const invalid = fixtures.find(({ id }) => id === 'D5-GRILL-ERR-SLOT-UPGRADE');
    expect(validateD5GrillFixture(contract, invalid, schemas).valid).toBe(false);
  });

  it('정상·오류 상태 fixture를 독립적으로 판정한다', () => {
    for (const fixture of fixtures) {
      const result = validateD5GrillFixture(contract, fixture, schemas);
      expect(result.valid, `${fixture.id}: ${result.errors.join('\n')}`).toBe(fixture.expectedValid);
    }
  });

  it('카와 candidate는 접은 닭껍질 5개, salt|tare, 면별 10/14/18초를 가진다', () => {
    const kawa = contract.recipes.find(({ id }) => id === 'kawa');
    expect(kawa).toMatchObject({
      status: 'candidate',
      ingredients: Array(5).fill('foldedChickenSkin'),
      seasoningOptions: ['salt', 'tare'],
      faceThresholdsSec: { perfect: 10, over: 14, burnt: 18 },
    });
  });

  it('네기마와 카와는 하나의 양면 품질 테이블을 참조한다', () => {
    const bindings = Object.fromEntries(contract.menuQualityBindings.map(({ menuId, qualityTableId }) => [menuId, qualityTableId]));
    expect(bindings.negima).toBe('bilateral-skewer-quality-v1');
    expect(bindings.kawa).toBe(bindings.negima);
  });

  it('D6 부채 4초는 현재 접촉면인 back에만 누적한다', () => {
    const fixture = fixtures.find(({ id }) => id === 'D6-GRILL-VALID-FAN-CURRENT-CONTACT');
    const transition = fixture.tickTransitions[0];
    expect(simulateD5GrillTick(transition.previous, transition.tick, contract, transition.scenarioId))
      .toEqual(transition.next);
    expect(transition.next.elapsedSec.back - transition.previous.elapsedSec.back).toBe(4);
    expect(transition.next.elapsedSec.front - transition.previous.elapsedSec.front).toBe(0);
    expect(validateD5GrillFixture(contract, fixture, schemas).valid).toBe(true);
  });
});
