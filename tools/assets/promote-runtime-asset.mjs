#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  allAssetReferences,
  appRoot,
  artWorkspaceRoot,
  assetPathFromUrl,
  createManifestValidator,
  isWithin,
  manifestPath,
  readJson,
  readRasterDimensions,
  runtimeIdentity,
  sha256,
  validateManifestEntry,
  validateRuntimeAssets,
} from './runtime-assets-lib.mjs';
import { atomicPromoteBundle } from './promotion-transaction.mjs';
import { assertPromotionSemanticOwnerAlignment } from '../../src/assets/artSemanticOwnerContract.js';

const stagingRoot = path.join(appRoot, '.asset-promotion-staging');
const evidenceSchemas = {
  provenance: 'provenance.schema.json',
  recomposition: 'recomposition-report.schema.json',
  optimization: 'optimization-report.schema.json',
  finalApproval: 'final-approval.schema.json',
};
const profileApprovalSchemas = {
  'complete-layer': 'completion-report.schema.json',
  'standalone-raster': 'standalone-raster-report.schema.json',
  'bundle-model': 'bundle-model-report.schema.json',
};

function usage(message) {
  if (message) console.error(message);
  console.error(
    '사용법: npm run assets:promote -- --handoff ../art-workspace/.../runtime-handoff.json '
    + '[--handoff <추가 handoff> ...] [--write]',
  );
  process.exitCode = 2;
}

