import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  appRoot,
  isWithin,
  manifestPath,
  sha256,
} from './runtime-assets-lib.mjs';

export const receiptRoot = path.join(appRoot, '.asset-promotion-receipts');
const receiptLifetimeMs = 30 * 60 * 1000;

function safeIdentity(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/gu, '-');
}

export async function createPromotionReceipt({
  handoffFile,
  handoffSha256,
  identity,
  bundleSha256,
  now = new Date(),
  receiptDirectory = receiptRoot,
  currentManifestPath = manifestPath,
}) {
  const manifest = await readFile(currentManifestPath);
  const nonce = randomUUID();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.valueOf() + receiptLifetimeMs).toISOString();
  const receipt = {
    schemaVersion: 1,
    nonce,
    identity,
    handoffFile,
    handoffSha256,
    manifestSha256: sha256(manifest),
    bundleSha256,
    issuedAt,
    expiresAt,
    consumed: false,
  };
  await mkdir(receiptDirectory, { recursive: true });
  const receiptFile = path.join(
    receiptDirectory,
    `${safeIdentity(identity)}-${nonce}.json`,
  );
  await writeFile(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  return { receipt, receiptFile };
}

export async function validatePromotionReceipt({
  receiptFile,
  handoffFile,
  handoffSha256,
  identity,
  bundleSha256,
  now = new Date(),
  receiptDirectory = receiptRoot,
  currentManifestPath = manifestPath,
}) {
  const resolved = path.resolve(receiptFile);
  if (!isWithin(receiptDirectory, resolved)) {
    throw new Error(
      `승격 영수증은 ${path.relative(appRoot, receiptDirectory)} 안에 있어야 합니다.`,
    );
  }
  const receiptStat = await stat(resolved);
  if (!receiptStat.isFile()) throw new Error('승격 영수증이 일반 파일이 아닙니다.');
  const receipt = JSON.parse(await readFile(resolved, 'utf8'));
  if (receipt.schemaVersion !== 1 || receipt.consumed !== false) {
    throw new Error('승격 영수증 상태가 유효하지 않습니다.');
  }
  if (new Date(receipt.expiresAt).valueOf() <= now.valueOf()) {
    throw new Error('승격 영수증이 만료됐습니다. dry-run을 다시 실행하십시오.');
  }
  const manifest = await readFile(currentManifestPath);
  const expected = {
    handoffFile,
    handoffSha256,
    identity,
    bundleSha256,
    manifestSha256: sha256(manifest),
  };
  for (const [field, value] of Object.entries(expected)) {
    if (receipt[field] !== value) {
      throw new Error(`승격 영수증 ${field}가 현재 입력과 일치하지 않습니다.`);
    }
  }
  return { receipt, receiptFile: resolved };
}

export async function consumePromotionReceipt(receiptFile) {
  await unlink(receiptFile);
}
