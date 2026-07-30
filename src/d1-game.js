// D1 첫 주문 — 2.5D 플레이 진입점. game.html과 같은 조작 모델(스테이션 좌·우/퀵 전환, 화면 오브젝트
// 레이캐스트 클릭, 실시간 조리)로 단일 손님(츠키오카)을 접수→조리(조립·그릴·드링크)→서빙→반응까지
// 플레이한다. 손님 화면은 승인 D1 아트(배경·손님·카운터), 조립·그릴·드링크는 더미다.

import * as THREE from 'three';
import { createD1SceneRenderer } from './render/d1SceneRenderer.js';
import { createStationDirector } from './render/stationDirector.js';
import { createGrillMaterial } from './render/grillMaterial.js';
import { elapsedSecToUniform } from './render/grillRenderer.js';
import { createCookStations } from './render/cookStations.js';
import { createDrinkPour, DRINK } from './render/drinkStation.js';
import { createPreparedDock } from './render/preparedDock.js';
import { SCREENS, SCREEN_IDS, SCREEN_BY_ID, INITIAL_SCREEN, SCREEN_TRANSITION_MS, OBJECTS, CUSTOMER_ART } from './config/d1Layout.js';
import { RECIPE } from './config/recipe.js';
import { runtimeAssetUrl } from './assets/runtimeAssetResolver.js';

const el = (id) => document.getElementById(id);
const canvas = el('scene');
const R = createD1SceneRenderer(canvas);
const director = createStationDirector({ screens: SCREEN_IDS, initial: INITIAL_SCREEN, transitionMs: SCREEN_TRANSITION_MS });

const cook = createCookStations({ slots: 2 }); // D1은 2칸 그릴로 진행(GPL-004 §18-2)
const SLOT_KEYS = ['grillSlot0', 'grillSlot1'];
const grillMats = {};
const lockUntil = {};
const dock = createPreparedDock({ container: el('dockShelf') });
const pour = createDrinkPour();
const LEVER_ZONE = { drinkLeverLower: 'beer', drinkLeverUpper: 'foam' };

// 각 조작 대상이 속한 화면 + 레이캐스트로 클릭 가능한 키(이미지 레이어는 제외).
const SCREEN_OF = {};
for (const s of SCREENS) for (const k of s.objects) if (OBJECTS[k].kind !== 'fullframe') SCREEN_OF[k] = s.id;
const CLICKABLE = new Set(['custServe', 'binChicken', 'binLeek', 'jigSkewer', 'grillWaitTray', 'grillSlot0', 'grillSlot1', 'drinkLeverUpper', 'drinkLeverLower']);

// ── 단일 손님 주문 상태 ───────────────────────────────────────
const ORDER_ICON = { '생맥주': runtimeAssetUrl('/assets/core/ui/order-icon-draft-beer-r1-b1.png'), '네기마': runtimeAssetUrl('/assets/core/ui/order-icon-negima-r1-b1.png') };
const order = { '생맥주': { need: 1, done: 0 }, '네기마': { need: 3, done: 0 } };
let custPhase = 'entering'; // entering → ordered → reacting → complete
let satisfaction = 0;

const allServed = () => Object.values(order).every((o) => o.done >= o.need);
function servableSelected() {
  const sel = dock.selected();
  if (!sel) return null;
  const line = order[sel.menu];
  return line && line.done < line.need ? sel : null;
}
function canTakeOrder() { return custPhase === 'entering'; }
function canServeCustomer() { return (custPhase === 'ordered') && !!servableSelected(); }

function customerArt() {
  if (custPhase === 'complete') return CUSTOMER_ART.eatingBeer;
  if (custPhase === 'reacting') return CUSTOMER_ART.eatingNegima;
  if (custPhase === 'ordered' && order['생맥주'].done > 0) return CUSTOMER_ART.partialBeer;
  return CUSTOMER_ART.waiting;
}

