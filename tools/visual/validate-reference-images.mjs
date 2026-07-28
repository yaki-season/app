#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(toolsDirectory, '../..');
const referenceRoot = path.join(appRoot, 'tests/reference-images');
const checksumPath = path.join(referenceRoot, 'SHA256SUMS');
const expectedCounts = new Map([
  ['scn-001/e2e-state-v2/', 16],
  ['scn-001/manual-qa-v1/', 20],
]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(target));
    } else {
      files.push(target);
    }
  }
  return files;
}

function readPngDimensions(buffer, relative) {
  if (
    buffer.length < 24
    || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  ) {
    throw new Error(`${relative}: 유효한 PNG가 아닙니다.`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

const checksumText = await readFile(checksumPath, 'utf8');
const expected = new Map();
for (const [index, line] of checksumText.split(/\r?\n/u).entries()) {
  if (!line) continue;
  const match = line.match(/^([a-f0-9]{64}) {2}(.+\.png)$/u);
  if (!match) throw new Error(`SHA256SUMS ${index + 1}행 형식이 잘못됐습니다.`);
  const [, digest, relative] = match;
  if (
    path.isAbsolute(relative)
    || relative.includes('\\')
    || relative.split('/').includes('..')
  ) {
    throw new Error(`${relative}: 참조 이미지 경로가 안전하지 않습니다.`);
  }
  if (expected.has(relative)) throw new Error(`${relative}: checksum 항목이 중복됩니다.`);
  expected.set(relative, digest);
}

const actualFiles = (await walk(referenceRoot))
  .filter((file) => file.toLowerCase().endsWith('.png'))
  .map((file) => path.relative(referenceRoot, file).split(path.sep).join('/'))
  .sort();
const expectedFiles = [...expected.keys()].sort();

if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(expectedFiles);
  const missing = expectedFiles.filter((file) => !actualSet.has(file));
  const unlisted = actualFiles.filter((file) => !expectedSet.has(file));
  throw new Error(
    `참조 이미지 목록 불일치 (누락 ${missing.join(', ') || '없음'}; `
    + `미등록 ${unlisted.join(', ') || '없음'})`,
  );
}

for (const [prefix, count] of expectedCounts) {
  const actualCount = actualFiles.filter((file) => file.startsWith(prefix)).length;
  if (actualCount !== count) {
    throw new Error(`${prefix}: ${count}장이 필요하지만 ${actualCount}장입니다.`);
  }
}

for (const relative of actualFiles) {
  const buffer = await readFile(path.join(referenceRoot, relative));
  const digest = createHash('sha256').update(buffer).digest('hex');
  if (digest !== expected.get(relative)) {
    throw new Error(`${relative}: SHA-256이 고정 기준과 다릅니다.`);
  }

  const viewport = relative.match(/(?:^|[-/])(1280x720|1920x1080)(?:[-_/]|$)/u)?.[1];
  if (!viewport) throw new Error(`${relative}: 기준 viewport를 경로에서 읽을 수 없습니다.`);
  const [expectedWidth, expectedHeight] = viewport.split('x').map(Number);
  const dimensions = readPngDimensions(buffer, relative);
  if (
    dimensions.width !== expectedWidth
    || dimensions.height !== expectedHeight
  ) {
    throw new Error(
      `${relative}: ${expectedWidth}x${expectedHeight}가 필요하지만 `
      + `${dimensions.width}x${dimensions.height}입니다.`,
    );
  }
}

console.log(`구현 검증용 참조 이미지 통과: ${actualFiles.length}장`);
