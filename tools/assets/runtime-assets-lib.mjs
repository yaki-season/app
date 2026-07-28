import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));

export const appRoot = path.resolve(toolsDirectory, '../..');
export const assetRoot = path.join(appRoot, 'public/assets');
export const manifestPath = path.join(assetRoot, 'manifest.json');
export const schemaPath = path.join(assetRoot, 'manifest.schema.json');
export const artWorkspaceRoot = path.resolve(appRoot, '../art-workspace');

const metadataFiles = new Set([
  'manifest.json',
  'manifest.schema.json',
]);

const forbiddenPathSegments = new Set([
  'source',
  'review',
  'generated',
  'chroma',
  'rejected',
  'captures',
]);

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function assetPathFromUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/assets/')) {
    throw new Error(`런타임 URL은 /assets/로 시작해야 합니다: ${String(url)}`);
  }

  const relative = url.slice('/assets/'.length);
  const resolved = path.resolve(assetRoot, relative);
  if (!relative || !isWithin(assetRoot, resolved)) {
    throw new Error(`런타임 URL이 public/assets 밖을 가리킵니다: ${url}`);
  }
  return resolved;
}

export function createManifestValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat('date', {
    type: 'string',
    validate(value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
    },
  });
  ajv.addFormat('date-time', {
    type: 'string',
    validate(value) {
      return Number.isFinite(new Date(value).valueOf()) && /T/u.test(value);
    },
  });
  return ajv.compile(schema);
}

export function createManifestEntryValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat('date', {
    type: 'string',
    validate(value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
    },
  });
  return ajv.compile({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: schema.$defs,
    $ref: '#/$defs/asset',
  });
}

export async function validateManifestEntry(entry) {
  const schema = await readJson(schemaPath);
  const validate = createManifestEntryValidator(schema);
  if (validate(entry)) return [];
  return (validate.errors ?? []).map(
    (error) => `manifest entry${error.instancePath || '/'}: ${error.message}`,
  );
}

function readPngDimensions(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('유효한 PNG 헤더가 아닙니다.');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('유효한 JPEG 헤더가 아닙니다.');
  }

  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    const isStartOfFrame = (
      marker >= 0xc0
      && marker <= 0xcf
      && ![0xc4, 0xc8, 0xcc].includes(marker)
    );
    if (isStartOfFrame && offset + 7 < buffer.length) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }
    if (length < 2) break;
    offset += length;
  }
  throw new Error('JPEG 치수 정보를 찾지 못했습니다.');
}

function readWebpDimensions(buffer) {
  if (
    buffer.length < 30
    || buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
    || buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    throw new Error('유효한 WebP 헤더가 아닙니다.');
  }

  const chunk = buffer.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }
  if (chunk === 'VP8 ' && buffer.subarray(23, 26).toString('hex') === '9d012a') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  throw new Error('지원하지 않는 WebP 헤더입니다.');
}

export function readRasterDimensions(buffer, format) {
  if (format === 'png') return readPngDimensions(buffer);
  if (format === 'jpeg') return readJpegDimensions(buffer);
  if (format === 'webp') return readWebpDimensions(buffer);
  return null;
}

export function runtimeIdentity(asset) {
  return `${asset.id}@R${asset.sourceRevision}-B${asset.runtimeBuild}`;
}

export function expectedVersionToken(asset) {
  return `-r${asset.sourceRevision}-b${asset.runtimeBuild}`;
}

export function allAssetReferences(asset) {
  return [
    {
      role: 'primary',
      url: asset.url,
      sha256: asset.sha256,
      bytes: asset.bytes,
      format: asset.format,
      dimensions: asset.dimensions,
    },
    ...(asset.companions ?? []),
  ];
}

async function listPayloadFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...await listPayloadFiles(absolute));
      continue;
    }
    const relative = path.relative(assetRoot, absolute).split(path.sep).join('/');
    if (metadataFiles.has(relative) || relative.endsWith('/README.md') || relative === 'README.md') continue;
    result.push(relative);
  }
  return result;
}

function checkForbiddenUrl(url, errors) {
  const segments = url.toLowerCase().split(/[./_-]+/);
  const forbidden = segments.find((segment) => forbiddenPathSegments.has(segment));
  if (forbidden) errors.push(`${url}: 작업용 경로 표식 '${forbidden}'은 runtime asset URL에 사용할 수 없습니다.`);
}

