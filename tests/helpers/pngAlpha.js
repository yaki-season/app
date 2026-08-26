// 8bit RGBA(colorType 6, non-interlaced) PNG의 알파 채널만 언필터링해 읽는다.
// 승인 라스터의 누끼·인물 위치를 코드가 직접 검사할 수 있게 하는 테스트 전용 디코더다.
import { inflateSync } from 'node:zlib';

export function readPngAlpha(bytes) {
  if (bytes.subarray(1, 4).toString() !== 'PNG') throw new Error('PNG이 아닙니다');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes.readUInt8(24);
  const colorType = bytes.readUInt8(25);
  const interlace = bytes.readUInt8(28);
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`지원하지 않는 PNG 형식입니다 (depth=${bitDepth} colorType=${colorType} interlace=${interlace})`);
  }

  const idat = [];
  for (let offset = 8; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString();
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const bpp = 4;
  const stride = width * bpp;
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  const alpha = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const filter = raw[start];
    raw.copy(line, 0, start + 1, start + 1 + stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 0xff;
      else if (filter === 2) line[i] = (line[i] + b) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    for (let x = 0; x < width; x += 1) alpha[y * width + x] = line[x * bpp + 3];
    line.copy(prev);
  }
  return { width, height, alpha, at: (x, y) => alpha[y * width + x] };
}

// 알파가 threshold를 넘는 픽셀의 bounding box. 비어 있으면 null.
export function alphaBounds({ width, height, alpha }, threshold = 8) {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}
