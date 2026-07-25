// 2.5D가 DOM 2D와 뭐가 다른지 눈으로 보여주는 시연.
// 같은 구성(배경·손님·카운터·작업대·꼬치)을 두 카메라로 렌더한다:
//   flat  : 정면·부동 → 납작한 사각형 스택 (DOM 2D와 사실상 동일)
//   depth : 셰프 시점으로 살짝 위에서 내려다봄 → 바닥이 멀어지고, 카운터가 손님 하체를 가리고,
//           카메라를 좌우로 밀면 레이어가 깊이별로 다르게 움직인다(시차).
import * as THREE from 'three';

const canvas = document.getElementById('c');
const label = document.getElementById('label');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x0f0b08, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);

// 은은한 조명 — 면의 방향이 보여야 입체가 읽힌다 (게임 렌더는 무광이지만 여기선 형태 시연용)
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const key = new THREE.DirectionalLight(0xfff1dd, 0.9);
key.position.set(3, 8, 6);
scene.add(key);

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}

// ── 바닥 (깊이를 파는 핵심) ─────────────────────────────
const grid = new THREE.GridHelper(60, 40, 0x5a4632, 0x2a2018);
grid.position.set(0, -3, -14);
scene.add(grid);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 40),
  new THREE.MeshStandardMaterial({ color: 0x1b140e, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, -3.02, -14);
scene.add(floor);

// ── 레이어 (게임과 같은 순서: 배경→손님→카운터→작업대→꼬치) ──
// 배경 벽 (멀리)
box(48, 22, 0.5, 0x2c211a, 0, 4, -22);
// 손님 3명 (바닥에 서 있고, 카운터 뒤)
const seatX = [-6, 0, 6];
seatX.forEach((x, i) => box(3.2, 6.5, 1.6, i === 1 ? 0x8a7563 : 0x6f5c4b, x, 0.25, -9));
// 고정 바 카운터 (손님 앞 → 하체를 가림)
box(46, 3.4, 2.2, 0x4a3826, 0, -1.4, -5.5);
box(46, 0.5, 2.6, 0x6b5334, 0, 0.4, -5.4); // 카운터 상판 립
// 플레이어측 작업대 (가까이)
box(30, 2.2, 4, 0x3a2d20, 0, -2.2, -1.5);
// 그릴 꼬치 (작업대 위)
box(0.35, 0.35, 5, 0xc9a86a, -2, -0.9, -1.2);
box(1.1, 1.1, 0.5, 0xd98a5f, -2, -0.9, 1.0); // 꼬치 재료 덩어리

// ── 두 카메라 모드 ─────────────────────────────────────
function applyFlat() {
  camera.fov = 20; // 원근 최소화 → 납작
  camera.position.set(0, 0.3, 30);
  camera.lookAt(0, 0.3, 0);
  camera.updateProjectionMatrix();
}
function applyDepth(panX = 0) {
  camera.fov = 42;
  camera.position.set(panX, 5.2, 12.5); // 셰프 눈높이에서 살짝 위·뒤
  camera.lookAt(panX * 0.35, -1.2, -6); // 카운터 너머 손님 쪽을 내려다봄
  camera.updateProjectionMatrix();
}

let mode = 'depth';
let pan = 0;
function render() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (mode === 'flat') { applyFlat(); label.textContent = 'A · 정면 고정 (DOM 2D처럼) — 납작한 사각형 스택'; }
  else { applyDepth(pan); label.textContent = `B · 2.5D 셰프 시점 — 바닥·가림·깊이 (pan ${pan.toFixed(1)})`; }
  renderer.render(scene, camera);
}

let raf;
function loop() { render(); raf = requestAnimationFrame(loop); }
loop();

window.__demo = {
  setMode: (m) => { mode = m; render(); },
  setPan: (x) => { pan = x; render(); },
};