async function verifyReferencedFile(reference, errors, label, format = null, dimensions = null) {
  let file;
  try {
    file = assetPathFromUrl(reference.url);
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
    return;
  }

  checkForbiddenUrl(reference.url, errors);

  let fileStat;
  let buffer;
  try {
    fileStat = await stat(file);
    buffer = await readFile(file);
  } catch {
    errors.push(`${label}: 파일이 없습니다: ${reference.url}`);
    return;
  }

  if (!fileStat.isFile()) {
    errors.push(`${label}: 일반 파일이 아닙니다: ${reference.url}`);
    return;
  }
  if (buffer.byteLength !== reference.bytes) {
    errors.push(`${label}: bytes 불일치 (manifest ${reference.bytes}, 실제 ${buffer.byteLength})`);
  }
  const digest = sha256(buffer);
  if (digest !== reference.sha256) {
    errors.push(`${label}: sha256 불일치 (manifest ${reference.sha256}, 실제 ${digest})`);
  }

  if (format && dimensions) {
    try {
      const actual = readRasterDimensions(buffer, format);
      if (actual && (actual.width !== dimensions.width || actual.height !== dimensions.height)) {
        errors.push(
          `${label}: 치수 불일치 (manifest ${dimensions.width}x${dimensions.height}, 실제 ${actual.width}x${actual.height})`,
        );
      }
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
}

export async function validateRuntimeAssets({ manifest: suppliedManifest } = {}) {
  const errors = [];
  for (const forbiddenDirectory of ['art', 'captures']) {
    const candidate = path.join(appRoot, forbiddenDirectory);
    try {
      const candidateStat = await stat(candidate);
      if (candidateStat.isDirectory()) {
        errors.push(`구현 저장소 금지 디렉터리가 존재합니다: app/${forbiddenDirectory}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const [schema, manifest] = await Promise.all([
    readJson(schemaPath),
    suppliedManifest ? Promise.resolve(suppliedManifest) : readJson(manifestPath),
  ]);
  const validate = createManifestValidator(schema);

  if (!validate(manifest)) {
    for (const error of validate.errors ?? []) {
      errors.push(`manifest${error.instancePath || '/'}: ${error.message}`);
    }
    return { errors, manifest };
  }

  const identities = new Set();
  const urls = new Set();
  const referencedUrls = new Set();

  for (const asset of manifest.assets) {
    const label = runtimeIdentity(asset);
    if (identities.has(asset.id)) {
      errors.push(`${label}: manifest에는 ID별 활성 runtime build를 하나만 둘 수 있습니다.`);
    }
    identities.add(asset.id);

    const versionToken = expectedVersionToken(asset);
    for (const reference of allAssetReferences(asset)) {
      if (!reference.url.includes(versionToken)) {
        errors.push(`${label}: URL에 source revision/runtime build 표식 ${versionToken}이 없습니다: ${reference.url}`);
      }
      if (urls.has(reference.url)) {
        errors.push(`${label}: URL이 중복됩니다: ${reference.url}`);
      }
      urls.add(reference.url);
      referencedUrls.add(reference.url.slice('/assets/'.length));
      await verifyReferencedFile(
        reference,
        errors,
        reference.role === 'primary' ? label : `${label} companion:${reference.role}`,
        reference.format,
        reference.dimensions,
      );
    }

    if (
      (asset.kind === 'atlas'
        || asset.alpha === 'straight'
        || asset.profile === 'standalone-raster')
      && asset.lossPolicy !== 'lossless-required'
    ) {
      errors.push(`${label}: atlas·alpha·standalone raster는 lossless-required여야 합니다.`);
    }
    if (
      asset.kind === 'atlas'
      && asset.dimensions
      && (asset.dimensions.width > 2048 || asset.dimensions.height > 2048)
    ) {
      errors.push(`${label}: atlas는 2048x2048을 넘을 수 없습니다.`);
    }
    if (
      asset.kind === 'texture'
      && asset.dimensions
      && (asset.dimensions.width > 1024 || asset.dimensions.height > 1024)
    ) {
      errors.push(`${label}: object texture는 1024x1024를 넘을 수 없습니다.`);
    }
  }

  for (const payload of await listPayloadFiles(assetRoot)) {
    if (!referencedUrls.has(payload)) {
      errors.push(`manifest에 등록되지 않은 runtime payload가 있습니다: /assets/${payload}`);
    }
  }

  return { errors, manifest };
}
