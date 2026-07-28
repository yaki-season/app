// SCN-001 단일 손님 회귀·통합 테스트 화면 진입점.
// 게임 상태(gameState 리듀서)를 Three.js 장면에 연결한다. 최신 SYS-002 프로덕션 화면은
// 독립 손님 정보/조리 프리셋과 다중 주문 어댑터를 별도로 사용해야 한다.
// 조리 로직은 렌더러를 import하지 않는다 — 여기서만 상태→장면을 배선한다.

import * as THREE from 'three';
import { createSceneRenderer } from './render/sceneRenderer.js';
import { createGrillMaterial } from './render/grillMaterial.js';
import { elapsedSecToUniform } from './render/grillRenderer.js';
import { mountGrillTuner } from './render/grillTuner.js';
import { LAYER_Z, ANCHORS } from './config/sceneLayout.js';
import { RECIPE } from './config/recipe.js';
import {
  STATUS,
  PROCESS,
  createInitialState,
  assetsLoaded,
  clickIngredient,
  isAssemblyComplete,
  clickAssembledSkewer,
  placeOnGrill,
  currentDoneness,
  faceElapsedMs,
  clickGrillSkewer,
  tick,
  visibilityHidden,
  visibilityVisible,
  clickPlate,
  clickOrderMat,
  clickTab,
  restart,
} from './state/gameState.js';

const el = (id) => document.getElementById(id);
const canvas = el('scene');
const R = createSceneRenderer(canvas);

let state = assetsLoaded(createInitialState()); // 더미라 에셋 로딩 없이 바로 시작
let customerTimer = null; // tasting → satisfied 지연용 타이머
let serviceInFlight = false;
let serviceTimer = null;
let lastHandledKey = null;
let grill = null; // 익힘 셰이더 재질 (비동기 로드 후 grill-skewer에 물린다)

// ── 인터랙티브 오브젝트 (레이캐스트 대상) ─────────────────────
// 더미 박스. 실제 아트는 PR-*·재료 스프라이트로 교체된다.
// 클릭 영역은 최소 44px을 위해 시각 크기보다 넉넉히 잡는다 (SYS-002 §11).
const hotspots = {}; // key → mesh

function addHotspot(key, nx, ny, w, h, color) {
  const c = R.nToWorldAtZ(nx, ny, LAYER_Z.interactive);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w * c.fw, h * c.fh),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.set(c.x, c.y, c.z);
  mesh.quaternion.copy(R.homeQuaternion); // 셰프 시점을 향한 빌보드 (키스톤 방지)
  mesh.renderOrder = 100; // 스테이션·손님보다 위
  mesh.userData.hotspot = key;
  R.scene.add(mesh);
  hotspots[key] = mesh;
  return mesh;
}

addHotspot('ingredient-chicken', 0.30, 0.80, 0.08, 0.10, 0xd98a5f);
addHotspot('ingredient-leek', 0.44, 0.80, 0.08, 0.10, 0x8fc06a);
addHotspot('assembled-skewer', 0.50, 0.64, 0.16, 0.05, 0xc9a86a);
addHotspot('waiting-skewer', 0.34, 0.64, 0.12, 0.05, 0xc9a86a);
addHotspot('grill-skewer', 0.50, 0.60, 0.06, 0.16, 0xd98a5f);
addHotspot('plate', 0.64, 0.60, 0.10, 0.10, 0xe8e0d0);
addHotspot('order-mat', 0.50, 0.50, 0.14, 0.08, 0x584636);

const hotspotHome = Object.fromEntries(
  Object.entries(hotspots).map(([key, mesh]) => [key, mesh.position.clone()]),
);
const motions = new Map();
const motionTravel = new Map();

function worldPoint(nx, ny, z = LAYER_Z.interactive) {
  const point = R.nToWorldAtZ(nx, ny, z);
  return new THREE.Vector3(point.x, point.y, point.z);
}

