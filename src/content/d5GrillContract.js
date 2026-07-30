// 작업 006-A 전용 D5 후보 계약 검증기.
// 기존 loader/rules와 독립적이며, Developer 1 회귀 handoff 뒤 006-B에서만 공용 통합한다.

import Ajv from 'ajv';

const FACES = ['front', 'back'];

function pushSchemaErrors(errors, label, ajv, validate) {
  if (!validate.errors) return;
  errors.push(`[${label}] 스키마 위반: ${ajv.errorsText(validate.errors)}`);
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

function mergedContract(contract, patch = {}) {
  return {
    ...contract,
    grill: { ...contract.grill, ...patch.grill },
    d5Guide: { ...contract.d5Guide, ...patch.d5Guide },
  };
}

function validateContractRules(contract, errors) {
  const tableIds = new Set();
  for (const table of contract.qualityTables || []) {
    if (tableIds.has(table.id)) errors.push(`[qualityTable:${table.id}] 중복 품질 테이블 식별자`);
    tableIds.add(table.id);
  }

  const bindingByMenu = new Map((contract.menuQualityBindings || []).map((binding) => [binding.menuId, binding]));
  const recipeById = new Map((contract.recipes || []).map((recipe) => [recipe.id, recipe]));
  const negimaBinding = bindingByMenu.get('negima');
  const kawaBinding = bindingByMenu.get('kawa');
  const negima = recipeById.get('negima');
  const kawa = recipeById.get('kawa');

  if (!negimaBinding || !kawaBinding || negimaBinding.qualityTableId !== kawaBinding.qualityTableId) {
    errors.push('[qualityBindings] 네기마와 카와는 같은 양면 품질 테이블을 참조해야 함');
  }
  for (const [menuId, binding] of bindingByMenu) {
    if (!tableIds.has(binding.qualityTableId)) errors.push(`[qualityBinding:${menuId}] 미정의 품질 테이블 참조`);
  }
  for (const recipe of contract.recipes || []) {
    const thresholds = recipe.faceThresholdsSec;
    if (!tableIds.has(recipe.qualityTableId)) errors.push(`[recipe:${recipe.id}] 미정의 품질 테이블 참조`);
    if (thresholds && !(thresholds.perfect <= thresholds.over && thresholds.over <= thresholds.burnt)) {
      errors.push(`[recipe:${recipe.id}] 면별 익힘 경계 순서 위반`);
    }
    if (bindingByMenu.get(recipe.id)?.qualityTableId !== recipe.qualityTableId) {
      errors.push(`[recipe:${recipe.id}] 메뉴 양면 품질 테이블 참조 불일치`);
    }
  }

  if (!negima || !kawa) errors.push('[recipes] 네기마와 카와 후보 레코드가 모두 필요함');
  if (kawa) {
    if (!sameMembers(kawa.ingredients || [], Array(5).fill('foldedChickenSkin'))) {
      errors.push('[recipe:kawa] 접은 닭껍질은 정확히 5개여야 함');
    }
    if (!sameMembers(kawa.seasoningOptions || [], ['salt', 'tare'])) {
      errors.push('[recipe:kawa] seasoningOptions는 salt|tare여야 함');
    }
    const thresholds = kawa.faceThresholdsSec || {};
    if (thresholds.perfect !== 10 || thresholds.over !== 14 || thresholds.burnt !== 18) {
      errors.push('[recipe:kawa] 면별 경계는 perfect=10, over=14, burnt=18초여야 함');
    }
  }
  if (contract.d5Guide?.properHighlight !== true || contract.d5Guide?.qualityWindowAdjustmentSec !== 0) {
    errors.push('[d5Guide] 적정 강조는 실제 판정 범위를 넓힐 수 없음');
  }
  const fan = contract.fanBoost || {};
  if (
    fan.boostElapsedSec !== 4
    || fan.cooldownSec !== 9
    || fan.unlockScenarioId !== 'd5'
    || fan.availableFromScenarioId !== 'd6'
    || fan.scope !== 'currentContactFace'
  ) {
    errors.push('[fanBoost] D6 부채는 현재 접촉면에만 4초를 적용해야 함');
  }
}

function validateTickTransition(transition, contract, errors) {
  const { previous, next, tick } = transition;
  const deltas = Object.fromEntries(FACES.map((face) => [face, next.elapsedSec[face] - previous.elapsedSec[face]]));
  if (previous.id !== next.id) errors.push(`[transition:${transition.id}] 제작물 식별자가 tick 중 바뀜`);
  for (const face of FACES) {
    if (deltas[face] < 0) errors.push(`[transition:${transition.id}] ${face} 누적 시간이 감소함`);
  }

  const contactFace = previous.contactFace;
  if (!contactFace) {
    if (deltas.front !== 0 || deltas.back !== 0) {
      errors.push(`[transition:${transition.id}] 비접촉 제작물의 양면 누적 시간은 정지해야 함`);
    }
    return;
  }

  const otherFace = contactFace === 'front' ? 'back' : 'front';
  if (deltas[otherFace] !== 0) {
    errors.push(`[transition:${transition.id}] 한 tick에서 현재 접촉면 외의 시간이 증가함`);
  }
  if (deltas[contactFace] !== tick.elapsedSec) {
    errors.push(`[transition:${transition.id}] 현재 접촉면 누적 증가는 tick 시간과 같아야 함`);
  }
  if (tick.kind === 'fan') {
    if (transition.scenarioId !== contract.fanBoost.availableFromScenarioId) {
      errors.push(`[transition:${transition.id}] 부채는 D6부터 적용해야 함`);
    }
    if (tick.elapsedSec !== contract.fanBoost.boostElapsedSec) {
      errors.push(`[transition:${transition.id}] 부채 증가는 4초여야 함`);
    }
  }
}

// 006-A fixture 재생용 최소 시뮬레이터. 본편 상태 머신을 대체하거나 의존하지 않는다.
export function simulateD5GrillTick(product, tick, contract, scenarioId) {
  const next = structuredClone(product);
  if (next.grillPlacementState !== 'active' || !next.contactFace) return next;
  if (tick.kind === 'fan') {
    if (scenarioId !== contract.fanBoost.availableFromScenarioId) {
      throw new Error('D6 이전에는 부채 tick을 적용할 수 없음');
    }
    if (tick.elapsedSec !== contract.fanBoost.boostElapsedSec) {
      throw new Error('부채 tick은 계약된 4초여야 함');
    }
  }
  next.elapsedSec[next.contactFace] += tick.elapsedSec;
  return next;
}

/**
 * 006-A의 후보 데이터 및 격리 시뮬레이터 fixture를 함께 검증한다.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateD5GrillFixture(contract, fixture, schemas) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateContract = ajv.compile(schemas.contract);
  const validateFixture = ajv.compile(schemas.fixture);
  const errors = [];
  const effectiveContract = mergedContract(contract, fixture.contractPatch);

  if (!validateContract(effectiveContract)) pushSchemaErrors(errors, `contract:${effectiveContract.id ?? '?'}`, ajv, validateContract);
  if (!validateFixture(fixture)) pushSchemaErrors(errors, `fixture:${fixture.id ?? '?'}`, ajv, validateFixture);
  validateContractRules(effectiveContract, errors);
  for (const transition of fixture.tickTransitions || []) {
    validateTickTransition(transition, effectiveContract, errors);
  }

  return { valid: errors.length === 0, errors };
}
