// 프로덕션 영업 화면 진입점.
// gameState(조립·그릴 판정)를 프로덕션 렌더러의 독립 화면 구조에 배선한다. 사용자는 손님·조립·그릴·
// 드링크 화면을 자유 전환(좌·우/퀵)하고, 조리 job은 화면과 독립 진행한다. 조리 로직은 렌더러를
// import하지 않는다 — 여기서만 상태→장면을 잇는다.

import * as THREE from 'three';
import { createProductionRenderer } from './render/productionRenderer.js';
import { createStationDirector } from './render/stationDirector.js';
import { createGrillMaterial } from './render/grillMaterial.js';
import { elapsedSecToUniform } from './render/grillRenderer.js';
import { createCustomerAdapter, buildSeatStates } from './render/customerAdapter.js';
import { createPreparedDock, qualityFromCook } from './render/preparedDock.js';
import { createDrinkPour, DRINK } from './render/drinkStation.js';
import { SCREENS, SCREEN_IDS, SCREEN_BY_ID, INITIAL_SCREEN, SCREEN_TRANSITION_MS, OBJECTS } from './config/screenLayout.js';
import { RECIPE } from './config/recipe.js';
import {
  STATUS, PROCESS,
  createInitialState, assetsLoaded,
  clickIngredient, isAssemblyComplete, clickAssembledSkewer, placeOnGrill,
  currentDoneness, faceElapsedMs, clickGrillSkewer,
  tick, restart,
} from './state/gameState.js';

const el = (id) => document.getElementById(id);
const canvas = el('scene');
const R = createProductionRenderer(canvas);
const director = createStationDirector({ screens: SCREEN_IDS, initial: INITIAL_SCREEN, transitionMs: SCREEN_TRANSITION_MS });

let state = assetsLoaded(createInitialState());
let grill = null;
let reaction = 'waiting';
let reactionTimer = null;
const lockUntil = {}; // 대상별 입력 잠금

// 각 조작 대상 key가 속한 화면 (가시성·클릭 판정용)
const SCREEN_OF = {};
for (const s of SCREENS) for (const k of s.objects) if (OBJECTS[k].kind !== 'fullframe') SCREEN_OF[k] = s.id;

// 손님 렌더 어댑터 (6석). 증분 2 데모: 츠키오카 1명이 seat-03에 앉는다. 006이 실제 운영을 꽂는다.
const DEMO_SEAT = 'seat-03';
const customers = createCustomerAdapter({ renderer: R, container: el('bubbleLayer') });

// 공용 준비 목록 (완성품 선반). 조리와 서빙을 분리한다.
const dock = createPreparedDock({ container: el('dockShelf') });

// 생맥주 따르기 (드링크 화면). 레버 아래=맥주, 위=거품 (GPL-004).
const pour = createDrinkPour();
const LEVER_ZONE = { drinkLeverLower: 'beer', drinkLeverUpper: 'foam' };

// 더미 오브젝트 이름표 (아트 전 식별용). 활성 화면의 보이는 오브젝트 위에 DOM 텍스트를 얹는다.
const OBJECT_LABELS = {
  seating: '좌석 배경', counter: '카운터',
  workbench: '조립대', binChicken: '닭', binLeek: '파', jigSkewer: '완성 꼬치',
  grillBody: '숯불 그릴', grillSkewer: '꼬치',
  drinkTower: '맥주 타워', glassRack: '잔 랙', drinkLeverUpper: '레버·거품', drinkLeverLower: '레버·맥주',
};
// 큰 고정물은 라벨을 위쪽으로 올려 위에 놓인 조작 대상 라벨과 겹치지 않게 한다(화면 px 오프셋).
const LABEL_UP = { seating: 40, counter: 44, workbench: 74, grillBody: 74, drinkTower: 46, glassRack: 24 };
const labelEls = {};
for (const [key, text] of Object.entries(OBJECT_LABELS)) {
  const span = document.createElement('span');
  span.className = 'obj-label';
  span.textContent = text;
  span.dataset.testid = `label-${key}`;
  span.hidden = true;
  el('labelLayer').appendChild(span);
  labelEls[key] = span;
}
function updateLabels() {
  for (const key of Object.keys(OBJECT_LABELS)) {
    const mesh = R.objectMesh[key];
    const span = labelEls[key];
    if (mesh && mesh.visible) {
      const p = R.projectToScreen(mesh.position);
      span.style.left = `${p.x}px`;
      span.style.top = `${p.y - (LABEL_UP[key] || 0)}px`;
      span.hidden = false;
    } else {
      span.hidden = true;
    }
  }
}

