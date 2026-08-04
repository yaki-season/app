import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArguments } from '../../tools/assets/promote-runtime-asset.mjs';
import { atomicPromoteBundle } from '../../tools/assets/promotion-transaction.mjs';
import {
  createManifestValidator,
  validateManifestEntry,
} from '../../tools/assets/runtime-assets-lib.mjs';

const temporaryDirectories = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yaki-asset-pipeline-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(
      (directory) => rm(directory, { recursive: true, force: true }),
    ),
  );
});

function validEntry() {
  return {
    id: 'UI-CUSTOMER-ORDER-ICON-NEGIMA',
    sourceRevision: 1,
    runtimeBuild: 2,
    status: 'approved',
    screenUnit: 'SCR-SVC-CUSTOMERS',
    profile: 'standalone-raster',
    pack: 'core',
    kind: 'image',
    url: '/assets/core/ui/order-icon-negima-r1-b2.png',
    sha256: 'a'.repeat(64),
    bytes: 123,
    dimensions: { width: 192, height: 192 },
    format: 'png',
    colorSpace: 'sRGB',
    alpha: 'straight',
    lossPolicy: 'lossless-required',
    pivot: { x: 0.5, y: 0.5 },
    anchors: [],
    clips: [],
    mirrorSafe: false,
    source: 'ARTSRC:UI-CUSTOMER-ORDER-ICON-NEGIMA:R1',
    provenance: 'PROV:UI-CUSTOMER-ORDER-ICON-NEGIMA:R1',
    license: 'project-owned',
    specRefs: ['ART-003 v5.0.0'],
    reviewedAt: '2026-07-28',
  };
}

describe('runtime manifest entry', () => {
  it('stable ID와 source revision/runtime build를 분리한다', async () => {
    expect(await validateManifestEntry(validEntry())).toEqual([]);

    const revisionInId = {
      ...validEntry(),
      id: 'UI-CUSTOMER-ORDER-ICON-NEGIMA-R1',
    };
    expect(await validateManifestEntry(revisionInId)).toContainEqual(
      expect.stringContaining('pattern'),
    );
  });
});

describe('retained runtime payload manifest', () => {
  it('비활성 이전 version도 schema에서 무결성 추적할 수 있다', async () => {
    const current = validEntry();
    const retained = {
      ...validEntry(),
      sourceRevision: 1,
      runtimeBuild: 1,
      url: '/assets/core/ui/order-icon-negima-r1-b1.png',
    };
    const manifest = {
      $schema: 'https://yaki-season.local/assets/manifest.schema.json',
      schemaVersion: '3.0.0',
      generatedAt: '2026-08-03',
      specRefs: ['ART-003 v5.9.0'],
      packs: {
        core: { load: 'startup', description: 'core' },
        campaign: { load: 'stage', description: 'campaign' },
        optional: { load: 'on-demand', description: 'optional' },
      },
      assets: [current],
      retainedAssets: [retained],
    };
    const schema = JSON.parse(await readFile(path.resolve('public/assets/manifest.schema.json'), 'utf8'));
    const validate = createManifestValidator(schema);
    expect(validate(manifest)).toBe(true);
  });
});

