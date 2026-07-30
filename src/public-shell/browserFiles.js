export const PUBLIC_FILE_LIMIT_BYTES = 2 * 1024 * 1024;

export async function readTextFile(file, { limit = PUBLIC_FILE_LIMIT_BYTES } = {}) {
  if (!file) throw new TypeError('선택한 파일이 없습니다.');
  if (file.size > limit) throw new RangeError('저장 파일은 2MB 이하여야 합니다.');
  return file.text();
}

export function downloadTextFile({
  fileName,
  mediaType = 'application/json',
  text,
  documentRef = document,
  urlRef = URL,
}) {
  const blob = new Blob([text], { type: mediaType });
  const href = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  queueMicrotask(() => urlRef.revokeObjectURL(href));
}

export async function copyText(text, {
  navigatorRef = navigator,
  documentRef = document,
} = {}) {
  if (navigatorRef.clipboard?.writeText) {
    await navigatorRef.clipboard.writeText(text);
    return;
  }
  const field = documentRef.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  documentRef.body.append(field);
  field.select();
  const copied = documentRef.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('클립보드 복사를 지원하지 않는 브라우저입니다.');
}