const GUIDES = {
  entering: '손님(츠키오카)을 눌러 주문을 받으세요.',
  ordered: '드링크·조립·그릴에서 생맥주와 네기마 3개를 만들어 선반에서 골라 손님에게 내세요.',
  reacting: '츠키오카가 첫 주문을 맛보고 있어요.',
  complete: 'D1 첫 주문 완료!',
};

function serveCustomer(now) {
  const sel = servableSelected();
  if (!sel) { showHint('선반에서 낼 완성품을 고르세요'); return; }
  order[sel.menu].done += 1;
  if (sel.good) satisfaction += sel.menu === '생맥주' ? 20 : 20; else satisfaction += 8;
  dock.consumeSelected();
  showHint(`${sel.menu} 제공`);
  if (allServed()) {
    custPhase = 'reacting';
    render();
    setTimeout(() => { custPhase = 'complete'; finishOrder(); }, 1400);
  }
  render();
}
function finishOrder() {
  el('resultMessage').textContent = `첫 주문 완료 · 만족도 ${Math.min(100, satisfaction)}점`;
  el('resultOverlay').hidden = false;
  render();
}
function takeOrder() {
  custPhase = 'ordered';
  showHint('주문을 받았어요: 생맥주 1 · 네기마 3');
  render();
}

// ── 더미 오브젝트 이름표 ──────────────────────────────────────
const OBJECT_LABELS = {
  custServe: '손님', workbench: '조립대', binChicken: '닭', binLeek: '파', jigSkewer: '완성 꼬치',
  grillBody: '숯불 그릴', grillWaitTray: '대기', drinkTower: '맥주 타워', glassRack: '잔 랙',
  drinkLeverUpper: '레버·거품', drinkLeverLower: '레버·맥주',
};
const LABEL_UP = { workbench: 74, grillBody: 74, drinkTower: 46, glassRack: 24, custServe: 60 };
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

// ── 드링크 잔 채움 패널 (game.js와 동일) ───────────────────────
const drinkPanel = el('drinkPanel');
const beerEl = drinkPanel.querySelector('.beer');
const foamEl = drinkPanel.querySelector('.foam');
const stampEl = drinkPanel.querySelector('.stamp');
const finishBtn = drinkPanel.querySelector('[data-act="finish"]');
const overflowEl = drinkPanel.querySelector('.drink-overflow');
const GLASS_PX = 150;
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
  if (s.phase === 'overflow') { stampEl.hidden = false; stampEl.textContent = '넘침'; stampEl.className = 'stamp q-Fail'; }
  else stampEl.hidden = true;
}
function finishDrink() {
  const q = pour.finish();
  if (q) { dock.add({ menu: '생맥주', label: q, good: q === 'Perfect' || q === 'Good' }); showHint('생맥주를 선반에 올렸어요'); }
  pour.reset();
  render();
}
function serveOverflowLow() {
  const q = pour.serveOverflow();
  if (q) dock.add({ menu: '생맥주', label: q, good: false });
  pour.reset();
  render();
}
function discardDrink() { pour.discard(); pour.reset(); showHint('잔을 폐기했어요'); render(); }
finishBtn.addEventListener('click', finishDrink);
drinkPanel.querySelector('[data-act="serve-low"]').addEventListener('click', serveOverflowLow);
drinkPanel.querySelector('[data-act="discard"]').addEventListener('click', discardDrink);

// ── 상태 → 장면·HUD ──────────────────────────────────────────
const slotIndexOf = (key) => SLOT_KEYS.indexOf(key);
function shouldShow(key) {
  const active = director.activeScreenId();
  if (SCREEN_OF[key] !== active) return false;
  const si = slotIndexOf(key);
  if (si >= 0) return si < cook.slotCount() && cook.slotViews(performance.now())[si].status !== 'empty';
  if (key === 'custServe') return canTakeOrder() || canServeCustomer();
  return true;
}