function moveHotspot(key, points, durationMs, now, onComplete) {
  const mesh = hotspots[key];
  if (!mesh) return;
  const motion = {
    mesh,
    points: [mesh.position.clone(), ...points],
    durationMs,
    startAt: now,
    onComplete,
    fallbackTimer: null,
  };
  motion.fallbackTimer = window.setTimeout(() => {
    if (motions.get(key) !== motion) return;
    mesh.position.copy(motion.points.at(-1));
    mesh.scale.setScalar(1);
    motionTravel.set(
      key,
      Math.max(motionTravel.get(key) || 0, mesh.position.distanceTo(motion.points[0])),
    );
    motions.delete(key);
    onComplete?.();
  }, durationMs + 120);
  motions.set(key, motion);
  motionTravel.set(key, 0);
}

function tickMotions(now) {
  for (const [key, motion] of motions) {
    const t = Math.max(0, Math.min(1, (now - motion.startAt) / motion.durationMs));
    const scaled = t * (motion.points.length - 1);
    const index = Math.min(Math.floor(scaled), motion.points.length - 2);
    const localT = scaled - index;
    const eased = 1 - Math.pow(1 - localT, 3);
    motion.mesh.position.lerpVectors(motion.points[index], motion.points[index + 1], eased);
    motionTravel.set(
      key,
      Math.max(motionTravel.get(key) || 0, motion.mesh.position.distanceTo(motion.points[0])),
    );
    const lift = Math.sin(Math.PI * t);
    motion.mesh.scale.setScalar(1 + lift * 0.12);
    if (t >= 1) {
      motion.mesh.scale.setScalar(1);
      window.clearTimeout(motion.fallbackTimer);
      motions.delete(key);
      motion.onComplete?.();
    }
  }
}

function completeCustomerReaction() {
  if (state.status !== STATUS.SERVED) return R.getCustomerState();
  R.setCustomerState(state.servedQuality === 'good' ? 'satisfied' : 'neutral');
  if (customerTimer != null) window.clearTimeout(customerTimer);
  customerTimer = null;
  return R.getCustomerState();
}

function completeService() {
  if (!serviceInFlight) return state;
  state = clickOrderMat(state);
  serviceInFlight = false;
  if (serviceTimer != null) window.clearTimeout(serviceTimer);
  serviceTimer = null;
  if (state.status === STATUS.SERVED) {
    R.setCustomerState('tasting');
    customerTimer = window.setTimeout(completeCustomerReaction, 900);
  }
  render();
  return state;
}

// ── 상태 → 장면·HUD ─────────────────────────────────────────
function visible(key, show) {
  if (hotspots[key]) hotspots[key].visible = show;
}

function render() {
  const onGrill = state.status === STATUS.GRILL_FRONT || state.status === STATUS.GRILL_BACK;
  const complete = isAssemblyComplete(state);

  R.setActiveStation(state.process);

  // 인터랙티브 가시성
  visible('ingredient-chicken', state.process === PROCESS.ASSEMBLY);
  visible('ingredient-leek', state.process === PROCESS.ASSEMBLY);
  visible('assembled-skewer', state.process === PROCESS.ASSEMBLY && complete);
  visible('waiting-skewer', state.process === PROCESS.GRILL && state.status === STATUS.ASSEMBLY && complete);
  visible('grill-skewer', onGrill);
  visible('plate', state.process === PROCESS.COUNTER && state.status === STATUS.PLATED);
  visible('order-mat', state.process === PROCESS.COUNTER);

  // 그릴 꼬치 익힘 표현은 매 프레임 updateGrillVisual()이 셰이더 uDoneness로 구동한다.
  // (재질 로드 전 폴백: 더미 박스 색)
  if (onGrill && !grill) {
    const d = currentDoneness(state, performance.now());
    const color = { under: 0xd98a5f, perfect: 0xc97a2a, over: 0x8a5220, burnt: 0x2a1a10 }[d];
    if (hotspots['grill-skewer'].material.color) {
      hotspots['grill-skewer'].material.color.setHex(color);
    }
  }

  // HUD
  renderOrderList();
  el('orderText').textContent = orderText();

  // 탭
  for (const btn of document.querySelectorAll('.tab')) {
    const p = btn.dataset.process;
    btn.classList.toggle('active', state.process === p);
    btn.disabled =
      state.status === STATUS.LOADING ||
      !(p === PROCESS.ASSEMBLY || state.completedProcesses.includes(p) ||
        (p === PROCESS.GRILL && state.process === PROCESS.GRILL) ||
        (p === PROCESS.COUNTER && state.status === STATUS.PLATED));
  }

  // 결과 오버레이 + 손님 반응
  const resultVisible = state.status === STATUS.SERVED || state.status === STATUS.FAILED;
  el('resultOverlay').hidden = !resultVisible;
  if (state.status === STATUS.FAILED) {
    el('resultMessage').textContent = '꼬치가 타버렸습니다. 다시 만들어 볼까요?';
    R.setCustomerState('retry');
  } else if (state.status === STATUS.SERVED) {
    el('resultMessage').textContent =
      state.servedQuality === 'good' ? '츠키오카가 만족했습니다!' : '조금 과하게 익었다고 아쉬워합니다.';
  }
}

