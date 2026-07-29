// D1 첫 주문 — 2.5D 진입점. 승인 아트(배경·손님·카운터)를 같은 셰프 시점 카메라의 깊이 평면으로 합성한다.
//
// 평면 DOM img(d1.html)와 달리, 세 레이어를 서로 다른 z에 놓고 카메라를 가로로 미세하게 흔들어(재정렬 없이
// 위치만 이동) 레이어별 시차(parallax)를 만든다 → 손님이 배경에서 떠 보인다. 세션·컨트롤 로직은 d1/view.js를
// 공유하고, 손님 아트는 phase에 따라 이 장면의 손님 평면 텍스처를 교체해 그린다.

import * as THREE from 'three';
import { makeCamera, billboard } from './render/sceneMath.js';
import { PLAYER_EYE } from './config/screenLayout.js';
import { mountD1, ASSET_URL } from './d1/view.js';

const canvas = document.querySelector('#scene-canvas');
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
const COVER = 1.3; // 창 비율이 16:9와 달라도 가장자리가 드러나지 않게 여유
function layer(url, z, order, opaque) {
  const mat = new THREE.MeshBasicMaterial({
    map: texture(url), transparent: !opaque, depthTest: false, depthWrite: false,
  });
  const mesh = billboard(camera, FULL, z, mat);
  mesh.scale.multiplyScalar(COVER);
  mesh.renderOrder = order;
  scene.add(mesh);
  return { mesh, mat };
}

const bgLayer = layer('/assets/core/customer/background-complete-r3-b1.png', -9, 0, true);
const customerLayer = layer(ASSET_URL.waiting, -6, 1, false);
const tableLayer = layer('/assets/core/customer/service-table-complete-r1-b1.png', -3.5, 2, false);

let currentCustomerUrl = ASSET_URL.waiting;
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
const session = mountD1({ onArt: (url) => setCustomer(url) });

window.__d1SceneDebug = {
  getState: session.getState,
  now: session.now,
  customerTextureUrl: () => currentCustomerUrl,
  ready: () => pending === 0,
  layers: () => [
    { name: 'background', url: '/assets/core/customer/background-complete-r3-b1.png', z: -9 },
    { name: 'customer', url: currentCustomerUrl, z: -6 },
    { name: 'table', url: '/assets/core/customer/service-table-complete-r1-b1.png', z: -3.5 },
  ],
  stop: () => { running = false; },
};
