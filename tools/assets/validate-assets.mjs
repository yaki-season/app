#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = join(repoRoot, 'public/assets/manifest.json');
const schemaPath = join(repoRoot, 'public/assets/manifest.schema.json');
const catalogPath = join(repoRoot, 'art/ASSET-CATALOG.md');
const allowedStatuses = new Set(['approved']);
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} JSON parse failed: ${error.message}`);
    return null;
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}

function parsePng(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('invalid PNG signature');
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const idat = [];
  let transparency = null;
  let offset = 8;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (type === 'tRNS') transparency = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IEND') break;
  }

  return { width, height, bitDepth, colorType, channels, idat, transparency };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePngRows(buffer) {
  const info = parsePng(buffer);
  if (info.bitDepth !== 8 || !info.channels || ![3, 4, 6].includes(info.colorType)) {
    throw new Error(`unsupported PNG alpha layout: bitDepth=${info.bitDepth}, colorType=${info.colorType}`);
  }

  const bytesPerPixel = info.channels;
  const stride = info.width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(info.idat));
  const pixels = Buffer.alloc(stride * info.height);
  let rawOffset = 0;

  for (let y = 0; y < info.height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const rowOffset = y * stride;
    const previousOffset = (y - 1) * stride;

    for (let x = 0; x < stride; x += 1) {
      const value = raw[rawOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[previousOffset + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[previousOffset + x - bytesPerPixel]
        : 0;
      let decoded;

      if (filter === 0) decoded = value;
      else if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upperLeft);
      else throw new Error(`unsupported PNG filter ${filter}`);

      pixels[rowOffset + x] = decoded & 0xff;
    }
    rawOffset += stride;
  }

  return { ...info, pixels, stride };
}

function readAlpha(decoded, x, y) {
  if (decoded.colorType === 3) {
    const paletteIndex = decoded.pixels[y * decoded.stride + x];
    return decoded.transparency?.[paletteIndex] ?? 255;
  }
  const alphaOffset = decoded.colorType === 6 ? 3 : 1;
  return decoded.pixels[y * decoded.stride + x * decoded.channels + alphaOffset];
}

function parseJpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('invalid JPEG signature');
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error('JPEG size marker not found');
}

function extractLink(cell) {
  return cell.match(/\[[^\]]+\]\(([^)]+)\)/)?.[1] ?? null;
}

function extractCode(cell) {
  return cell.match(/`([^`]+)`/)?.[1] ?? null;
}

function parseCatalogRegistry(markdown) {
  const start = '<!-- asset-registry:start -->';
  const end = '<!-- asset-registry:end -->';
  const section = markdown.slice(markdown.indexOf(start) + start.length, markdown.indexOf(end));
  if (!markdown.includes(start) || !markdown.includes(end)) {
    fail('catalog registry markers are missing');
    return [];
  }

  return section
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      return {
        id: extractCode(cells[0]),
        legacyId: extractCode(cells[1]),
        status: extractCode(cells[2]),
        assetLink: extractLink(cells[5]),
        sourceLink: extractLink(cells[6]),
        provenanceLink: extractLink(cells[7]),
        sha256: extractCode(cells[9])
      };
    });
}

const manifest = readJson(manifestPath, 'manifest');
readJson(schemaPath, 'manifest schema');
const provenancePath = join(repoRoot, 'art/provenance/legacy-gameplay-assets.json');
const provenance = readJson(provenancePath, 'legacy provenance');
const catalogMarkdown = existsSync(catalogPath) ? readFileSync(catalogPath, 'utf8') : '';
if (!catalogMarkdown) fail('art/ASSET-CATALOG.md is missing or empty');
const catalogRows = parseCatalogRegistry(catalogMarkdown);