function renderOrderList() {
  const ol = el('orderList');
  ol.innerHTML = '';
  RECIPE.forEach((ing, i) => {
    const li = document.createElement('li');
    li.textContent = ing === 'chicken' ? '닭' : '파';
    li.dataset.testid = `order-slot-${i}`;
    if (i < state.assemblyIndex) li.classList.add('done');
    else if (i === state.assemblyIndex && state.status === STATUS.ASSEMBLY) li.classList.add('next');
    ol.appendChild(li);
  });
}

function orderText() {
  return {
    [STATUS.ASSEMBLY]: isAssemblyComplete(state) ? '완성된 꼬치를 클릭해 그릴로' : '재료를 순서대로 클릭',
    [STATUS.GRILL_FRONT]: '앞면을 굽는 중',
    [STATUS.GRILL_BACK]: '뒷면을 굽는 중',
    [STATUS.PLATED]: '접시를 손님에게',
    [STATUS.SERVED]: '서빙 완료',
    [STATUS.FAILED]: '조리 실패',
  }[state.status] || '';
}

function showHint(text) {
  const h = el('hint');
  h.textContent = text;
  h.classList.add('show');
  setTimeout(() => h.classList.remove('show'), 900);
}

// ── 입력: 레이캐스트 ─────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const ptr = new THREE.Vector2();
const lockUntil = {}; // key → ms (대상별 잠금, UI-001 §17)

function hitTest(e) {
  const rect = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ptr, R.camera);
  const targets = Object.values(hotspots).filter(
    (m) => {
      if (!m.visible) return false;
      if (state.plateSelected && m.userData.hotspot === 'plate') return false;
      if (isAssemblyComplete(state) && m.userData.hotspot.startsWith('ingredient-')) return false;
      if (motions.has(m.userData.hotspot)) return false;
      return true;
    },
  );
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit ? hit.object.userData.hotspot : null;
}

canvas.addEventListener('pointerdown', (e) => {
  const key = hitTest(e);
  if (!key) return;
  const now = performance.now();
  if ((lockUntil[key] || 0) > now) return;
  lockUntil[key] = now + 200;
  handle(key, now);
});

function handle(key, now) {
  lastHandledKey = key;
  const prev = state;
  switch (key) {
    case 'ingredient-chicken':
    case 'ingredient-leek': {
      const ing = key === 'ingredient-chicken' ? 'chicken' : 'leek';
      const before = state.assemblyIndex;
      state = clickIngredient(state, ing, now);
      if (state.assemblyIndex === before) {
        showHint('순서가 달라요');
      } else {
        const source = hotspotHome[key];
        const target = hotspotHome['assembled-skewer'];
        moveHotspot(
          key,
          [
            source.clone().add(new THREE.Vector3(0, 0.45, 0.08)),
            target.clone().add(new THREE.Vector3((state.assemblyIndex - 3) * 0.08, 0.08, 0)),
          ],
          320,
          now,
          () => hotspots[key].position.copy(source),
        );
      }
      break;
    }
    case 'assembled-skewer':
      state = clickAssembledSkewer(state);
      break;
    case 'waiting-skewer':
      state = placeOnGrill(state, now);
      break;
    case 'grill-skewer': {
      const before = state.status;
      const d = currentDoneness(state, now);
      state = clickGrillSkewer(state, now);
      if (state.status === before && d === 'under') showHint('아직 덜 익었어요');
      break;
    }
    case 'plate':
      state = clickPlate(state);
      if (state.plateSelected) {
        moveHotspot(
          'plate',
          [worldPoint(0.58, 0.53, LAYER_Z.vfx), worldPoint(0.52, 0.50, LAYER_Z.vfx)],
          280,
          now,
        );
      }
      break;
    case 'order-mat':
      if (state.plateSelected && !serviceInFlight) {
        serviceInFlight = true;
        const path = ANCHORS.handoffPath.slice(1).map(({ x, y }) => worldPoint(x, y, LAYER_Z.vfx));
        moveHotspot('plate', path, 650, now);
        serviceTimer = window.setTimeout(completeService, 650);
      }
      break;
  }
  if (state.status !== prev.status && state.status === STATUS.PLATED) {
    setTimeout(() => {
      state = clickTab(state, PROCESS.COUNTER);
      render();
    }, 450);
  }
  render();
}

