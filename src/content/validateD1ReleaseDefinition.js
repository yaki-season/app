// D1 release definition은 Node 테스트/빌드에서 Ajv로 검증한다. runtime builder는 Ajv에 의존하지 않는다.

import Ajv from 'ajv';
import { releaseDefinitionEqualsExpected, validateD1ReleaseInputs } from './d1ReleaseDefinition.js';

export function validateD1ReleaseDefinition({ definition, inputs, schema }) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const errors = [];
  if (!validate(definition)) errors.push(`[definition] 스키마 위반: ${ajv.errorsText(validate.errors)}`);
  const inputValidation = validateD1ReleaseInputs(inputs);
  errors.push(...inputValidation.errors);
  if (inputValidation.valid && !releaseDefinitionEqualsExpected(definition, inputs)) {
    errors.push('[definition] 정본 콘텐츠·검증 fixture에서 결정적으로 투영된 값과 다름');
  }
  return { valid: errors.length === 0, errors };
}