describe('atomic bundle promotion', () => {
  it('4 stable asset의 6 payload를 한 manifest transaction으로 반영한다', async () => {
    const root = await temporaryDirectory();
    const manifest = path.join(root, 'manifest.json');
    const transaction = path.join(root, 'transaction');
    const sources = Array.from({ length: 6 }, (_, index) => path.join(root, `source-${index}`));
    const targets = Array.from({ length: 6 }, (_, index) => path.join(root, 'assets', `new-${index}`));
    await writeFile(manifest, '{"version":"old"}\n');
    await Promise.all(sources.map((source, index) => writeFile(source, `new-${index}`)));

    await atomicPromoteBundle({
      transactionDirectory: transaction,
      manifestPath: manifest,
      candidateManifest: { version: 'four-assets-six-payloads' },
      newFiles: sources.map((source, index) => ({ source, target: targets[index] })),
      oldFiles: [],
      validateFinalState: async () => [],
    });

    expect(JSON.parse(await readFile(manifest, 'utf8'))).toEqual({ version: 'four-assets-six-payloads' });
    await Promise.all(targets.map(async (target, index) => {
      expect(await readFile(target, 'utf8')).toBe(`new-${index}`);
    }));
  });

  it('여러 파일과 manifest를 한 트랜잭션으로 반영한다', async () => {
    const root = await temporaryDirectory();
    const manifest = path.join(root, 'manifest.json');
    const transaction = path.join(root, 'transaction');
    const sourceA = path.join(root, 'source-a');
    const sourceB = path.join(root, 'source-b');
    const targetA = path.join(root, 'assets', 'new-a');
    const targetB = path.join(root, 'assets', 'new-b');
    const oldA = path.join(root, 'assets', 'old-a');
    const oldB = path.join(root, 'assets', 'old-b');
    await mkdir(path.dirname(oldA), { recursive: true });
    await Promise.all([
      writeFile(manifest, '{"version":"old"}\n'),
      writeFile(sourceA, 'new-a'),
      writeFile(sourceB, 'new-b'),
      writeFile(oldA, 'old-a'),
      writeFile(oldB, 'old-b'),
    ]);

    const candidateManifest = { version: 'new' };
    await atomicPromoteBundle({
      transactionDirectory: transaction,
      manifestPath: manifest,
      candidateManifest,
      newFiles: [
        { source: sourceA, target: targetA },
        { source: sourceB, target: targetB },
      ],
      oldFiles: [oldA, oldB],
      validateFinalState: async () => [],
    });

    expect(JSON.parse(await readFile(manifest, 'utf8'))).toEqual(candidateManifest);
    expect(await readFile(targetA, 'utf8')).toBe('new-a');
    expect(await readFile(targetB, 'utf8')).toBe('new-b');
    await expect(access(oldA)).rejects.toThrow();
    await expect(access(oldB)).rejects.toThrow();
    await expect(access(transaction)).rejects.toThrow();
  });

  it('manifest 반영 뒤 실패해도 파일 묶음 전체를 복구한다', async () => {
    const root = await temporaryDirectory();
    const manifest = path.join(root, 'manifest.json');
    const transaction = path.join(root, 'transaction');
    const sourceA = path.join(root, 'source-a');
    const sourceB = path.join(root, 'source-b');
    const targetA = path.join(root, 'assets', 'new-a');
    const targetB = path.join(root, 'assets', 'new-b');
    const oldA = path.join(root, 'assets', 'old-a');
    const oldB = path.join(root, 'assets', 'old-b');
    await mkdir(path.dirname(oldA), { recursive: true });
    await Promise.all([
      writeFile(manifest, '{"version":"old"}\n'),
      writeFile(sourceA, 'new-a'),
      writeFile(sourceB, 'new-b'),
      writeFile(oldA, 'old-a'),
      writeFile(oldB, 'old-b'),
    ]);

    await expect(
      atomicPromoteBundle({
        transactionDirectory: transaction,
        manifestPath: manifest,
        candidateManifest: { version: 'new' },
        newFiles: [
          { source: sourceA, target: targetA },
          { source: sourceB, target: targetB },
        ],
        oldFiles: [oldA, oldB],
        validateFinalState: async () => [],
        simulateFailureAfterManifest: true,
      }),
    ).rejects.toThrow('테스트용 manifest 반영 후 실패');

    expect(JSON.parse(await readFile(manifest, 'utf8'))).toEqual({ version: 'old' });
    expect(await readFile(oldA, 'utf8')).toBe('old-a');
    expect(await readFile(oldB, 'utf8')).toBe('old-b');
    await expect(access(targetA)).rejects.toThrow();
    await expect(access(targetB)).rejects.toThrow();
    await expect(access(transaction)).rejects.toThrow();
  });
});

describe('promotion CLI v8 arguments', () => {
  it('read-only preflight와 같은 handoff 배치의 직접 write를 구분한다', () => {
    expect(parseArguments(['--handoff', 'one.json', '--handoff', 'two.json'])).toEqual({
      write: false,
      handoffs: ['one.json', 'two.json'],
    });
    expect(parseArguments(['--handoff', 'one.json', '--write'])).toEqual({
      write: true,
      handoffs: ['one.json'],
    });
  });

  it('폐기된 --receipt를 무시하지 않고 거부한다', () => {
    expect(() => parseArguments([
      '--handoff',
      'one.json',
      '--write',
      '--receipt',
      'old.json',
    ])).toThrow('--receipt는 폐기됐습니다');
  });
});
