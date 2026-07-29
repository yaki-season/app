// 프로덕션 영업 화면 진입점.
// gameState(조립·그릴 판정)를 프로덕션 렌더러의 독립 화면 구조에 배선한다. 사용자는 손님·조립·그릴·
// 드링크 화면을 자유 전환(좌·우/퀵)하고, 조리 job은 화면과 독립 진행한다. 조리 로직은 렌더러를
// import하지 않는다 — 여기서만 상태→장면을 잇는다.

import * as THREE from 'three';
import { createProductionRenderer } from './render/productionRenderer.js';
import { createStationDirector } from './render/stationDirector.js';
import { createGrillMaterial } from './render/grillMaterial.js';
import { elapsedSecToUniform } from './render/grillRenderer.js';
import { createCustomerAdapter } from './render/customerAdapter.js';
import { createCustomerOps } from './render/customerOps.js';
import { createPreparedDock, qualityFromCook } from './render/preparedDock.js';
import { createDrinkPour, DRINK } from './render/drinkStation.js';
import { SCREENS, SCREEN_IDS, SCREEN_BY_ID, INITIAL_SCREEN, SCREEN_TRANSITION_MS, OBJECTS, SEAT_IDS } from './config/screenLayout.js';
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
const lockUntil = {}; // 대상별 입력 잠금

// 각 조작 대상 key가 속한 화면 (가시성·클릭 판정용)
const SCREEN_OF = {};
for (const s of SCREENS) for (const k of s.objects) if (OBJECTS[k].kind !== 'fullframe') SCREEN_OF[k] = s.id;

// 손님 렌더 어댑터 (6석) + 운영 상태 머신. ops가 좌석 생애주기를 굴리고, adapter가 렌더한다.
const customers = createCustomerAdapter({ renderer: R, container: el('bubbleLayer') });
let ops = null; // 콘텐츠(유형·수치) 로드 후 생성
let cleanupHold = null; // { seatId, startMs } 정리 3초 홀드

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

// 운영 상태 → 어댑터 렌더 상태. serve 대상은 "수령 대기 && 선반에 주문과 같은 메뉴 선택"일 때만.
function syncCustomers(now) {
  if (!ops) { customers.apply([]); return; }
  const sel = dock.selected();
  const views = ops.views(now).map((v) => ({
    ...v,
    serveTarget: v.canServe && !!sel && sel.menu === v.menu,
    // 주문 접수·정리도 좌석 조작 대상으로 표시(정리 진행도 포함)
    cleanupProgress: cleanupHold && cleanupHold.seatId === v.seatId ? (now - cleanupHold.startMs) / ops.cfg.cleanupMs : 0,
  }));
  // 좌석 조작 메시(seatServe)는 손님 화면에서 주문 접수·서빙·정리 중 하나라도 가능하면 보인다.
  const onCustomers = director.activeScreenId() === 'SCR-SVC-CUSTOMERS';
  for (const v of views) {
    const mesh = R.objectMesh[`seatServe:${v.seatId}`];
    if (mesh) mesh.visible = onCustomers && (v.canOrder || v.canServe || v.cleanupNeeded);
  }
  customers.apply(views);
}
function seatView(seatId, now) {
  return ops ? ops.views(now).find((v) => v.seatId === seatId) : null;
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

  // 손님 6석은 loop에서 매 프레임 syncCustomers(now)로 갱신한다(게이지가 실시간으로 줄기 때문).

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
  // 정리 필요 좌석은 3초 홀드 (§7-1). 누르는 동안 게이지가 찬다.
  if (key.startsWith('seatServe:')) {
    const seatId = key.slice('seatServe:'.length);
    const v = seatView(seatId, now);
    if (v && v.cleanupNeeded) { cleanupHold = { seatId, startMs: now }; return; }
  }
  if ((lockUntil[key] || 0) > now) return;
  lockUntil[key] = now + 200;
  handle(key, now);
});
// 손을 떼면 흐름 정지 (§38). 정리 홀드는 3초 충족 시 완료, 아니면 취소(§7-3).
function releasePointers() {
  const now = performance.now();
  pour.release(now);
  if (cleanupHold && ops) {
    if (now - cleanupHold.startMs >= ops.cfg.cleanupMs) { ops.cleanup(cleanupHold.seatId); showHint('정리 완료'); }
    cleanupHold = null;
  }
}
window.addEventListener('pointerup', releasePointers);
window.addEventListener('pointercancel', releasePointers);

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
      if (key.startsWith('seatServe:') && ops) {
        const seatId = key.slice('seatServe:'.length);
        const v = seatView(seatId, now);
        if (!v) break;
        if (v.canOrder) {
          ops.acceptOrder(seatId); // 주문서 접수 → 수령 대기
          showHint('주문을 받았어요');
        } else if (v.canServe) {
          const item = dock.selected();
          if (!item) { showHint('선반에서 완성품을 고르세요'); break; }
          const r = ops.serve(seatId, item, now);
          if (r.ok) { dock.consumeSelected(); showHint('제공 완료'); }
          else showHint('주문과 다른 메뉴예요'); // 메뉴 불일치
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
  state = restart(state); // 탄 조리 job만 리셋. 손님 운영·선반은 유지.
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

  if (ops) ops.tick(now); // 손님 입장·생애주기 진행
  updateGrillVisual(now);
  syncCustomers(now); // 매 프레임 좌석 렌더(게이지 실시간 감소)
  customers.tick(active); // 손님 화면일 때 말풍선·게이지 배치
  pour.tick(now); // 따르는 중이면 누적·넘침 감지
  updateDrinkPanel(active);
  updateLabels(); // 더미 오브젝트 이름표 배치
  R.renderFrame(now);
  requestAnimationFrame(loop);
}

// 콘텐츠(손님 유형·영업일 수치)를 로드해 운영 상태 머신을 생성한다. 실패해도 스테이션은 동작한다.
Promise.all([
  fetch('/content/customers/types.json').then((r) => r.json()),
  fetch('/content/campaign/day-d1.json').then((r) => r.json()),
])
  .then(([types, day]) => {
    ops = createCustomerOps({
      seatIds: SEAT_IDS,
      types,
      config: {
        spawnIntervalSec: day.spawnIntervalSec,
        orderThinkMin: day.timingSec.orderThinkMin,
        orderThinkMax: day.timingSec.orderThinkMax,
        eatSec: day.timingSec.eat,
        cleanupSec: 3,
        leaveSec: 1,
        maxActive: 3,
      },
    });
    if (typeof window !== 'undefined') window.__ops = ops;
  })
  .catch((err) => console.error('손님 운영 콘텐츠 로드 실패:', err));

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
  seatStates: () => customers.getStates(),
  seatViews: () => (ops ? ops.views(performance.now()) : []),
  dockItems: () => dock.items(),
  dockSelectedId: () => dock.selectedId(),
  dockAdd: (item) => dock.add(item), // e2e: 조리 없이 선반 적재
  // 손님 운영 (e2e): 결정론적 입장·경과.
  opsReady: () => !!ops,
  opsAutoSpawn: (v) => ops && ops.setAutoSpawn(v),
  opsClear: () => ops && ops.clearAll(),
  forceSpawn: (seatId, typeId, thinkSec) => ops && ops.forceSpawn(seatId, typeId, performance.now(), thinkSec ?? 5),
  opsElapse: (sec) => ops && ops.debugElapse(sec),
  acceptOrder: (seatId) => ops && ops.acceptOrder(seatId),
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