function render() {
  const now = performance.now();
  for (const key of Object.keys(SCREEN_OF)) {
    const mesh = R.objectMesh[key];
    if (mesh) mesh.visible = shouldShow(key);
  }
  // 그릴 칸 익힘 색 폴백(셰이더 로드 전)
  const views = cook.slotViews(now);
  for (const key of SLOT_KEYS) {
    const i = slotIndexOf(key);
    const mesh = R.objectMesh[key];
    if (!grillMats[key] && mesh && views[i] && views[i].cooking && mesh.material.color) {
      const c = { under: 0xd98a5f, perfect: 0xc97a2a, over: 0x8a5220, burnt: 0x2a1a10 }[views[i].doneness] ?? 0xd98a5f;
      mesh.material.color.setHex(c);
    }
  }
  R.setCustomerTexture(customerArt());

  el('svcStation').textContent = SCREEN_BY_ID[director.activeScreenId()].name;
  renderReceipts();
  renderOrderHud();
  const g = el('guide');
  g.textContent = GUIDES[custPhase] || '';
  g.hidden = !g.textContent;
  for (const btn of document.querySelectorAll('.quick-nav button')) btn.classList.toggle('active', btn.dataset.screen === director.activeScreenId());
  el('navLeft').disabled = !director.canLeft();
  el('navRight').disabled = !director.canRight();
}

function renderReceipts() {
  const ol = el('receipts');
  ol.innerHTML = '';
  const idx = cook.assemblyIndex();
  RECIPE.forEach((ing, i) => {
    const li = document.createElement('li');
    li.textContent = ing === 'chicken' ? '닭' : '파';
    li.dataset.testid = `order-slot-${i}`;
    if (i < idx) li.classList.add('done');
    else if (i === idx) li.classList.add('next');
    ol.appendChild(li);
  });
  const w = document.createElement('li');
  w.textContent = `대기 ${cook.waitingCount()}`;
  w.dataset.testid = 'wait-count';
  w.style.width = 'auto';
  w.style.padding = '0 8px';
  ol.appendChild(w);
}
function renderOrderHud() {
  const hud = el('orderHud');
  if (custPhase === 'entering') { hud.innerHTML = ''; return; }
  hud.innerHTML = Object.entries(order).map(([menu, o]) =>
    `<span class="oi ${o.done >= o.need ? 'done' : ''}" data-testid="order-${menu}"><img src="${ORDER_ICON[menu]}" alt="">${menu} ${o.done}/${o.need}</span>`
  ).join('');
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
  const targets = Object.entries(R.objectMesh).filter(([k, m]) => m.visible && CLICKABLE.has(k)).map(([, m]) => m);
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit ? hit.object.userData.objectKey : null;
}
canvas.addEventListener('pointerdown', (e) => {
  if (director.controlsLocked()) return;
  const key = hitTest(e);
  if (!key) return;
  const now = performance.now();
  if (LEVER_ZONE[key]) { pour.press(LEVER_ZONE[key], now); return; }
  if ((lockUntil[key] || 0) > now) return;
  lockUntil[key] = now + 200;
  handle(key, now);
});
function releasePointers() { pour.release(performance.now()); }
window.addEventListener('pointerup', releasePointers);
window.addEventListener('pointercancel', releasePointers);

function handle(key, now) {
  const si = slotIndexOf(key);
  if (si >= 0) { clickGrillSlot(si, now); return; }
  switch (key) {
    case 'binChicken':
    case 'binLeek': {
      const r = cook.clickIngredient(key === 'binChicken' ? 'chicken' : 'leek');
      if (!r.ok) showHint('순서가 달라요');
      else if (r.completed) showHint('꼬치 완성 → 그릴 대기');
      break;
    }
    case 'jigSkewer':
      break;
    case 'grillWaitTray': {
      const r = cook.placeToGrill(now);
      if (!r.ok) showHint(r.reason === 'no-waiting' ? '대기 중인 꼬치가 없어요' : '빈 그릴 칸이 없어요');
      break;
    }
    case 'custServe':
      if (canTakeOrder()) takeOrder();
      else if (canServeCustomer()) serveCustomer(now);
      break;
    default:
      break;
  }
  render();
}

