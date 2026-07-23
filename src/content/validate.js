// DAT-001 콘텐츠 전체 검증 (Ajv JSON Schema + 교차 규칙).
// SYS-004 §콘텐츠: 개발·빌드·테스트에서 전체 검증한다. Ajv는 브라우저 런타임에서 쓰지 않으므로
// 이 모듈은 Node(테스트·빌드) 전용이다. 런타임 로더는 rules.js의 가벼운 검사만 쓴다.

import Ajv from 'ajv';
import { checkContentRules } from './rules.js';

// bundle: { processes, recipes, customers, days }
// schemas: { process, recipe, customerType, day } — 파싱된 JSON Schema
export function validateContent(bundle, schemas) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validators = {
    processes: ajv.compile(schemas.process),
    recipes: ajv.compile(schemas.recipe),
    customers: ajv.compile(schemas.customerType),
    days: ajv.compile(schemas.day),
  };

  const errors = [];

  // 1. 레코드별 스키마 검증
  for (const [kind, records] of Object.entries(bundle)) {
    const validate = validators[kind];
    if (!validate) continue;
    for (const r of records || []) {
      if (!validate(r)) {
        errors.push(`[${kind}:${r?.id ?? '?'}] 스키마 위반: ${ajv.errorsText(validate.errors)}`);
      }
    }
  }

  // 2. 교차 규칙(참조·중복·구간 순서·상태)은 런타임과 공유한다
  const cross = checkContentRules(bundle);
  errors.push(...cross.errors);

  return { valid: errors.length === 0, errors };
}
