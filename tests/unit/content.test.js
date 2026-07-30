import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateContent } from '../../src/content/validate.js';
import { checkContentRules, approvedOnly } from '../../src/content/rules.js';
import { applyBalanceContent, COOK_THRESHOLDS_SEC, classifyDoneness, DONENESS } from '../../src/config/recipe.js';

const root = new URL('../../', import.meta.url);
const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, root)), 'utf-8'));

// 실제 content/ 파일을 읽어 검증한다.
function loadBundle() {
  return {
    processes: [read('content/processes/grill.json')],
    recipes: [read('content/recipes/negima.json')],
    menus: read('content/menus/early-campaign.json'),
    customers: read('content/customers/types.json'),
    campaignCharacters: read('content/campaign/characters.json'),
    orders: read('content/orders/early-campaign.json'),
    days: [
      read('content/campaign/day-d1.json'),
      read('content/campaign/day-d2.json'),
      read('content/campaign/day-d3.json'),
    ],
    upgrades: read('content/progression/upgrades.json'),
    staff: read('content/staff/staff.json'),
    scenarios: read('content/campaign/scenario.json'),
  };
}

const SCHEMAS = {
  process: read('content/schema/process.schema.json'),
  recipe: read('content/schema/recipe.schema.json'),
  menu: read('content/schema/menu.schema.json'),
  customerType: read('content/schema/customer-type.schema.json'),
  campaignCharacter: read('content/schema/campaign-character.schema.json'),
  order: read('content/schema/order.schema.json'),
  day: read('content/schema/day.schema.json'),
  upgrade: read('content/schema/upgrade.schema.json'),
  staff: read('content/schema/staff.schema.json'),
  scenario: read('content/schema/scenario.schema.json'),
};

function clone(x) {
  return structuredClone(x);
}

describe('실제 콘텐츠', () => {
  it('전체 스키마·교차 검증을 통과한다', () => {
    const result = validateContent(loadBundle(), SCHEMAS);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('모든 레코드가 공통 필드(id·상태·활성)를 가진다', () => {
    const bundle = loadBundle();
    for (const records of Object.values(bundle)) {
      for (const r of records) {
        expect(r.id).toBeTruthy();
        expect(['candidate', 'approved']).toContain(r.status);
        expect(typeof r.active).toBe('boolean');
      }
    }
  });
});

describe('스키마 위반 거부 (Ajv)', () => {
  it('범위를 벗어난 인내심을 거부한다', () => {
    const b = loadBundle();
    b.customers[0].patienceSec = 9999; // max 300 초과
    expect(validateContent(b, SCHEMAS).valid).toBe(false);
  });

  it('알 수 없는 카테고리 슬롯을 거부한다', () => {
    const b = loadBundle();
    b.customers[0].orderSequence = ['ramen'];
    expect(validateContent(b, SCHEMAS).valid).toBe(false);
  });

  it('필수 필드 누락을 거부한다', () => {
    const b = loadBundle();
    delete b.processes[0].faceThresholdsSec;
    expect(validateContent(b, SCHEMAS).valid).toBe(false);
  });
});

describe('교차 규칙 거부 (런타임 공유)', () => {
  it('중복 식별자를 거부한다', () => {
    const b = loadBundle();
    b.customers.push(clone(b.customers[0]));
    const r = checkContentRules(b);
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toMatch(/중복 식별자/);
  });

  it('미정의 공정 참조를 거부한다', () => {
    const b = loadBundle();
    b.recipes[0].processId = 'no-such-process';
    expect(checkContentRules(b).errors.join()).toMatch(/미정의 공정/);
  });

  it('미정의 손님 유형 참조를 거부한다', () => {
    const b = loadBundle();
    b.days[0].customerPool = ['ghost'];
    expect(checkContentRules(b).errors.join()).toMatch(/미정의 손님 유형/);
  });

  it('익힘 구간 순서 위반을 거부한다', () => {
    const b = loadBundle();
    b.processes[0].faceThresholdsSec = { under: 0, perfect: 6, over: 5, burnt: 7 }; // perfect>over
    expect(checkContentRules(b).errors.join()).toMatch(/구간 순서/);
  });
});

describe('성장·직원·시나리오 데이터', () => {
  it('업그레이드·직원·시나리오가 스키마·교차 검증을 통과한다', () => {
    // 실제 데이터에 세 단위가 포함된 상태로 이미 전체 검증을 통과함
    const b = loadBundle();
    expect(b.upgrades.length).toBeGreaterThan(0);
    expect(b.staff.length).toBeGreaterThan(0);
    expect(b.scenarios.length).toBeGreaterThan(0);
  });

  it('업그레이드의 알 수 없는 효과 종류를 거부한다', () => {
    const b = loadBundle();
    b.upgrades[0].effect.kind = 'teleport';
    expect(validateContent(b, SCHEMAS).valid).toBe(false);
  });

  it('미정의 선행 업그레이드 참조를 거부한다', () => {
    const b = loadBundle();
    b.upgrades[0].requiresUpgradeId = 'no-such-upgrade';
    expect(checkContentRules(b).errors.join()).toMatch(/미정의 선행 업그레이드/);
  });

  it('직원 품질 상한은 good|perfect만 허용한다', () => {
    const b = loadBundle();
    b.staff[0].qualityCap = 'legendary';
    expect(validateContent(b, SCHEMAS).valid).toBe(false);
  });

  it('시나리오 날짜 체인이 끊기면 거부한다 (DAT-001 §15)', () => {
    const b = loadBundle();
    b.scenarios[1].nextDay = 'd99'; // 존재하지 않는 날짜
    expect(checkContentRules(b).errors.join()).toMatch(/끊긴 다음 날짜/);
  });

  it('시나리오 첫 날의 prevDay=null은 허용한다', () => {
    const b = loadBundle();
    const first = b.scenarios.find((s) => s.prevDay === null);
    expect(first).toBeTruthy();
    expect(checkContentRules(b).valid).toBe(true);
  });
});

describe('candidate/approved 분리', () => {
  it('candidate는 게임 기본값으로 로드되지 않는다', () => {
    const b = loadBundle();
    // 실제 데이터는 candidate 상태다
    expect(approvedOnly(b.customers)).toEqual([]);

    b.customers[0].status = 'approved';
    expect(approvedOnly(b.customers).map((r) => r.id)).toEqual([b.customers[0].id]);
  });
});

describe('로직이 데이터를 읽는다', () => {
  it('applyBalanceContent가 조리 임계값을 데이터로 덮어쓴다', () => {
    applyBalanceContent({
      processes: [{ id: 'grill-negima', faceThresholdsSec: { under: 0, perfect: 3, over: 6, burnt: 8 } }],
    });
    expect(COOK_THRESHOLDS_SEC[DONENESS.PERFECT]).toBe(3);
    expect(classifyDoneness(2.9)).toBe(DONENESS.UNDER); // 3초 미만은 덜 익음
    expect(classifyDoneness(3.0)).toBe(DONENESS.PERFECT);

    // 다른 테스트에 영향 주지 않도록 실제 데이터 값으로 복원
    applyBalanceContent(loadBundle());
    expect(COOK_THRESHOLDS_SEC[DONENESS.PERFECT]).toBe(8);
  });
});