function occupants() {
  return [{ seatId: DEMO_SEAT, mood: reaction, orderLabel: '네기마', waitRatio: 1 }];
}
function syncCustomers() {
  // 선반에 고른 완성품이 있어야 좌석 serve 대상이 활성화된다.
  customers.apply(buildSeatStates(occupants(), { serveReady: !!dock.selected() }));
}

// ── 드링크 잔 채움 패널 ──────────────────────────────────────
const drinkPanel = el('drinkPanel');
const beerEl = drinkPanel.querySelector('.beer');
const foamEl = drinkPanel.querySelector('.foam');
const stampEl = drinkPanel.querySelector('.stamp');
const finishBtn = drinkPanel.querySelector('[data-act="finish"]');
const overflowEl = drinkPanel.querySelector('.drink-overflow');
const GLASS_PX = 150;
// 기준선: 목표 총 채움 4.0초를 cap(4.7) 대비 높이로 (한 번만).
drinkPanel.querySelector('.target-line').style.bottom = `${(4.0 / DRINK.totalCap) * GLASS_PX}px`;

function updateDrinkPanel(activeScreen) {
  const show = activeScreen === 'SCR-SVC-DRINK';
  drinkPanel.hidden = !show;
  if (!show) return;
  const s = pour.state();
  const beerH = Math.min(1, s.beerSec / DRINK.totalCap) * GLASS_PX;
  const foamH = Math.min(1, s.foamSec / DRINK.totalCap) * GLASS_PX;
  beerEl.style.height = `${beerH}px`;
  foamEl.style.height = `${foamH}px`;
  foamEl.style.bottom = `${beerH}px`;
  finishBtn.disabled = s.phase !== 'ready';
  overflowEl.hidden = s.phase !== 'overflow';
  if (s.phase === 'overflow') {
    stampEl.hidden = false;
    stampEl.textContent = '넘침';
    stampEl.className = 'stamp q-Fail';
  } else {
    stampEl.hidden = true;
  }
}

function finishDrink() {
  const q = pour.finish(); // Perfect | Good | OK
  if (q) {
    dock.add({ menu: '생맥주', label: q, good: q === 'Perfect' || q === 'Good' });
    showHint('생맥주를 선반에 올렸어요');
  }
  pour.reset();
  render();
}
function serveOverflowLow() {
  const q = pour.serveOverflow(); // Fail
  if (q) dock.add({ menu: '생맥주', label: q, good: false });
  pour.reset();
  render();
}
function discardDrink() {
  pour.discard();
  pour.reset();
  showHint('잔을 폐기했어요');
  render();
}
finishBtn.addEventListener('click', finishDrink);
drinkPanel.querySelector('[data-act="serve-low"]').addEventListener('click', serveOverflowLow);
drinkPanel.querySelector('[data-act="discard"]').addEventListener('click', discardDrink);

// 그릴 완성 → 완성품을 선반에 올리고 다음 조리로 리셋. 조리 job과 완성품 재고를 분리한다.
// restart()는 SERVED/FAILED에서만 초기화하므로, PLATED에서는 새 초기 상태로 직접 리셋한다.
function completeToDock() {
  const q = qualityFromCook(state.frontResult, state.backResult); // 'good' | 'low'
  dock.add({ menu: '네기마', label: q === 'good' ? '좋음' : '과다', good: q === 'good' });
  state = assetsLoaded(createInitialState());
  showHint('완성품을 선반에 올렸어요');
}

// ── 상태 → 장면·HUD ─────────────────────────────────────────
function isWaitingSkewer() {
  return state.process === PROCESS.GRILL && state.status === STATUS.ASSEMBLY && isAssemblyComplete(state);
}
function onGrill() {
  return state.status === STATUS.GRILL_FRONT || state.status === STATUS.GRILL_BACK;
}

// 조작 대상이 지금 보여야 하는가 (활성 화면 && gameState 조건)
function shouldShow(key) {
  const active = director.activeScreenId();
  if (SCREEN_OF[key] !== active) return false;
  switch (key) {
    case 'binChicken':
    case 'binLeek': return state.process === PROCESS.ASSEMBLY;
    case 'jigSkewer': return true; // 조립대 jig는 항상
    case 'grillSkewer': return isWaitingSkewer() || onGrill();
    default: return true; // 손님·드링크 구조 오브젝트
  }
}