for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => {
    state = clickTab(state, btn.dataset.process);
    render();
  });
}

// PC에서는 탭 버튼과 동일한 잠금 규칙으로 인접 스테이션을 이동한다.
const STATION_ORDER = [PROCESS.ASSEMBLY, PROCESS.GRILL, PROCESS.COUNTER];
window.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  event.preventDefault();

  const index = STATION_ORDER.indexOf(state.process);
  const nextIndex = index + (event.key === 'ArrowLeft' ? -1 : 1);
  const nextProcess = STATION_ORDER[nextIndex];
  if (!nextProcess) return;

  const nextState = clickTab(state, nextProcess);
  if (nextState === state) return;
  state = nextState;
  render();
});

el('restartButton').addEventListener('click', () => {
  state = restart(state);
  R.setCustomerState('waiting');
  if (customerTimer != null) window.clearTimeout(customerTimer);
  customerTimer = null;
  serviceInFlight = false;
  if (serviceTimer != null) window.clearTimeout(serviceTimer);
  serviceTimer = null;
  motions.clear();
  for (const [key, position] of Object.entries(hotspotHome)) {
    hotspots[key].position.copy(position);
    hotspots[key].scale.setScalar(1);
  }
  if (grill) grill.setDoneness(0); // 날것으로 초기화
  render();
});

document.addEventListener('visibilitychange', () => {
  const now = performance.now();
  state = document.hidden ? visibilityHidden(state, now) : visibilityVisible(state, now);
});

// 공정이 바뀌면 카메라 프리셋 이동
let lastProcess = null;

// 익힘 셰이더 구동: 굽는 중이면 경과 시간→uDoneness, 항상 숯불 깜빡임용 시간 갱신.
// donenessOverride가 있으면(튜너 미리보기) 그 값을 그대로 쓴다.
let donenessOverride = null;
function updateGrillVisual(now) {
  if (!grill) return;
  grill.setTime(now / 1000);
  if (donenessOverride != null) {
    grill.setDoneness(donenessOverride);
  } else if (state.status === STATUS.GRILL_FRONT || state.status === STATUS.GRILL_BACK) {
    grill.setDoneness(elapsedSecToUniform(faceElapsedMs(state, now) / 1000));
  }
}

function loop(now) {
  const prevStatus = state.status;
  state = tick(state, now);

  if (state.process !== lastProcess) {
    R.goToPreset(state.process, now);
    lastProcess = state.process;
  }
  if (state.status !== prevStatus) render();

  updateGrillVisual(now);
  tickMotions(now);
  R.renderFrame(now);
  requestAnimationFrame(loop);
}

