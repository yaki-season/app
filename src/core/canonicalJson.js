// 저장 체크섬과 export 파일이 실행 순서에 흔들리지 않도록 JSON object key를 정렬한다.
// 브라우저·Node에서 같은 결과를 내며 DOM, 저장소, 렌더러에 의존하지 않는다.

function canonicalize(value, seen) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('저장 데이터에는 유한한 숫자만 사용할 수 있습니다.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, seen));
  if (typeof value !== 'object') {
    throw new TypeError(`저장할 수 없는 값입니다: ${typeof value}`);
  }
  if (seen.has(value)) throw new TypeError('순환 참조는 저장할 수 없습니다.');

  seen.add(value);
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined) throw new TypeError(`undefined 값은 저장할 수 없습니다: ${key}`);
    normalized[key] = canonicalize(item, seen);
  }
  seen.delete(value);
  return normalized;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value, new WeakSet()));
}

// 체크섬은 우발적인 잘림·변조 탐지용이다. 보안 서명으로 사용하지 않는다.
export function checksumFor(value) {
  const text = canonicalStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