function clickGrillSlot(i, now) {
  const r = cook.clickSlot(i, now);
  if (r.retrieved) { dock.add({ menu: '네기마', label: r.quality.good ? '좋음' : '과다', good: r.quality.good }); showHint('완성품을 선반에 올렸어요'); }
  else if (r.flipped) showHint('뒷면을 굽는 중');
  else if (!r.ok && r.reason === 'not-ready') showHint('아직 덜 익었어요');
  render();
}

function updateGrillVisual(now) {
  const views = cook.slotViews(now);
  for (const key of SLOT_KEYS) {
    const g = grillMats[key];
    if (!g) continue;
    g.setTime(now / 1000);
    const v = views[slotIndexOf(key)];
    g.setDoneness(v && v.cooking ? elapsedSecToUniform(v.faceElapsedSec) : 0);
  }
}
for (const key of SLOT_KEYS) {
  createGrillMaterial().then((g) => {
    grillMats[key] = g;
    const mesh = R.objectMesh[key];
    if (!mesh) return;
    mesh.material.dispose();
    mesh.material = g.material;
    const wasVisible = mesh.visible;
    mesh.visible = true;
    R.renderFrame(performance.now());
    mesh.visible = wasVisible;
  }).catch((err) => console.error('익힘 재질 로드 실패:', err));
}

// ── 화면 전환 ────────────────────────────────────────────────
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
  cook.reset(); dock.clear(); pour.reset();
  order['생맥주'].done = 0; order['네기마'].done = 0; satisfaction = 0; custPhase = 'entering';
  el('resultOverlay').hidden = true;
  render();
});

// ── 루프 ─────────────────────────────────────────────────────
let lastActive = director.activeScreenId();
let lastWaiting = -1;
function loop(now) {
  const discarded = cook.tickBurn(now);
  if (discarded.length) { showHint('탄 꼬치를 폐기했어요'); render(); }
  director.tick(now);
  const active = director.activeScreenId();
  if (active !== lastActive) { R.goToScreen(active, now, SCREEN_TRANSITION_MS); lastActive = active; render(); }
  if (cook.waitingCount() !== lastWaiting) { lastWaiting = cook.waitingCount(); render(); }
  updateGrillVisual(now);
  pour.tick(now);
  updateDrinkPanel(active);
  updateLabels();
  R.renderFrame(now);
  requestAnimationFrame(loop);
}
R.goToScreen(INITIAL_SCREEN, 0, 0);
render();
requestAnimationFrame(loop);

// ── 개발·테스트 훅 ───────────────────────────────────────────
window.__d1GameDebug = {
  activeScreen: () => director.activeScreenId(),
  isTransitioning: () => director.isTransitioning(),
  controlsLocked: () => director.controlsLocked(),
  requestScreen: (id) => director.request(id, performance.now()),
  custPhase: () => custPhase,
  order: () => JSON.parse(JSON.stringify(order)),
  customerArt: () => customerArt(),
  texturesReady: () => R.texturesReady(),
  dockItems: () => dock.items(),
  dockSelectedId: () => dock.selectedId(),
  dockAdd: (item) => dock.add(item),
  dockSelect: (id) => dock.select(id),
  cookFillAssembly: () => cook.debugFillAssembly(),
  cookWaiting: () => cook.waitingCount(),
  cookSlots: () => cook.slotViews(performance.now()),
  cookPlace: () => cook.placeToGrill(performance.now()),
  cookClickSlot: (i) => clickGrillSlot(i, performance.now()),
  cookElapse: (sec) => cook.debugElapse(sec),
  clickCustomer: () => handle('custServe', performance.now()),
  pourExact: (beerSec, foamSec) => { pour.reset(); pour.press('beer', 0); pour.release(beerSec * 1000); pour.press('foam', beerSec * 1000); pour.release((beerSec + foamSec) * 1000); return pour.state(); },
  drinkFinish: () => finishDrink(),
  screenPosOf: (key) => {
    const m = R.objectMesh[key];
    if (!m || !m.visible) return null;
    const v = m.position.clone().project(R.camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  },
  renderer: R,
};