if (manifest) {
  const requiredAssetFields = [
    'id', 'revision', 'status', 'pack', 'kind', 'url', 'sha256', 'bytes', 'dimensions',
    'format', 'colorSpace', 'alpha', 'pivot', 'anchors', 'clips', 'mirrorSafe', 'source',
    'provenance', 'license', 'specRefs', 'reviewedAt'
  ];
  const ids = new Set();
  const urls = new Set();
  const registeredFiles = new Set();

  for (const asset of manifest.assets ?? []) {
    for (const field of requiredAssetFields) {
      if (!(field in asset)) fail(`${asset.id ?? '<unknown>'}: required field '${field}' is missing`);
    }
    if (ids.has(asset.id)) fail(`${asset.id}: duplicate id`);
    if (urls.has(asset.url)) fail(`${asset.id}: duplicate url ${asset.url}`);
    ids.add(asset.id);
    urls.add(asset.url);

    if (!allowedStatuses.has(asset.status)) fail(`${asset.id}: runtime status must be approved`);
    if (!manifest.packs?.[asset.pack]) fail(`${asset.id}: unknown pack ${asset.pack}`);
    if (!/^\/assets\/[a-z0-9./-]+$/.test(asset.url)) fail(`${asset.id}: invalid runtime URL ${asset.url}`);
    if (!/^[a-f0-9]{64}$/.test(asset.sha256)) fail(`${asset.id}: invalid SHA-256`);
    if (!Array.isArray(asset.anchors) || !Array.isArray(asset.clips)) fail(`${asset.id}: anchors and clips must be arrays`);
    if (!existsSync(join(repoRoot, asset.source))) fail(`${asset.id}: source is missing: ${asset.source}`);
    if (!existsSync(join(repoRoot, asset.provenance))) fail(`${asset.id}: provenance is missing: ${asset.provenance}`);
    if (asset.kind === 'atlas' && asset.clips.length === 0) fail(`${asset.id}: atlas clips are missing`);

    for (const companion of asset.companions ?? []) {
      if (!/^\/assets\/[a-z0-9./-]+$/.test(companion.url)) {
        fail(`${asset.id}: invalid companion URL ${companion.url}`);
        continue;
      }
      const companionPath = join(repoRoot, 'public', companion.url);
      registeredFiles.add(companionPath);
      if (!existsSync(companionPath)) {
        fail(`${asset.id}: companion file is missing: ${companion.url}`);
        continue;
      }
      const companionBuffer = readFileSync(companionPath);
      if (companionBuffer.length !== companion.bytes) fail(`${asset.id}: companion bytes mismatch for ${companion.url}`);
      if (sha256(companionBuffer) !== companion.sha256) fail(`${asset.id}: companion SHA-256 mismatch for ${companion.url}`);
      if (companion.url.endsWith('.json')) readJson(companionPath, `${asset.id} companion`);
    }

    const runtimePath = join(repoRoot, 'public', asset.url);
    registeredFiles.add(runtimePath);
    if (!existsSync(runtimePath)) {
      fail(`${asset.id}: runtime file is missing: ${asset.url}`);
      continue;
    }

    const buffer = readFileSync(runtimePath);
    if (buffer.length !== asset.bytes) fail(`${asset.id}: bytes ${buffer.length} != ${asset.bytes}`);
    if (sha256(buffer) !== asset.sha256) fail(`${asset.id}: SHA-256 mismatch`);

    try {
      if (asset.format === 'png') {
        const decoded = decodePngRows(buffer);
        if (decoded.width !== asset.dimensions.width || decoded.height !== asset.dimensions.height) {
          fail(`${asset.id}: PNG dimensions do not match manifest`);
        }
        if (asset.alpha !== 'straight') fail(`${asset.id}: alpha PNG must declare straight alpha`);
        const corners = [
          [0, 0], [decoded.width - 1, 0],
          [0, decoded.height - 1], [decoded.width - 1, decoded.height - 1]
        ];
        if (corners.some(([x, y]) => readAlpha(decoded, x, y) !== 0)) {
          fail(`${asset.id}: transparent PNG corner alpha must be zero`);
        }
        let hasVisiblePixel = false;
        for (let y = 0; y < decoded.height && !hasVisiblePixel; y += 1) {
          for (let x = 0; x < decoded.width; x += 1) {
            if (readAlpha(decoded, x, y) > 0) {
              hasVisiblePixel = true;
              break;
            }
          }
        }
        if (!hasVisiblePixel) fail(`${asset.id}: PNG contains no visible pixels`);
      } else if (asset.format === 'jpeg') {
        const dimensions = parseJpegDimensions(buffer);
        if (dimensions.width !== asset.dimensions.width || dimensions.height !== asset.dimensions.height) {
          fail(`${asset.id}: JPEG dimensions do not match manifest`);
        }
        if (asset.alpha !== 'none') fail(`${asset.id}: JPEG must declare alpha none`);
      }
    } catch (error) {
      fail(`${asset.id}: raster validation failed: ${error.message}`);
    }
  }

  const ignoredRuntimeFiles = new Set([manifestPath, schemaPath]);
  for (const path of walkFiles(join(repoRoot, 'public/assets'))) {
    if (ignoredRuntimeFiles.has(path) || path.endsWith('/README.md')) continue;
    if (!registeredFiles.has(path)) fail(`unregistered runtime file: ${relative(repoRoot, path)}`);
  }

  const catalogApproved = catalogRows.filter((row) => row.status === 'approved');
  const approvedIds = new Set(catalogApproved.map((row) => row.id));
  if (catalogApproved.length !== manifest.assets.length) {
    fail(`catalog approved count ${catalogApproved.length} != manifest count ${manifest.assets.length}`);
  }
  for (const asset of manifest.assets) {
    const row = catalogApproved.find((item) => item.id === asset.id);
    if (!row) {
      fail(`${asset.id}: approved manifest item is missing from catalog`);
      continue;
    }
    if (row.sha256 !== asset.sha256) fail(`${asset.id}: catalog SHA-256 mismatch`);
    const linkedRuntime = row.assetLink ? resolve(dirname(catalogPath), row.assetLink) : null;
    const expectedRuntime = join(repoRoot, 'public', asset.url);
    if (linkedRuntime !== expectedRuntime) fail(`${asset.id}: catalog runtime link does not match manifest URL`);
    if (row.legacyId !== (asset.legacyId ?? null)) fail(`${asset.id}: catalog legacy ID mismatch`);
  }
  for (const id of approvedIds) {
    if (!ids.has(id)) fail(`${id}: catalog approved item is missing from manifest`);
  }
}