// 익힘 셰이더 재질을 비동기 로드해 grill-skewer 더미 박스와 교체한다.
createGrillMaterial()
  .then((g) => {
    grill = g;
    const mesh = hotspots['grill-skewer'];
    mesh.material.dispose();
    mesh.material = g.material;
    // 셰이더 프로그램을 지금(조립 중) 미리 컴파일한다. 그러지 않으면 그릴 진입 첫 프레임에
    // 컴파일 스톨이 걸려 실시간 클릭/판정이 밀리고, 소프트웨어 렌더(SwiftShader)에선 플레이크가 된다.
    const wasVisible = mesh.visible;
    mesh.visible = true;
    R.renderFrame(performance.now());
    mesh.visible = wasVisible;
    if (typeof window !== 'undefined') window.__grill = g; // 튜너·디버그용
  })
  .catch((err) => console.error('익힘 재질 로드 실패:', err));

R.goToPreset('assembly', 0);
render();
requestAnimationFrame(loop);

// 개발 관찰 지점 + 레이캐스트 검증용 좌표
const projectToScreen = (world) => {
  const v = world.clone().project(R.camera);
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
};

window.__sceneDebug = {
  getState: () => state,
  doneness: () => currentDoneness(state, performance.now()),
  customerState: () => R.getCustomerState(),
  lastHandledKey: () => lastHandledKey,
  serviceInFlight: () => serviceInFlight,
  motionActive: (key) => motions.has(key),
  motionTravel: (key) => motionTravel.get(key) || 0,
  performanceStats: () => R.performanceStats(),
  tickNow: () => {
    state = tick(state, performance.now());
    render();
    return state;
  },
  completeServiceNow: () => completeService(),
  completeCustomerReactionNow: () => completeCustomerReaction(),
  selectPlateNow: () => {
    state = clickPlate(state);
    render();
    return state;
  },
  startServiceNow: () => {
    handle('order-mat', performance.now());
    return serviceInFlight;
  },
  // 핫스팟 중심의 화면 픽셀 좌표 (테스트에서 canvas 클릭 위치로)
  screenPosOf: (key) => {
    const m = hotspots[key];
    if (!m || !m.visible) return null;
    return projectToScreen(m.position);
  },
  // 핫스팟이 화면에서 차지하는 픽셀 크기 (최소 클릭 영역 44px 검증용, UI-001 §11)
  screenRectOf: (key) => {
    const m = hotspots[key];
    if (!m || !m.visible) return null;
    m.updateMatrixWorld(true);
    const { width, height } = m.geometry.parameters;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [sx, sy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      const p = new THREE.Vector3(sx * width, sy * height, 0).applyMatrix4(m.matrixWorld);
      const s = projectToScreen(p);
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    return { width: maxX - minX, height: maxY - minY };
  },
  occlusionReport: () => {
    const customer = R.slotMeshes.customer;
    const counter = R.slotMeshes.counter;
    const screenBounds = (mesh) => {
      mesh.updateMatrixWorld(true);
      const { width, height } = mesh.geometry.parameters;
      const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]
        .map(([x, y]) => projectToScreen(
          new THREE.Vector3(x * width, y * height, 0).applyMatrix4(mesh.matrixWorld),
        ));
      return {
        left: Math.min(...corners.map((p) => p.x)),
        right: Math.max(...corners.map((p) => p.x)),
        top: Math.min(...corners.map((p) => p.y)),
        bottom: Math.max(...corners.map((p) => p.y)),
      };
    };
    const customerRect = screenBounds(customer);
    const counterRect = screenBounds(counter);
    return {
      customerRect,
      counterRect,
      overlapPx: Math.max(0, customerRect.bottom - Math.max(customerRect.top, counterRect.top)),
      customerBehindCounter: customer.position.z < counter.position.z,
      occlusionLineY: ANCHORS.customerOcclusionLine.fromY * canvas.getBoundingClientRect().height,
    };
  },
  renderer: R,
  // 튜너용: 익힘 재질과 미리보기 오버라이드 접근
  grillMaterial: () => grill,
  setDonenessOverride: (v) => { donenessOverride = v; },
  showGrillSkewer: (show) => { if (hotspots['grill-skewer']) hotspots['grill-skewer'].visible = show; },
};
// 기존 종단 헬퍼와의 이름 연속성 (DOM 뷰에서 승격됨)
window.__yakiDebug = window.__sceneDebug;

// 익힘 셰이더 실시간 튜너 (키 G) — TA 워크플로용 개발 도구
mountGrillTuner(window.__sceneDebug);
