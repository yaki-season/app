import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify } from '../../src/core/canonicalJson.js';
import { buildD1PublicRuntimeContract } from '../../src/content/d1PublicRuntimeContract.js';
import { buildD1ReleaseDefinition } from '../../src/content/d1ReleaseDefinition.js';
import { validateD1ReleaseDefinition } from '../../src/content/validateD1ReleaseDefinition.js';

const appRoot = new URL('../../', import.meta.url);
const artifactUrl = new URL('content/releases/d1-business-day-definition.v1.json', appRoot);

function readJson(relativePath) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, appRoot)), 'utf8'));
}

/** Build-time only source loading. The browser consumes only the emitted release artifact. */
export function loadD1ReleaseDefinitionInputs() {
  const bundle = {
    days: [readJson('content/campaign/day-d1.json')],
    orders: readJson('content/orders/early-campaign.json'),
    customers: readJson('content/customers/types.json'),
  };
  return {
    bundle,
    developmentFixture: readJson('tests/fixtures/business-days/d1-full-day.json'),
    runtimeContract: buildD1PublicRuntimeContract(bundle),
  };
}

export function buildD1ReleaseArtifact() {
  const inputs = loadD1ReleaseDefinitionInputs();
  const definition = buildD1ReleaseDefinition(inputs);
  const validation = validateD1ReleaseDefinition({
    definition,
    inputs,
    schema: readJson('content/schema/d1-release-definition.schema.json'),
  });
  if (!validation.valid) {
    throw new TypeError(`D1 release definition 생성 입력이 유효하지 않습니다:\n${validation.errors.join('\n')}`);
  }
  return `${canonicalStringify(definition)}\n`;
}

function topLevelDiff(expected, actual) {
  let actualValue;
  try {
    actualValue = JSON.parse(actual);
  } catch {
    return ['artifact-json'];
  }
  const expectedValue = JSON.parse(expected);
  const keys = new Set([...Object.keys(expectedValue), ...Object.keys(actualValue)]);
  const differences = [...keys]
    .filter((key) => canonicalStringify(expectedValue[key]) !== canonicalStringify(actualValue[key]))
    .sort();
  return differences.length > 0 ? differences : ['serialization'];
}

export function checkD1ReleaseArtifact({ artifact = null } = {}) {
  const expected = buildD1ReleaseArtifact();
  const resolvedArtifact = artifact ?? (existsSync(fileURLToPath(artifactUrl))
    ? readFileSync(fileURLToPath(artifactUrl), 'utf8')
    : null);
  if (resolvedArtifact === expected) return { valid: true, differences: [] };
  return {
    valid: false,
    differences: resolvedArtifact === null ? ['artifact-missing'] : topLevelDiff(expected, resolvedArtifact),
  };
}

export function writeD1ReleaseArtifact() {
  const outputPath = fileURLToPath(artifactUrl);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buildD1ReleaseArtifact(), 'utf8');
  return outputPath;
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] !== undefined && args[0] !== '--write' && args[0] !== '--check')) {
    throw new TypeError('사용법: node tools/content/build-d1-release-definition.mjs [--write|--check]');
  }
  if (args[0] === '--write') {
    console.log(`D1 release artifact 생성: ${writeD1ReleaseArtifact()}`);
    return;
  }
  const result = checkD1ReleaseArtifact();
  if (!result.valid) {
    console.error(`D1 release artifact drift: 최상위 필드 ${result.differences.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('D1 release artifact drift check: 일치');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
