// D1 첫 주문 — 2.5D 진입점. 승인 아트(배경·손님·카운터)를 같은 셰프 시점 카메라의 깊이 평면으로 합성한다.
//
// 평면 DOM img(d1.html)와 달리, 세 레이어를 서로 다른 z에 놓고 카메라를 가로로 미세하게 흔들어(재정렬 없이
// 위치만 이동) 레이어별 시차(parallax)를 만든다 → 손님이 배경에서 떠 보인다. 세션·컨트롤 로직은 d1/view.js를
// 공유하고, 손님 아트는 phase에 따라 이 장면의 손님 평면 텍스처를 교체해 그린다.

import * as THREE from 'three';
import { makeCamera, billboard } from './render/sceneMath.js';
import { PLAYER_EYE } from './config/screenLayout.js';
import { loadD1RuntimeAssets } from './assets/runtimeAssetResolver.js';
import { mountD1 } from './d1/view.js';

const canvas = document.querySelector('#scene-canvas');
const sceneStatus = document.querySelector('#scene-status');
const sceneTitle = document.querySelector('#scene-title');
const sceneDescription = document.querySelector('#scene-description');
const assets = await loadD1RuntimeAssets();
document.body.dataset.assetPlaceholderCount = String(assets.readiness.placeholderCount);
document.body.dataset.runtimeAssetsReady = String(assets.readiness.ready);
document.body.dataset.runtimeContractValid = String(assets.readiness.contractAudit.valid);
document.documentElement.style.setProperty('--order-panel-skin', `url("${assets.ORDER_PANEL.url}")`);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setClearColor(0x0f0b08, 1);
const scene = new THREE.Scene();