function render() {
  // 조작 대상 가시성 (활성 화면 + gameState). bg·고정물은 렌더러 화면 토글이 담당.
  for (const key of Object.keys(SCREEN_OF)) {
    const mesh = R.objectMesh[key];
    if (mesh) mesh.visible = shouldShow(key);
  }

  // 그릴 꼬치 익힘 색 (셰이더 로드 전 폴백)
  if (!grill && R.objectMesh.grillSkewer && onGrill()) {
    const d = currentDoneness(state, performance.now());
    const c = { under: 0xd98a5f, perfect: 0xc97a2a, over: 0x8a5220, burnt: 0x2a1a10 }[d];
    if (R.objectMesh.grillSkewer.material.color) R.objectMesh.grillSkewer.material.color.setHex(c);
  }

  // 손님 6석 렌더 어댑터 (점유·기분·주문·serve 대상)
  syncCustomers();

  // 영업 shell HUD
  el('svcStation').textContent = SCREEN_BY_ID[director.activeScreenId()].name;
  renderReceipts();
  for (const btn of document.querySelectorAll('.quick-nav button')) {
    btn.classList.toggle('active', btn.dataset.screen === director.activeScreenId());
  }
  el('navLeft').disabled = !director.canLeft();
  el('navRight').disabled = !director.canRight();

  // 결과 오버레이는 조리 실패(탄 상태)에만. 서빙은 좌석 반응으로 표현한다.
  el('resultOverlay').hidden = state.status !== STATUS.FAILED;
  if (state.status === STATUS.FAILED) {
    el('resultMessage').textContent = '꼬치가 타버렸습니다. 다시 만들어 볼까요?';
  }
}

function renderReceipts() {
  const ol = el('receipts');
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

function setReaction(next) {
  reaction = next;
  syncCustomers(); // 어댑터가 좌석 액터 기분색을 갱신
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

function hitTest(e) {
  const rect = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ptr, R.camera);
  const targets = Object.values(R.objectMesh).filter((m) => m.visible);
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit ? hit.object.userData.objectKey : null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (director.controlsLocked()) return; // 전환 중 새 화면 조작 잠금 (§71)
  const key = hitTest(e);
  if (!key) return;
  const now = performance.now();
  if (LEVER_ZONE[key]) { pour.press(LEVER_ZONE[key], now); return; } // 누르는 동안 흐름
  if ((lockUntil[key] || 0) > now) return;
  lockUntil[key] = now + 200;
  handle(key, now);
});
// 손을 떼면 흐름 정지 (§38). 다른 클릭에서도 무해(활성 존 없으면 no-op).
window.addEventListener('pointerup', () => pour.release(performance.now()));
window.addEventListener('pointercancel', () => pour.release(performance.now()));

function handle(key, now) {
  switch (key) {
    case 'binChicken':
    case 'binLeek': {
      const ing = key === 'binChicken' ? 'chicken' : 'leek';
      const before = state.assemblyIndex;
      state = clickIngredient(state, ing, now);
      if (state.assemblyIndex === before) showHint('순서가 달라요');
      break;
    }
    case 'jigSkewer':
      if (isAssemblyComplete(state) && state.process === PROCESS.ASSEMBLY) {
        state = clickAssembledSkewer(state); // 그릴로 올림
        showHint('그릴로 옮겼어요');
      }
      break;
    case 'grillSkewer':
      if (isWaitingSkewer()) {
        state = placeOnGrill(state, now);
      } else if (onGrill()) {
        const before = state.status;
        const d = currentDoneness(state, now);
        state = clickGrillSkewer(state, now);
        if (state.status === before && d === 'under') showHint('아직 덜 익었어요');
        if (state.status === STATUS.PLATED) completeToDock(); // 완성 → 선반
      }
      break;
    default:
      if (key.startsWith('seatServe:')) {
        const item = dock.selected();
        if (item) {
          dock.consumeSelected(); // 선반에서 완성품을 꺼내 좌석에 제공
          setReaction('tasting');
          if (reactionTimer) clearTimeout(reactionTimer);
          reactionTimer = setTimeout(() => {
            setReaction(item.good ? 'satisfied' : 'neutral');
          }, 900);
        } else {
          showHint('선반에서 완성품을 고르세요');
        }
      }
      break; // 그 외(드링크 구조 오브젝트 등)
  }
  render();
}

