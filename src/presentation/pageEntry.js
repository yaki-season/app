export function finishPageEntry() {
  document.body.dataset.entryState = 'ready';
  document.querySelector('#entry-status').hidden = true;
}

export function failPageEntry(error) {
  document.body.dataset.entryState = 'error';
  const entry = document.querySelector('#entry-status');
  entry.hidden = false;
  entry.querySelector('h1').textContent = '잠시 문 앞에서 기다려 주세요';
  entry.querySelector('p').textContent = error?.message ?? '화면을 준비하지 못했습니다. 저장된 영업은 유지됩니다.';
  entry.querySelector('.entry-recovery').hidden = false;
}