if (catalogRows.length < 16) fail(`catalog registry must contain at least the 16 migrated rows, found ${catalogRows.length}`);
for (const row of catalogRows) {
  for (const [label, link] of [['asset', row.assetLink], ['source', row.sourceLink], ['provenance', row.provenanceLink]]) {
    if (!link) fail(`${row.id}: catalog ${label} link is missing`);
    else if (!existsSync(resolve(dirname(catalogPath), link))) fail(`${row.id}: catalog ${label} link is broken: ${link}`);
  }
  if (row.status === 'deprecated' && row.assetLink?.includes('../public/assets/')) {
    fail(`${row.id}: deprecated asset must not link to runtime`);
  }
  if (!['approved', 'deprecated'].includes(row.status)) fail(`${row.id}: unexpected migration status ${row.status}`);
  if (!/^[a-f0-9]{64}$/.test(row.sha256 ?? '')) fail(`${row.id}: invalid catalog SHA-256`);
  if (row.status === 'deprecated' && row.assetLink) {
    const reviewBuffer = readFileSync(resolve(dirname(catalogPath), row.assetLink));
    if (sha256(reviewBuffer) !== row.sha256) fail(`${row.id}: review file SHA-256 mismatch`);
  }
}

if (provenance) {
  if ((provenance.assets ?? []).length !== 16) fail('legacy provenance must contain 16 assets');
  const decisions = new Map((provenance.assets ?? []).map((asset) => [asset.legacyId, asset.decision]));
  for (const row of catalogRows) {
    if (row.legacyId && decisions.get(row.legacyId) !== row.status) {
      fail(`${row.id}: provenance decision does not match catalog status`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Asset validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const approvedCount = manifest?.assets?.length ?? 0;
const approvedBytes = manifest?.assets?.reduce((sum, asset) => sum + asset.bytes, 0) ?? 0;
const deprecatedCount = catalogRows.filter((row) => row.status === 'deprecated').length;
console.log(`Asset validation passed: ${approvedCount} approved (${approvedBytes} bytes), ${deprecatedCount} deprecated references, ${catalogRows.length} catalog rows.`);
