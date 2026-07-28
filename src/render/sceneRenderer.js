// SCN-001 단일 손님 회귀·통합 테스트 렌더러. Three.js 렌더러 하나와 rAF 루프 하나만 쓴다.
// 더미 도형(무광 색 평면)은 테스트 슬롯을 대신한다. 최신 SYS-002 프로덕션의 독립 화면 계약과는 분리한다.
//
// 테스트 장면 핵심: 레이어를 "진짜 깊이"에 두고 카메라를 셰프 시점으로 살짝 기울인다.
// 각 레이어 평면은 홈 카메라를 향한 빌보드로, 홈 포즈에서 지정 앵커에 정확히 놓인다.
// 카메라가 프리셋 사이를 움직이면 깊이가 다른 레이어가 다른 속도로 밀린다(시차)+ 카운터가 손님을 가린다.

import * as THREE from 'three';
import {
  LAYER_Z,
  ANCHORS,
  CAMERA_PRESETS,
  CAMERA_TRANSITION_MS,
  DUMMY_SLOTS,
} from '../config/sceneLayout.js';

const ASPECT = 16 / 9; // 기준 뷰포트(1280×720·1920×1080 모두 16:9)
const FOV = 42;
const TAN_HALF = Math.tan((FOV / 2) * (Math.PI / 180));

// 테스트용 셰프 시점 홈 포즈: 바 안쪽에서 살짝 위·뒤에서 카운터 너머를 내려다본다.
// 프리셋은 이 포즈를 기준으로 좌우 이동 + 작업대 push-in만 준다. 프로덕션은 이를 재사용하지 않는다.
const HOME_EYE = new THREE.Vector3(0, 3.7, 12.2);
const HOME_LOOK = new THREE.Vector3(0, -1.9, -5.5);

// 홈 카메라 하나로 배치를 계산하고, 같은 카메라를 라이브로 움직인다.
function makeHomeCamera() {
  const c = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 200);
  c.position.copy(HOME_EYE);
  c.lookAt(HOME_LOOK);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
  return c;
}

// 정규화 화면 앵커(nx,ny top-left) → 카메라에서 쏜 광선이 평면 z=const를 만나는 월드 좌표.
const _v = new THREE.Vector3();
function worldAtScreen(cam, nx, ny, z) {
  _v.set(nx * 2 - 1, -(ny * 2 - 1), 0.5).unproject(cam);
  _v.sub(cam.position);
  const t = (z - cam.position.z) / _v.z;
  return cam.position.clone().add(_v.multiplyScalar(t));
}

// 홈 카메라를 향한 빌보드 평면. rect(정규화 top-left)만큼의 화면을 덮도록 z 거리에 맞춰 크기 계산.
function billboard(cam, rect, z, material) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const center = worldAtScreen(cam, cx, cy, z);
  const dist = center.distanceTo(cam.position);
  const fullH = 2 * dist * TAN_HALF; // 이 거리에서 화면 전체 높이
  const geo = new THREE.PlaneGeometry(fullH * ASPECT * rect.width, fullH * rect.height);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(center);
  mesh.quaternion.copy(cam.quaternion); // 홈 카메라 정면을 향함
  return mesh;
}

function slotMeshFor(cam, slot) {
  const mat = new THREE.MeshBasicMaterial({ color: slot.color });
  switch (slot.key) {
    case 'bg':
      return billboard(cam, { x: 0, y: 0, width: 1, height: 1 }, LAYER_Z.background, mat);
    case 'seating':
      return billboard(cam, ANCHORS.customerSafeRect, LAYER_Z.background + 0.1, mat);
    case 'counter':
      return billboard(cam, ANCHORS.barCounterBounds, LAYER_Z.counter, mat);
    case 'st-assembly':
    case 'st-grill':
    case 'st-service':
      return billboard(cam, ANCHORS.playerWorkBounds, LAYER_Z.station, mat);
    case 'customer': {
      const seat = ANCHORS.seats['seat-03'];
      // 전신 평면을 카운터 뒤에 둔다. 상판 아래 하체는 counter 레이어가 실제 깊이로 가린다.
      return billboard(cam, { x: seat.x - 0.075, y: 0.14, width: 0.15, height: 0.47 }, LAYER_Z.customer, mat);
    }
    default:
      return billboard(cam, { x: 0, y: 0, width: 1, height: 1 }, LAYER_Z[slot.layer], mat);
  }
}