// 단일 손님 셰프 시점. 정면·수평 시선(풀프레임 합성이 키스톤 없이 화면을 채우도록).
const eye = new THREE.Vector3(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
const look = new THREE.Vector3(0, PLAYER_EYE.y, -6);
const camera = makeCamera(eye, look); // 이후 방향(quaternion)은 고정하고 위치만 흔든다.

// ── 텍스처 로딩 (승인 URL만) ──────────────────────────────────
const loader = new THREE.TextureLoader();
let pending = 0;
const texCache = new Map();
function texture(url) {
  if (texCache.has(url)) return texCache.get(url);
  pending += 1;
  const tex = loader.load(url, () => { pending -= 1; }, undefined, () => { pending -= 1; });
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(url, tex);
  return tex;
}

// ── 깊이 레이어 (풀프레임 빌보드, painter 순서로 합성) ────────────
const FULL = { x: 0, y: 0, width: 1, height: 1 };
function layer(url, z, order, opaque, rect = FULL) {
  const mat = new THREE.MeshBasicMaterial({
    map: texture(url), transparent: !opaque, depthTest: false, depthWrite: false,
  });
  const mesh = billboard(camera, rect, z, mat);
  mesh.renderOrder = order;
  scene.add(mesh);
  return { mesh, mat };
}

const bgLayer = layer(assets.CUSTOMER_BACKGROUND.url, -9, 0, true);
const seatingLayer = layer(assets.CUSTOMER_SEATING.url, -7, 1, false, {
  x: 10 / 1920,
  y: -117 / 1080,
  width: (1672 * 1.13679424) / 1920,
  height: (941 * 1.13679424) / 1080,
});
const customerLayer = layer(assets.TSUKIOKA_WAITING.url, -6, 2, false);
const tableLayer = layer(assets.SERVICE_TABLE.url, -3.5, 3, false);

let currentCustomerUrl = assets.TSUKIOKA_WAITING.url;
let currentBackgroundUrl = assets.CUSTOMER_BACKGROUND.url;
function setBackground(url) {
  if (url === currentBackgroundUrl) return;
  currentBackgroundUrl = url;
  bgLayer.mat.map = texture(url);
  bgLayer.mat.needsUpdate = true;
}
function setCustomer(url) {
  if (url === currentCustomerUrl) return;
  currentCustomerUrl = url;
  customerLayer.mat.map = texture(url);
  customerLayer.mat.needsUpdate = true;
}

// ── 미세 시차 흔들림 + rAF 루프 ─────────────────────────────────
const AMP_X = 0.14; // 월드 단위 가로 진폭
const AMP_Y = 0.06;
function resize() {
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  camera.aspect = h > 0 ? w / h : 16 / 9;
  camera.updateProjectionMatrix();
}
let running = true;
function frame(nowMs) {
  if (!running) return;
  const t = nowMs / 1000;
  // 방향은 그대로 두고 위치만 이동 → 레이어(서로 다른 z)가 다른 양으로 밀려 시차가 생긴다.
  camera.position.set(eye.x + Math.sin(t * 0.5) * AMP_X, eye.y + Math.sin(t * 0.37) * AMP_Y, eye.z);
  camera.updateMatrixWorld(true);
  resize();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ── D1 세션 구동: 손님 아트를 phase에 따라 텍스처로 교체 ──────────
function renderScene({ kind, customerAsset, pendingAssetIds }) {
  if (kind === 'customer') {
    canvas.hidden = false;
    setBackground(assets.CUSTOMER_BACKGROUND.url);
    customerLayer.mesh.visible = true;
    seatingLayer.mesh.visible = true;
    tableLayer.mesh.visible = true;
    sceneStatus.classList.add('approved');
    sceneStatus.dataset.assetState = 'approved';
    sceneStatus.dataset.manifestId = customerAsset.id;
    sceneStatus.removeAttribute('data-missing-asset-ids');
    sceneTitle.textContent = '승인 runtime 아트 적용';
    sceneDescription.textContent = `gameplay 상태 → ${customerAsset.id}@R${customerAsset.sourceRevision}-B${customerAsset.runtimeBuild}`;
    return;
  }
  if (kind === 'drink') {
    canvas.hidden = false;
    setBackground(assets.DRINK_BACKGROUND.url);
    customerLayer.mesh.visible = false;
    seatingLayer.mesh.visible = false;
    tableLayer.mesh.visible = false;
    sceneStatus.classList.remove('approved');
    sceneStatus.dataset.assetState = 'partial';
    sceneStatus.dataset.manifestId = assets.DRINK_BACKGROUND.id;
    sceneStatus.dataset.missingAssetIds = pendingAssetIds.join(',');
    sceneTitle.textContent = '승인 생맥주 작업 배경 적용';
    sceneDescription.textContent =
      `gameplay drink.scene → ${assets.DRINK_BACKGROUND.id}@R`
      + `${assets.DRINK_BACKGROUND.sourceRevision}-B${assets.DRINK_BACKGROUND.runtimeBuild}; `
      + `개발 중 asset ID: ${pendingAssetIds.join(', ')}`;
    return;
  }
  canvas.hidden = true;
  sceneStatus.classList.remove('approved');
  sceneStatus.dataset.assetState = 'placeholder';
  sceneStatus.dataset.missingAssetIds = pendingAssetIds.join(',');
  sceneStatus.removeAttribute('data-manifest-id');
  sceneTitle.textContent = kind === 'assembly' ? '네기마 조립 화면' : '숯불 그릴 화면';
  sceneDescription.textContent = `승인됐지만 finalizer runtime handoff가 없어 개발 중 placeholder로 표시합니다. 대기 asset ID: ${pendingAssetIds.join(', ')}`;
}

const session = mountD1({
  assets,
  onArt: (asset) => setCustomer(asset.url),
  onScene: renderScene,
});

window.__d1SceneDebug = {
  getState: session.getState,
  now: session.now,
  assetReadiness: () => assets.readiness,
  customerTextureUrl: () => currentCustomerUrl,
  backgroundTextureUrl: () => currentBackgroundUrl,
  ready: () => pending === 0,
  layers: () => [
    { name: 'background', url: currentBackgroundUrl, z: -9 },
    { name: 'seating', url: assets.CUSTOMER_SEATING.url, z: -7 },
    { name: 'customer', url: currentCustomerUrl, z: -6 },
    { name: 'table', url: assets.SERVICE_TABLE.url, z: -3.5 },
  ],
  stop: () => { running = false; },
};
