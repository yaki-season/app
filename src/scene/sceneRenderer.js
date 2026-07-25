// SYS-002 2.5D 장면 렌더러. Three.js 렌더러 하나와 rAF 루프 하나만 쓴다 (§3).
// 더미 도형(무광 색 평면)이 각 에셋 슬롯을 대신하며, 실제 앵커·레이어 깊이·카메라 계약을 지킨다.
// 2.5D는 스프라이트 합성이므로 조명 없이 MeshBasicMaterial로 색을 그대로 낸다.

import * as THREE from 'three';
import {
  LAYER_Z,
  ANCHORS,
  CAMERA_PRESETS,
  CAMERA_TRANSITION_MS,
  DUMMY_SLOTS,
} from './sceneLayout.js';

const ASPECT = 16 / 9; // 기준 뷰포트(1280×720·1920×1080 모두 16:9)
const FOV = 42;
const CAM_Z = 11.7; // z=0 평면이 세로로 프레임을 채우는 거리
const HALF_TAN = Math.tan((FOV / 2) * (Math.PI / 180));

// 레이어 z에서 프레임을 채우는 월드 높이/너비 (원근 스케일 보정)
function fillHeightAt(z) {
  return 2 * (CAM_Z - z) * HALF_TAN;
}
// 정규화 top-left (nx,ny) → 레이어 z에서의 월드 (x,y). 어느 깊이든 같은 화면 위치에 맞춘다.
function nToWorldAtZ(nx, ny, z) {
  const fh = fillHeightAt(z);
  const fw = fh * ASPECT;
  return { x: (nx - 0.5) * fw, y: (0.5 - ny) * fh, fw, fh };
}

function fullFramePlane(z, material) {
  const fh = fillHeightAt(z);
  const geo = new THREE.PlaneGeometry(fh * ASPECT, fh);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, 0, z);
  return mesh;
}

function rectPlane(rect, z, material) {
  const c = nToWorldAtZ(rect.x + rect.width / 2, rect.y + rect.height / 2, z);
  const geo = new THREE.PlaneGeometry(rect.width * c.fw, rect.height * c.fh);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(c.x, c.y, z);
  return mesh;
}

function slotMeshFor(slot) {
  const mat = new THREE.MeshBasicMaterial({ color: slot.color });
  switch (slot.key) {
    case 'counter':
      return rectPlane(ANCHORS.barCounterBounds, LAYER_Z.counter, mat);
    case 'st-assembly':
    case 'st-grill':
    case 'st-service':
      return rectPlane(ANCHORS.playerWorkBounds, LAYER_Z.station, mat);
    case 'customer': {
      const seat = ANCHORS.seats['seat-03'];
      return rectPlane({ x: seat.x - 0.08, y: 0.22, width: 0.16, height: 0.38 }, LAYER_Z.customer, mat);
    }
    case 'seating':
      return rectPlane(ANCHORS.customerSafeRect, LAYER_Z.background + 0.1, mat);
    default:
      return fullFramePlane(LAYER_Z[slot.layer], mat); // 배경 전체
  }
}

export function createSceneRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x0f0b08, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 100);
  const cam = { x: 0, targetX: 0 };
  applyCamera(camera, cam);

  const slotMeshes = {};
  const stationByProcess = {};

  for (const slot of DUMMY_SLOTS) {
    if (slot.key === 'foreground') continue; // 아래에서 양끝 프레임으로
    const mesh = slotMeshFor(slot);
    mesh.userData.dummy = slot.assetId;
    mesh.renderOrder = -LAYER_Z[slot.layer];
    scene.add(mesh);
    slotMeshes[slot.key] = mesh;
    if (slot.process) stationByProcess[slot.process] = mesh;
  }

  // 전경: 중앙을 비운 양끝 세로 프레임 (SYS-002 §6)
  const fgMat = new THREE.MeshBasicMaterial({ color: 0x0d0906 });
  const fgFh = fillHeightAt(LAYER_Z.foreground);
  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(fgFh * ASPECT * 0.12, fgFh), fgMat);
    bar.position.set(side * fgFh * ASPECT * 0.44, 0, LAYER_Z.foreground);
    scene.add(bar);
  }

  const CUSTOMER_MOOD_COLOR = {
    waiting: 0x8a7563,
    tasting: 0x9c826a,
    satisfied: 0x8fd47a,
    neutral: 0xc2b3a3,
    retry: 0xef6a58,
  };

  function setCustomerState(stateName) {
    const m = slotMeshes.customer;
    if (m) m.material.color.setHex(CUSTOMER_MOOD_COLOR[stateName] ?? CUSTOMER_MOOD_COLOR.waiting);
  }

  function setActiveStation(process) {
    for (const [proc, mesh] of Object.entries(stationByProcess)) mesh.visible = proc === process;
  }

  let camTween = null;
  function goToPreset(process, nowMs) {
    const to = CAMERA_PRESETS[process] || CAMERA_PRESETS.assembly;
    camTween = { from: { ...cam }, to: { x: to.x, targetX: to.targetX }, startMs: nowMs };
  }
  function tickCamera(nowMs) {
    if (!camTween) return;
    const t = Math.min(1, (nowMs - camTween.startMs) / CAMERA_TRANSITION_MS);
    const e = 1 - Math.pow(1 - t, 3);
    cam.x = lerp(camTween.from.x, camTween.to.x, e);
    cam.targetX = lerp(camTween.from.targetX, camTween.to.targetX, e);
    applyCamera(camera, cam);
    if (t >= 1) camTween = null;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function renderFrame(nowMs) {
    tickCamera(nowMs);
    resize();
    renderer.render(scene, camera);
  }

  return {
    scene,
    camera,
    slotMeshes,
    renderFrame,
    resize,
    goToPreset,
    setCustomerState,
    setActiveStation,
    nToWorldAtZ,
    dispose: () => renderer.dispose(),
  };
}

// 셰프측 카메라: 살짝 아래에서 정면을 보되 앵커가 어긋나지 않게 target도 같은 x로 이동 (§4~6)
function applyCamera(camera, cam) {
  camera.position.set(cam.x, 0, CAM_Z);
  camera.lookAt(cam.targetX, 0, 0);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