export function createSceneRenderer(canvas) {
  // 렌더 결과는 다음 프레임에만 필요하며 Playwright 캡처도 화면 합성본을 읽는다.
  // 보존 버퍼·MSAA를 끄면 소프트웨어 WebGL 환경에서도 FHD 조리 타이머를 30fps 이상 유지한다.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: false });
  renderer.setClearColor(0x0f0b08, 1);

  const scene = new THREE.Scene();
  const camera = makeHomeCamera(); // 홈 포즈에서 시작 → 배치 계산에 사용

  const slotMeshes = {};
  const stationByProcess = {};

  for (const slot of DUMMY_SLOTS) {
    if (slot.key === 'foreground') continue; // 아래에서 양끝 프레임으로
    const mesh = slotMeshFor(camera, slot);
    mesh.userData.dummy = slot.assetId;
    mesh.renderOrder = -LAYER_Z[slot.layer]; // 먼 것 먼저
    scene.add(mesh);
    slotMeshes[slot.key] = mesh;
    if (slot.process) stationByProcess[slot.process] = mesh;
  }

  // 바닥: 깊이를 파는 더미 지면 (실제 배경 아트가 오면 제거). 카운터 앞쪽으로 멀어지는 그리드.
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x171009 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -2.6, -8);
  floor.renderOrder = -100;
  scene.add(floor);
  const grid = new THREE.GridHelper(120, 60, 0x47341f, 0x2a1e12);
  grid.position.set(0, -2.58, -8);
  grid.renderOrder = -99;
  scene.add(grid);

  // 전경: 양끝의 얇고 은은한 세로 비네트 프레임 (§6). 검은 기둥이 아니라 가장자리 어둠.
  const fgMat = new THREE.MeshBasicMaterial({ color: 0x150f0a });
  for (const side of [-1, 1]) {
    const bar = billboard(camera, { x: side < 0 ? 0 : 0.96, y: 0, width: 0.04, height: 1 }, LAYER_Z.foreground, fgMat);
    bar.renderOrder = 200;
    scene.add(bar);
  }

  const CUSTOMER_MOOD_COLOR = {
    waiting: 0x8a7563,
    tasting: 0x9c826a,
    satisfied: 0x8fd47a,
    neutral: 0xc2b3a3,
    retry: 0xef6a58,
  };
  let customerState = 'waiting';
  function setCustomerState(stateName) {
    customerState = stateName in CUSTOMER_MOOD_COLOR ? stateName : 'waiting';
    const m = slotMeshes.customer;
    if (m) m.material.color.setHex(CUSTOMER_MOOD_COLOR[customerState]);
  }

  function setActiveStation(process) {
    for (const [proc, mesh] of Object.entries(stationByProcess)) mesh.visible = proc === process;
  }

  // ── 테스트 카메라 프리셋 (홈 포즈 기준 좌우 이동 + push-in) ────
  const cam = { x: HOME_EYE.x, y: HOME_EYE.y, z: HOME_EYE.z, targetX: HOME_LOOK.x };
  function applyCamera() {
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(cam.targetX, HOME_LOOK.y, HOME_LOOK.z);
  }

  let camTween = null;
  const frameDurations = [];
  let lastFrameAt = null;
  let frameCount = 0;
  function goToPreset(process, nowMs) {
    const p = CAMERA_PRESETS[process] || CAMERA_PRESETS.assembly;
    const to = { x: HOME_EYE.x + p.x, y: HOME_EYE.y, z: HOME_EYE.z - (6.0 - p.z), targetX: HOME_LOOK.x + p.targetX };
    camTween = { from: { ...cam }, to, startMs: nowMs };
  }
  function tickCamera(nowMs) {
    if (!camTween) return;
    const t = Math.min(1, (nowMs - camTween.startMs) / CAMERA_TRANSITION_MS);
    const e = 1 - Math.pow(1 - t, 3);
    cam.x = lerp(camTween.from.x, camTween.to.x, e);
    cam.z = lerp(camTween.from.z, camTween.to.z, e);
    cam.targetX = lerp(camTween.from.targetX, camTween.to.targetX, e);
    applyCamera();
    if (t >= 1) camTween = null;
  }

  let lastCanvasWidth = 0;
  let lastCanvasHeight = 0;
  let lastDpr = 0;
  function resize() {
    // 이 테스트/가이드 장면은 픽셀 아트와 평면으로 구성된다. 고밀도 버퍼보다 안정적인
    // 입력·타이머 프레임을 우선해 렌더 버퍼는 CSS 1배율로 고정한다.
    const dpr = 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // setPixelRatio/setSize는 내부 렌더 타깃을 다시 만들 수 있다. CSS 크기나 DPR이
    // 달라진 프레임에서만 갱신해 조리 루프의 불필요한 GPU 작업을 없앤다.
    if (width === lastCanvasWidth && height === lastCanvasHeight && dpr === lastDpr) return;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = ASPECT; // 16:9 고정 (레터박스는 CSS가 처리)
    camera.updateProjectionMatrix();
    lastCanvasWidth = width;
    lastCanvasHeight = height;
    lastDpr = dpr;
  }

  function renderFrame(nowMs) {
    tickCamera(nowMs);
    resize();
    renderer.render(scene, camera);
    if (lastFrameAt != null) {
      const duration = nowMs - lastFrameAt;
      if (duration > 0 && duration < 250) {
        frameDurations.push(duration);
        if (frameDurations.length > 120) frameDurations.shift();
      }
    }
    lastFrameAt = nowMs;
    frameCount += 1;
  }

  function performanceStats() {
    const averageFrameMs = frameDurations.length
      ? frameDurations.reduce((sum, value) => sum + value, 0) / frameDurations.length
      : 0;
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines,
      dpr: renderer.getPixelRatio(),
      averageFrameMs,
      fps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
      sampledFrames: frameDurations.length,
      frameCount,
      canvasCount: document.querySelectorAll('canvas').length,
      renderLoopCount: 1,
    };
  }

  // main.js 핫스팟 배치용: 홈 포즈 기준 앵커→월드 + 채움 크기. (이름은 하위호환 유지)
  const homeRef = makeHomeCamera();
  function nToWorldAtZ(nx, ny, z) {
    const p = worldAtScreen(homeRef, nx, ny, z);
    const dist = p.distanceTo(homeRef.position);
    const fullH = 2 * dist * TAN_HALF;
    return { x: p.x, y: p.y, z: p.z, fw: fullH * ASPECT, fh: fullH };
  }

  return {
    scene,
    camera,
    slotMeshes,
    renderFrame,
    resize,
    goToPreset,
    setCustomerState,
    getCustomerState: () => customerState,
    setActiveStation,
    performanceStats,
    nToWorldAtZ,
    homeQuaternion: homeRef.quaternion.clone(),
    dispose: () => renderer.dispose(),
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
