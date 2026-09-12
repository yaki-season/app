// UI-004: decode 성공만 재사용하고 실패는 다시 요청한다.
export function createImagePreloader({ createImage = () => new Image(), timeoutMs = 15000 } = {}) {
  const cache = new Map();
  const decoded = new Map();
  function load(url) {
    if (!url) return Promise.reject(new Error('장면 이미지가 등록되지 않았습니다.'));
    if (cache.has(url)) return cache.get(url);
    const request = new Promise((resolve, reject) => {
      const img = createImage();
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.onload = null; img.onerror = null;
        if (error) reject(error); else { decoded.set(url, img); resolve(img); }
      };
      const timer = setTimeout(() => finish(new Error('장면 준비가 지연되고 있습니다.')), timeoutMs);
      img.onload = async () => {
        try { await img.decode?.(); if (!img.naturalWidth) throw new Error(); finish(); }
        catch { finish(new Error('이미지를 표시할 수 없습니다.')); }
      };
      img.onerror = () => finish(new Error('장면 이미지를 불러오지 못했습니다.'));
      img.src = url;
    });
    cache.set(url, request);
    request.catch(() => { if (cache.get(url) === request) cache.delete(url); });
    return request;
  }
  return Object.freeze({ load, get: url => decoded.get(url), prepare: urls => Promise.all([...new Set(urls)].map(load)) });
}

export function waitForPresentation(ready, { timeoutMs = 15000, intervalMs = 25 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    function check() {
      try {
        if (ready()) { resolve(); return; }
        if (Date.now() - started >= timeoutMs) throw new Error('화면 준비가 지연되고 있습니다. 다시 시도해 주세요.');
        setTimeout(check, intervalMs);
      } catch (error) { reject(error); }
    }
    check();
  });
}
