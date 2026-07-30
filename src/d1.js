// D1 첫 주문 — 평면 DOM 아트 레이어 진입점. 세션·컨트롤은 d1/view.js가 소유하고,
// 손님 아트는 .art-stage의 <img> src를 교체해 그린다. (2.5D 진입점은 d1-scene.js.)
import { ASSET_URL, mountD1, runtimeAssetUrl } from './d1/view.js';

const customerArt = document.querySelector('#customer-art');
for (const image of document.querySelectorAll('[data-runtime-src]')) {
  image.src = runtimeAssetUrl(image.dataset.runtimeSrc);
}
document.documentElement.style.setProperty('--order-panel-skin', `url("${ASSET_URL.orderPanel}")`);

const session = mountD1({
  onArt: (url) => { if (customerArt.getAttribute('src') !== url) customerArt.setAttribute('src', url); },
});

window.__d1Debug = { getState: session.getState, now: session.now };