// ── 화면 전환 (svc.sideNav / svc.quickNav / 키보드) ───────────
function buildQuickNav() {
  const nav = el('quickNav');
  for (const s of SCREENS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.name;
    b.dataset.screen = s.id;
    b.dataset.testid = `quicknav-${s.id}`;
    b.addEventListener('click', () => director.request(s.id, performance.now()));
    nav.appendChild(b);
  }
}
buildQuickNav();
el('navLeft').addEventListener('click', () => director.left(performance.now()));
el('navRight').addEventListener('click', () => director.right(performance.now()));
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') director.left(performance.now());
  else if (e.key === 'ArrowRight') director.right(performance.now());
});

el('restartButton').addEventListener('click', () => {
  state = restart(state);
  setReaction('waiting');
  if (reactionTimer) { clearTimeout(reactionTimer); reactionTimer = null; }
  if (grill) grill.setDoneness(0);
  render();
});

// ── 익힘 셰이더 재질 ─────────────────────────────────────────
function updateGrillVisual(now) {
  if (!grill) return;
  grill.setTime(now / 1000);
  if (onGrill()) grill.setDoneness(elapsedSecToUniform(faceElapsedMs(state, now) / 1000));
}

createGrillMaterial()
  .then((g) => {
    grill = g;
    const mesh = R.objectMesh.grillSkewer;
    mesh.material.dispose();
    mesh.material = g.material;
    // 프리워밍: 조립 화면에서 미리 컴파일해 그릴 진입 스톨 제거
    const wasVisible = mesh.visible;
    mesh.visible = true;
    R.renderFrame(performance.now());
    mesh.visible = wasVisible;
    if (typeof window !== 'undefined') window.__grill = g;
  })
  .catch((err) => console.error('익힘 재질 로드 실패:', err));

// ── 루프 ─────────────────────────────────────────────────────
let lastActive = director.activeScreenId();
function loop(now) {
  const prevStatus = state.status;
  state = tick(state, now);

  director.tick(now);
  const active = director.activeScreenId();
  if (active !== lastActive) {
    R.goToScreen(active, now, SCREEN_TRANSITION_MS);
    lastActive = active;
    render();
  }
  if (state.status !== prevStatus) render();

  updateGrillVisual(now);
  customers.tick(active); // 손님 화면일 때 말풍선·게이지 배치
  pour.tick(now); // 따르는 중이면 누적·넘침 감지
  updateDrinkPanel(active);
  updateLabels(); // 더미 오브젝트 이름표 배치
  R.renderFrame(now);
  requestAnimationFrame(loop);
}

R.goToScreen(INITIAL_SCREEN, 0, 0);
render();
requestAnimationFrame(loop);

// ── 개발·테스트 훅 ───────────────────────────────────────────
window.__prodDebug = {
  getState: () => state,
  doneness: () => currentDoneness(state, performance.now()),
  activeScreen: () => director.activeScreenId(),
  isTransitioning: () => director.isTransitioning(),
  controlsLocked: () => director.controlsLocked(),
  reaction: () => reaction,
  seatStates: () => customers.getStates(),
  dockItems: () => dock.items(),
  dockSelectedId: () => dock.selectedId(),
  pourState: () => pour.state(),
  // 결정론적 따르기 (e2e): 실제 시계 대신 명시 시간으로 맥주·거품을 채운다.
  pourExact: (beerSec, foamSec) => {
    pour.reset();
    pour.press('beer', 0);
    pour.release(beerSec * 1000);
    pour.press('foam', beerSec * 1000);
    pour.release((beerSec + foamSec) * 1000);
    return pour.state();
  },
  pourOverflow: () => { pour.reset(); pour.press('beer', 0); pour.tick(6000); return pour.state(); },
  drinkFinish: () => finishDrink(),
  drinkServeLow: () => serveOverflowLow(),
  drinkDiscard: () => discardDrink(),
  grillMaterial: () => grill,
  requestScreen: (id) => director.request(id, performance.now()),
  navLeft: () => director.left(performance.now()),
  navRight: () => director.right(performance.now()),
  screenPosOf: (key) => {
    const m = R.objectMesh[key];
    if (!m || !m.visible) return null;
    const v = m.position.clone().project(R.camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  },
  performanceStats: () => R.performanceStats(),
  renderer: R,
};