export function parseArguments(argv) {
  const result = { write: false, handoffs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') {
      result.write = true;
    } else if (argument === '--receipt') {
      throw new Error(
        '--receipt는 폐기됐습니다. finalizer handoff와 --write를 같은 승격 명령에 지정하십시오.',
      );
    } else if (argument === '--handoff') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} 값이 필요합니다.`);
      result.handoffs.push(value);
      index += 1;
    } else {
      throw new Error(`알 수 없는 인자입니다: ${argument}`);
    }
  }
  return result;
}

function ensureExternalWorkspaceFile(file, label) {
  if (!isWithin(artWorkspaceRoot, file)) {
    throw new Error(`${label}은 ../art-workspace 안에 있어야 합니다: ${file}`);
  }
}

async function readValidatedExternalJson({
  reference,
  baseDirectory,
  schemaFile,
  label,
}) {
  const file = path.resolve(baseDirectory, reference.file);
  ensureExternalWorkspaceFile(file, label);
  const buffer = await readFile(file);
  const digest = sha256(buffer);
  if (digest !== reference.sha256) {
    throw new Error(`${label} SHA-256 불일치: 기록 ${reference.sha256}, 실제 ${digest}`);
  }
  const document = JSON.parse(buffer.toString('utf8'));
  if (schemaFile) {
    const schema = await readJson(
      path.join(artWorkspaceRoot, 'pipeline/schemas', schemaFile),
    );
    const validate = createManifestValidator(schema);
    if (!validate(document)) {
      const details = (validate.errors ?? []).map(
        (error) => `${error.instancePath || '/'} ${error.message}`,
      );
      throw new Error(`${label} schema 오류:\n- ${details.join('\n- ')}`);
    }
  }
  return { file, buffer, document, sha256: digest };
}

async function verifyExternalFileEvidence(reference, baseDirectory, label) {
  const file = path.resolve(baseDirectory, reference.file);
  ensureExternalWorkspaceFile(file, label);
  const fileStat = await stat(file);
  if (!fileStat.isFile()) throw new Error(`${label}이 일반 파일이 아닙니다.`);
  const buffer = await readFile(file);
  const digest = sha256(buffer);
  if (digest !== reference.sha256) {
    throw new Error(`${label} SHA-256 불일치: 기록 ${reference.sha256}, 실제 ${digest}`);
  }
  if (reference.bytes !== undefined && reference.bytes !== buffer.byteLength) {
    throw new Error(`${label} byte가 실제 파일과 일치하지 않습니다.`);
  }
  return { file, buffer, sha256: digest };
}

function rasterFormatFromFile(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.png') return 'png';
  if (extension === '.jpg' || extension === '.jpeg') return 'jpeg';
  if (extension === '.webp') return 'webp';
  return null;
}

function assertRasterDimensions(evidence, expected, label) {
  const format = rasterFormatFromFile(evidence.file);
  if (!format) throw new Error(`${label}은 PNG, JPEG 또는 WebP여야 합니다.`);
  const actual = readRasterDimensions(evidence.buffer, format);
  compareDimensions(expected, actual, label);
}

async function verifyProfileApprovalFiles(profileApproval) {
  const document = profileApproval.document;
  const directory = path.dirname(profileApproval.file);
  if (document.profile === 'complete-layer') {
    await verifyExternalFileEvidence(
      document.approvedCutout,
      directory,
      'profile approved cutout',
    );
    await verifyExternalFileEvidence(
      document.spatialInference,
      directory,
      'profile spatial inference',
    );
    const outputDirectory = path.resolve(directory, '..');
    const completed = await verifyExternalFileEvidence(
      document.outputs.completed,
      outputDirectory,
      'profile completed output',
    );
    const review = await verifyExternalFileEvidence(
      document.outputs.reviewBoard,
      outputDirectory,
      'profile review board',
    );
    assertRasterDimensions(
      completed,
      { width: document.measurements.width, height: document.measurements.height },
      'profile completed output',
    );
    assertRasterDimensions(
      review,
      { width: 1920, height: 1080 },
      'profile review board',
    );
    return;
  }
  if (document.profile === 'standalone-raster') {
    for (const [index, source] of document.sourceEvidence.entries()) {
      await verifyExternalFileEvidence(
        source,
        directory,
        `profile sourceEvidence[${index}]`,
      );
    }
    const output = await verifyExternalFileEvidence(
      document.output,
      directory,
      'profile standalone output',
    );
    const review = await verifyExternalFileEvidence(
      document.reviewBoard,
      directory,
      'profile standalone review board',
    );
    assertRasterDimensions(output, document.output, 'profile standalone output');
    assertRasterDimensions(review, document.reviewBoard, 'profile standalone review board');
    return;
  }
  for (const [index, artifact] of document.artifacts.entries()) {
    await verifyExternalFileEvidence(
      artifact,
      directory,
      `profile artifact[${index}]`,
    );
  }
}

function assertSameIdentity(handoff, document, label) {
  for (const field of ['id', 'profile', 'sourceRevision', 'screenUnit']) {
    if (document[field] !== handoff[field]) {
      throw new Error(`${label}.${field}가 runtime handoff와 일치하지 않습니다.`);
    }
  }
}

function compareDimensions(expected, actual, label) {
  if (!expected && !actual) return;
  if (
    expected?.width !== actual?.width
    || expected?.height !== actual?.height
  ) {
    throw new Error(`${label} 치수가 일치하지 않습니다.`);
  }
}

async function validateHandoff(handoffFile) {
  ensureExternalWorkspaceFile(handoffFile, 'runtime handoff');
  const handoffBuffer = await readFile(handoffFile);
  const handoffSha256 = sha256(handoffBuffer);
  const handoff = JSON.parse(handoffBuffer.toString('utf8'));
  const handoffSchema = await readJson(
    path.join(artWorkspaceRoot, 'pipeline/schemas/runtime-handoff.schema.json'),
  );
  const validateHandoffSchema = createManifestValidator(handoffSchema);
  if (!validateHandoffSchema(handoff)) {
    const details = (validateHandoffSchema.errors ?? []).map(
      (error) => `${error.instancePath || '/'} ${error.message}`,
    );
    throw new Error(`runtime handoff schema 오류:\n- ${details.join('\n- ')}`);
  }

  const handoffDirectory = path.dirname(handoffFile);
  const evidence = {};
  for (const [key, schemaFile] of Object.entries(evidenceSchemas)) {
    evidence[key] = await readValidatedExternalJson({
      reference: handoff.evidence[key],
      baseDirectory: handoffDirectory,
      schemaFile,
      label: `handoff evidence:${key}`,
    });
  }
  const profileApprovalSchema = profileApprovalSchemas[handoff.profile];
  if (!profileApprovalSchema) {
    throw new Error(`지원하지 않는 profile입니다: ${handoff.profile}`);
  }
  evidence.profileApproval = await readValidatedExternalJson({
    reference: handoff.evidence.profileApproval,
    baseDirectory: handoffDirectory,
    schemaFile: profileApprovalSchema,
    label: 'handoff evidence:profileApproval',
  });

  const provenance = evidence.provenance.document;
  assertSameIdentity(handoff, provenance, 'provenance');
  if (provenance.status !== 'approved-by-user' || provenance.runtimeRegistrationAllowed !== false) {
    throw new Error('provenance는 사용자 승인 상태이고 runtimeRegistrationAllowed=false여야 합니다.');
  }
  const profileApproval = evidence.profileApproval.document;
  assertSameIdentity(handoff, profileApproval, 'profile approval');
  if (profileApproval.runtimeRegistrationAllowed !== false) {
    throw new Error('profile approval의 runtimeRegistrationAllowed는 false여야 합니다.');
  }
  if (
    (
      handoff.profile === 'complete-layer'
      && profileApproval.approvalStatus !== 'approved-by-user'
    )
    || (
      handoff.profile !== 'complete-layer'
      && profileApproval.approval?.status !== 'approved-by-user'
    )
  ) {
    throw new Error('profile approval은 사용자 승인 상태여야 합니다.');
  }
  assertPromotionSemanticOwnerAlignment({
    assetId: handoff.id,
    metadataSemanticOwner: profileApproval.semanticOwner,
  });
  await verifyProfileApprovalFiles(evidence.profileApproval);

  const provenanceDirectory = path.dirname(evidence.provenance.file);
  for (const [index, source] of provenance.sourceReferences.entries()) {
    await verifyExternalFileEvidence(
      source,
      provenanceDirectory,
      `provenance sourceReferences[${index}]`,
    );
  }
  await verifyExternalFileEvidence(
    {
      file: provenance.generation.rawChromaSource,
      sha256: provenance.generation.rawChromaSourceSha256,
      bytes: provenance.generation.rawChromaSourceBytes,
    },
    provenanceDirectory,
    'provenance raw chroma source',
  );
  const provenanceOutput = await verifyExternalFileEvidence(
    provenance.output,
    provenanceDirectory,
    'provenance output',
  );

  const recomposition = evidence.recomposition.document;
  if (
    recomposition.screenUnit !== handoff.screenUnit
    || recomposition.status !== 'passed'
    || !recomposition.approvedAssets.some(
      (asset) => (
        asset.id === handoff.id
        && asset.profile === handoff.profile
        && asset.sourceRevision === handoff.sourceRevision
      ),
    )
  ) {
    throw new Error('소비 화면 재조립 증빙이 handoff 대상과 일치하지 않습니다.');
  }
  const recompositionDirectory = path.dirname(evidence.recomposition.file);
  const fhdRecomposition = await verifyExternalFileEvidence(
    recomposition.outputs.fhd,
    recompositionDirectory,
    'FHD recomposition',
  );
  const hdRecomposition = await verifyExternalFileEvidence(
    recomposition.outputs.hd,
    recompositionDirectory,
    '720p recomposition',
  );
  assertRasterDimensions(
    fhdRecomposition,
    recomposition.outputs.fhd,
    'FHD recomposition',
  );
  assertRasterDimensions(
    hdRecomposition,
    recomposition.outputs.hd,
    '720p recomposition',
  );

  const optimization = evidence.optimization.document;
  assertSameIdentity(handoff, optimization, 'optimization');
  if (
    optimization.runtimeBuild !== handoff.runtimeBuild
    || optimization.status !== 'passed'
  ) {
    throw new Error('최적화 증빙의 runtime build 또는 상태가 handoff와 일치하지 않습니다.');
  }
  const optimizationDirectory = path.dirname(evidence.optimization.file);
  const optimizationInput = await verifyExternalFileEvidence(
    optimization.input,
    optimizationDirectory,
    'optimization input',
  );
  if (optimizationInput.sha256 !== provenanceOutput.sha256) {
    throw new Error('optimization input이 승인 provenance output과 일치하지 않습니다.');
  }
  const verifiedOptimizationArtifacts = [];
  for (const [index, artifact] of optimization.artifacts.entries()) {
    const verified = await verifyExternalFileEvidence(
      artifact,
      optimizationDirectory,
      `optimization artifact[${index}]`,
    );
    if (artifact.dimensions) {
      assertRasterDimensions(verified, artifact.dimensions, `optimization artifact[${index}]`);
    }
    verifiedOptimizationArtifacts.push({ ...artifact, file: verified.file });
  }

  const finalApproval = evidence.finalApproval.document;
  if (
    finalApproval.screenUnit !== handoff.screenUnit
    || finalApproval.status !== 'approved-by-user'
    || !finalApproval.assets.includes(handoff.id)
  ) {
    throw new Error('최종 소비 화면 사용자 승인이 handoff 대상과 일치하지 않습니다.');
  }
  const finalApprovalDirectory = path.dirname(evidence.finalApproval.file);
  const approvedRecomposition = await verifyExternalFileEvidence(
    finalApproval.recomposition,
    finalApprovalDirectory,
    'final approval recomposition',
  );
  if (approvedRecomposition.sha256 !== evidence.recomposition.sha256) {
    throw new Error('final approval이 현재 recomposition report를 가리키지 않습니다.');
  }
  const approvedOptimizations = [];
  for (const reference of finalApproval.optimizations) {
    approvedOptimizations.push(
      await verifyExternalFileEvidence(
        reference,
        finalApprovalDirectory,
        'final approval optimization',
      ),
    );
  }
  if (!approvedOptimizations.some(
    (approved) => approved.sha256 === evidence.optimization.sha256,
  )) {
    throw new Error('final approval이 현재 optimization report를 가리키지 않습니다.');
  }

  const manifestEntryEvidence = await readValidatedExternalJson({
    reference: handoff.manifestEntry,
    baseDirectory: handoffDirectory,
    schemaFile: null,
    label: 'runtime manifest entry',
  });
  const entry = manifestEntryEvidence.document;
  const entryErrors = await validateManifestEntry(entry);
  if (entryErrors.length > 0) {
    throw new Error(`runtime manifest entry 오류:\n- ${entryErrors.join('\n- ')}`);
  }
  assertSameIdentity(handoff, entry, 'manifest entry');
  if (entry.runtimeBuild !== handoff.runtimeBuild) {
    throw new Error('manifest entry runtimeBuild가 handoff와 일치하지 않습니다.');
  }

  const artifacts = [];
  for (const artifact of handoff.bundle) {
    const sourceFile = path.resolve(handoffDirectory, artifact.sourceFile);
    ensureExternalWorkspaceFile(sourceFile, `bundle:${artifact.role}`);
    const sourceStat = await stat(sourceFile);
    if (!sourceStat.isFile()) throw new Error(`${artifact.sourceFile}은 일반 파일이 아닙니다.`);
    const source = await readFile(sourceFile);
    const digest = sha256(source);
    if (digest !== artifact.sha256 || source.byteLength !== artifact.bytes) {
      throw new Error(`bundle:${artifact.role} SHA-256 또는 byte가 handoff와 다릅니다.`);
    }
    const dimensions = readRasterDimensions(source, artifact.format);
    if (dimensions) compareDimensions(artifact.dimensions, dimensions, `bundle:${artifact.role}`);
    artifacts.push({ ...artifact, sourceFile, targetFile: assetPathFromUrl(artifact.url) });
  }
  if (artifacts.length !== verifiedOptimizationArtifacts.length) {
    throw new Error('optimization report와 handoff bundle 파일 수가 다릅니다.');
  }
  for (const artifact of artifacts) {
    const optimized = verifiedOptimizationArtifacts.find(
      (candidate) => candidate.role === artifact.role && candidate.url === artifact.url,
    );
    if (
      !optimized
      || optimized.sha256 !== artifact.sha256
      || optimized.bytes !== artifact.bytes
      || optimized.format !== artifact.format
    ) {
      throw new Error(`optimization report와 handoff bundle의 ${artifact.role}이 다릅니다.`);
    }
  }

  const entryReferences = allAssetReferences(entry);
  if (entryReferences.length !== artifacts.length) {
    throw new Error('manifest entry와 handoff bundle 파일 수가 다릅니다.');
  }
  for (const reference of entryReferences) {
    const artifact = artifacts.find(
      (candidate) => candidate.url === reference.url && candidate.role === reference.role,
    );
    if (
      !artifact
      || artifact.sha256 !== reference.sha256
      || artifact.bytes !== reference.bytes
      || artifact.format !== reference.format
    ) {
      throw new Error(`manifest entry와 bundle의 ${reference.role} 파일이 일치하지 않습니다.`);
    }
    compareDimensions(reference.dimensions, artifact.dimensions, `bundle:${artifact.role}`);
  }

  return {
    handoff,
    handoffSha256,
    entry,
    artifacts,
    bundleSha256: sha256(Buffer.from(JSON.stringify(handoff.bundle))),
  };
}

function filterCandidateErrors(errors, artifacts, oldReferences) {
  const expectedMissing = artifacts.map((artifact) => artifact.url);
  const expectedOldPayload = oldReferences.map((reference) => reference.url);
  return errors.filter((error) => {
    if (
      expectedMissing.some(
        (url) => error.includes(`파일이 없습니다: ${url}`),
      )
    ) return false;
    if (
      expectedOldPayload.some(
        (url) => error.includes(`manifest에 등록되지 않은 runtime payload가 있습니다: ${url}`),
      )
    ) return false;
    return true;
  });
}

async function main() {
  let args;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    usage(error.message);
    return;
  }
  if (args.handoffs.length === 0) {
    usage('--handoff가 필요합니다.');
    return;
  }

  const validated = [];
  for (const argument of args.handoffs) {
    const handoffFile = path.resolve(process.cwd(), argument);
    validated.push({ handoffFile, ...await validateHandoff(handoffFile) });
  }
  const entryIds = new Set();
  const artifactUrls = new Set();
  for (const { entry, artifacts } of validated) {
    if (entryIds.has(entry.id)) throw new Error(`batch stable ID가 중복됩니다: ${entry.id}`);
    entryIds.add(entry.id);
    for (const artifact of artifacts) {
      if (artifactUrls.has(artifact.url)) throw new Error(`batch runtime URL이 중복됩니다: ${artifact.url}`);
      artifactUrls.add(artifact.url);
    }
  }
  const manifest = await readJson(manifestPath);
  const existingById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  for (const { entry } of validated) {
    const existing = existingById.get(entry.id);
    if (
      existing
      && (
        entry.sourceRevision < existing.sourceRevision
        || (
          entry.sourceRevision === existing.sourceRevision
          && entry.runtimeBuild <= existing.runtimeBuild
        )
      )
    ) {
      throw new Error(
        `${runtimeIdentity(entry)}은 현재 활성 ${runtimeIdentity(existing)}보다 새 build가 아닙니다.`,
      );
    }
  }

  const replacedIds = new Set(validated.map(({ entry }) => entry.id));
  const newlyRetained = manifest.assets.filter((asset) => replacedIds.has(asset.id));
  const retainedByIdentity = new Map(
    [...(manifest.retainedAssets ?? []), ...newlyRetained]
      .map((asset) => [runtimeIdentity(asset), asset]),
  );
  const candidateManifest = {
    ...manifest,
    generatedAt: new Date().toISOString().slice(0, 10),
    assets: [
      ...manifest.assets.filter((asset) => !replacedIds.has(asset.id)),
      ...validated.map(({ entry }) => entry),
    ],
    retainedAssets: [...retainedByIdentity.values()],
  };
  const artifacts = validated.flatMap((item) => item.artifacts);
  const candidateValidation = await validateRuntimeAssets({ manifest: candidateManifest });
  const candidateErrors = filterCandidateErrors(
    candidateValidation.errors,
    artifacts,
    [],
  );
  if (candidateErrors.length > 0) {
    throw new Error(`handoff dry-run 검증 실패:\n- ${candidateErrors.join('\n- ')}`);
  }

  if (!args.write) {
    for (const item of validated) {
      console.log(`read-only preflight 통과: ${runtimeIdentity(item.entry)}`);
    }
    console.log(`원자 batch: ${validated.length} assets / ${artifacts.length} payloads`);
    console.log('파일 변경 없음. 실제 반영은 같은 handoff 목록에 --write를 추가하십시오.');
    return;
  }

  const transactionDirectory = path.join(
    stagingRoot,
    `batch-${randomUUID()}`,
  );
  await atomicPromoteBundle({
    transactionDirectory,
    manifestPath,
    candidateManifest,
    newFiles: artifacts.map((artifact) => ({
      source: artifact.sourceFile,
      target: artifact.targetFile,
    })),
    oldFiles: [],
    validateFinalState: async () => (await validateRuntimeAssets()).errors,
    simulateFailureAfterManifest:
      process.env.NODE_ENV === 'test'
      && process.env.YAKI_PROMOTION_FAIL_AFTER_MANIFEST === '1',
  });
  console.log(
    `승격 완료: ${validated.map(({ entry }) => runtimeIdentity(entry)).join(', ')} `
    + `(${artifacts.length}개 파일 원자 batch)`,
  );
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`runtime asset 승격 실패: ${error.message}`);
    process.exitCode = 1;
  });
}
