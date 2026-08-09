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
import { settleDay } from './render/daySettlement.js';
import { reputationDelta, catalog, buy, effectiveEconomy, ownedEffects, grillUnlockState } from './render/progression.js';
import { createPreparedDock } from './render/preparedDock.js';
import { createDrinkPour, DRINK } from './render/drinkStation.js';
import { drinkLeverZoneForDelta } from './render/drinkLeverDrag.js';
import { createCookStations } from './render/cookStations.js';
import { SCREENS, SCREEN_IDS, SCREEN_BY_ID, INITIAL_SCREEN, SCREEN_TRANSITION_MS, OBJECTS, SEAT_IDS, GRILL_SLOT_KEYS, DEFAULT_GRILL_SLOTS, COOKING_ART, DRINK_ART_STATE } from './config/screenLayout.js';
import { D1_GRILL_SLOTS, D1_GRILL_FINISHED_TRAY } from './config/d1GrillLayout.js';
import { RECIPE, COOK_THRESHOLDS_SEC, DONENESS, canAdvance } from './config/recipe.js';
import { loadD1RuntimeAssets } from './assets/runtimeAssetResolver.js';

const el = (id) => document.getElementById(id);
const canvas = el('scene');
const runtimeAssets = await loadD1RuntimeAssets();
document.getElementById('dockShelf')?.style.setProperty(
  '--dock-shelf-art',
  `url("${runtimeAssets.SERVICE_COUNTER.url}")`,
);
document.getElementById('dockShelf')?.style.setProperty(
  '--dock-serving-plate-art',
  `url("${runtimeAssets.SERVING_PLATE.url}")`,
);
const R = createProductionRenderer(canvas, { runtimeAssets });
R.setObjectVisible('custTsukioka', false);
const director = createStationDirector({ screens: SCREEN_IDS, initial: INITIAL_SCREEN, transitionMs: SCREEN_TRANSITION_MS });
const PRODUCTION_CONTENT_URLS = Object.freeze({
  customerTypes: '/content/customers/types.json',
  day: '/content/campaign/day-d1.json',
  upgrades: '/content/progression/upgrades.json',
  grillSlots: '/content/progression/grill-slots.json',
});

// 그릴 칸 수와 첫 배치 수는 각 진입점의 런타임 계약으로 정한다.
const cook = createCookStations({ slots: DEFAULT_GRILL_SLOTS });
const SLOT_KEYS = GRILL_SLOT_KEYS;
const grillMats = {}; // slotKey → 익힘 셰이더 재질
const GRILL_FLIP_AXIS = new THREE.Vector3(0, 1, 0);
const grillFlipQuaternion = new THREE.Quaternion();
const lockUntil = {}; // 대상별 입력 잠금

// 각 조작 대상 key가 속한 화면 (가시성·클릭 판정용)
const SCREEN_OF = {};
for (const s of SCREENS) for (const k of s.objects) if (OBJECTS[k].kind !== 'fullframe') SCREEN_OF[k] = s.id;

// 손님 렌더 어댑터 (6석) + 운영 상태 머신. ops가 좌석 생애주기를 굴리고, adapter가 렌더한다.
const customers = createCustomerAdapter({ renderer: R, container: el('bubbleLayer') });
let ops = null; // 콘텐츠(유형·수치) 로드 후 생성
let baseEconomy = null; // 영업일 기본 경제 수치
let upgrades = []; // 구매 카탈로그(업그레이드)
let staff = []; // 고용 가능한 직원(콘텐츠)
let loadedDay = null; // production이 실제로 읽은 day 원본(E2E 데이터 계약 확인용)
const wallet = { gold: 0, reputation: 0, owned: new Set(), staff: new Set() }; // 여러 날 지속되는 성장 자원
let cleanupHold = null; // { seatId, startMs } 정리 3초 홀드
let grillSlotConfig = null;
let claimedGrillSlots = DEFAULT_GRILL_SLOTS;
let availableGrillSlots = DEFAULT_GRILL_SLOTS;
const ownedItems = () => upgrades.filter((u) => wallet.owned.has(u.id));
const ownedStaff = () => staff.filter((s) => wallet.staff.has(s.id));
const drinkStaff = () => ownedStaff().find((s) => s.role === 'drink') || null;
const currentEconomy = () => (baseEconomy ? effectiveEconomy(baseEconomy, ownedItems()) : null);
const syncGrillSlots = () => {
  cook.setSlots(claimedGrillSlots);
  R.setGrillSlots(claimedGrillSlots);
};
const syncSlots = () => {}; // 그릴 칸은 명성 해금(다음 영업일·클릭)으로 이전 예정(#2). 현재는 기본 칸 유지.
const syncSeats = () => { const cap = ownedEffects(ownedItems()).seatCap; if (ops) ops.setCapacity(cap); R.setSeatCapacity(cap); }; // 업그레이드 → 좌석 수
// 좌석 8석 이상이면 하루에 8인 예약 파티가 예약 시각에 함께 입장한다(대형 그룹).
const scheduleReservation = () => {
  if (ops && ownedEffects(ownedItems()).seatCap >= 8) {
    ops.addReservation({ typeId: 'office', size: 8, dueMs: performance.now() + 20000, thinkSec: 4 });
  }
};

// 완성품 목록. 선택/제공 로직은 하나로 유지하고 요리/음료의 시각 구역만 분리한다.
const dock = createPreparedDock({ container: el('dockShelf') });

// 생맥주 따르기 (드링크 화면). 레버 아래=맥주, 위=거품 (GPL-004).
const pour = createDrinkPour();
let activeDrinkLeverDrag = null;

// 더미 오브젝트 이름표 (아트 전 식별용). 활성 화면의 보이는 오브젝트 위에 DOM 텍스트를 얹는다.
const OBJECT_LABELS = {
  workbench: '조립대', binChicken: '닭', binLeek: '파', jigSkewer: '완성 꼬치',
  grillBody: '숯불 그릴', grillSkewer: '꼬치', grillFinishedTray: '완료 트레이 (개발)',
  drinkTower: '맥주 타워', glassRack: '잔 랙', drinkLeverDrag: '레버',
};
// 큰 고정물은 라벨을 위쪽으로 올려 위에 놓인 조작 대상 라벨과 겹치지 않게 한다(화면 px 오프셋).
const LABEL_UP = { workbench: 74, grillBody: 74, drinkTower: 46, glassRack: 24 };
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
  if (!ops) {
    customers.apply([]);
    for (const seatId of SEAT_IDS) {
      R.setSeatPlateVisible(seatId, false);
      R.setSeatEmptyDishesVisible(seatId, false);
      R.setSeatCleanupOverlayVisible(seatId, false);
    }
    return;
  }
  const sel = dock.selected();
  const views = ops.views(now).map((v) => ({
    ...v,
    serveTarget: v.canServe && !!sel && sel.menu === v.menu,
    // 주문 접수·정리도 좌석 조작 대상으로 표시(정리 진행도 포함)
    cleanupProgress: cleanupHold && cleanupHold.seatId === v.seatId ? (now - cleanupHold.startMs) / ops.cfg.cleanupMs : 0,
  }));
  // 좌석 조작 메시(seatServe)는 손님 화면에서 주문 접수·서빙·정리 중 하나라도 가능하면 보인다.
  const onCustomers = director.activeScreenId() === 'SCR-SVC-CUSTOMERS';
  for (const seatId of SEAT_IDS) {
    const view = views.find((item) => item.seatId === seatId);
    R.setSeatPlateVisible(seatId, onCustomers && !!view?.occupied && !view.cleanupNeeded);
    R.setSeatEmptyDishesVisible(seatId, onCustomers && !!view?.cleanupNeeded);
    R.setSeatCleanupOverlayVisible(seatId, onCustomers && cleanupHold?.seatId === seatId);
  }
  for (const v of views) {
    const mesh = R.objectMesh[`seatServe:${v.seatId}`];
    if (mesh) mesh.visible = onCustomers && (v.canOrder || v.canServe || v.cleanupNeeded);
  }
  customers.apply(views, { actorsVisible: onCustomers });
  // 이 legacy sandbox에는 REGULAR_TSUKIOKA identity가 없으므로 고정 승인 actor를 추측 재사용하지 않는다.
  R.setObjectVisible('custTsukioka', false);
}
function seatView(seatId, now) {
  return ops ? ops.views(now).find((v) => v.seatId === seatId) : null;
}
// 좌석 손님 phase별 아트 교체는 이름 없는 엑스트라 승인 아트(CH-EXTRA-*)가 나오면 다시 붙인다.
// 그 전까지 이 sandbox의 좌석 손님은 기분 색 더미이며, 츠키오카 아트를 크롭해 재사용하지 않는다
// (ART-003: 엑스트라가 츠키오카로 오인되지 않아야 한다).

// ── 드링크 잔 채움 패널 ──────────────────────────────────────
const drinkPanel = el('drinkPanel');
const beerEl = drinkPanel.querySelector('.beer');
const foamEl = drinkPanel.querySelector('.foam');
const stampEl = drinkPanel.querySelector('.stamp');
const finishBtn = drinkPanel.querySelector('[data-act="finish"]');
const overflowEl = drinkPanel.querySelector('.drink-overflow');
const GLASS_PX = 150;
// 목표량에 도달하면 잔이 시각적으로도 가득 찬다.
drinkPanel.querySelector('.target-line').style.bottom = `${GLASS_PX}px`;

function updateDrinkPanel(activeScreen) {
  const show = activeScreen === 'SCR-SVC-DRINK';
  drinkPanel.hidden = !show;
  if (!show) return;
  const s = pour.state();
  const beerH = Math.min(1, s.beerSec / DRINK.glassCapacity) * GLASS_PX;
  const foamH = Math.min(1 - beerH / GLASS_PX, s.foamSec / DRINK.glassCapacity) * GLASS_PX;
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
    showHint('생맥주를 음료 픽업대에 올렸어요');
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

// ── 상태 → 장면·HUD ─────────────────────────────────────────
const slotIndexOf = (key) => SLOT_KEYS.indexOf(key);

// 조작 대상이 지금 보여야 하는가 (활성 화면 + 조리 상태).
function shouldShow(key) {
  const active = director.activeScreenId();
  if (SCREEN_OF[key] !== active) return false;
  const si = slotIndexOf(key);
  if (si >= 0) return si < cook.slotCount() && cook.slotViews(performance.now())[si].status !== 'empty';
  switch (key) {
    case 'binChicken':
    case 'binLeek': return true; // 조립은 언제든 가능
    case 'jigSkewer': return true; // 조립 진행 표시
    case 'grillWaitTray': return true; // 대기 트레이는 항상
    default: return true; // 손님·드링크 구조 오브젝트
  }
}

function render() {
  const now = performance.now();
  for (const key of Object.keys(SCREEN_OF)) {
    R.setObjectVisible(key, shouldShow(key));
  }

  // 그릴 칸 익힘 색 (셰이더 로드 전 폴백)
  const views = cook.slotViews(now);
  for (const key of SLOT_KEYS) {
    const i = slotIndexOf(key);
    const mesh = R.objectMesh[key];
    if (!grillMats[key] && mesh && views[i] && views[i].cooking && mesh.material.color) {
      const c = { under: 0xd98a5f, perfect: 0xc97a2a, over: 0x8a5220, burnt: 0x2a1a10 }[views[i].doneness] ?? 0xd98a5f;
      mesh.material.color.setHex(c);
    }
  }

  // 영업 shell HUD
  el('svcStation').textContent = SCREEN_BY_ID[director.activeScreenId()].name;
  renderReceipts();
  for (const btn of document.querySelectorAll('.quick-nav button')) {
    btn.classList.toggle('active', btn.dataset.screen === director.activeScreenId());
  }
  el('navLeft').disabled = !director.canLeft();
  el('navRight').disabled = !director.canRight();
  el('resultOverlay').hidden = true; // 조리 실패는 칸 폐기로 처리(전역 오버레이 없음)
}

// 주문서 rail: 조립 진행 + 대기 트레이 수.
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
  // 승인 아트 레이어(artMesh)에 붙은 hit target도 대상이다. objectMesh 키만 돌면
  // grillFinishedTray처럼 image kind로 옮겨간 대상이 클릭 불가가 된다.
  const keys = new Set([...Object.keys(R.objectMesh), ...Object.keys(R.interactionMesh)]);
  const targets = [...keys]
    .map((key) => R.interactionMesh[key] ?? R.objectMesh[key])
    .filter((mesh) => mesh.visible && !mesh.userData.decorative);
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit ? hit.object.userData.objectKey : null;
}

function setDrinkLeverDragZone(zone, now) {
  if (!activeDrinkLeverDrag || activeDrinkLeverDrag.zone === zone) return;
  pour.release(now);
  if (zone) pour.press(zone, now);
  activeDrinkLeverDrag.zone = zone;
  const companion = zone === 'beer'
    ? DRINK_ART_STATE.leverBeer
    : zone === 'foam'
      ? DRINK_ART_STATE.leverFoam
      : DRINK_ART_STATE.leverNeutral;
  R.setObjectTexture?.('drinkStation', COOKING_ART.drinkStation, companion);
}

function updateDrinkLeverDrag(e) {
  if (!activeDrinkLeverDrag || e.pointerId !== activeDrinkLeverDrag.pointerId) return;
  const zone = drinkLeverZoneForDelta(e.clientY - activeDrinkLeverDrag.startY);
  setDrinkLeverDragZone(zone, performance.now());
}

canvas.addEventListener('pointerdown', (e) => {
  if (director.controlsLocked()) return; // 전환 중 새 화면 조작 잠금 (§71)
  const key = hitTest(e);
  if (!key) return;
  const now = performance.now();
  if (key === 'drinkLeverDrag') {
    activeDrinkLeverDrag = { pointerId: e.pointerId, startY: e.clientY, zone: null };
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    return;
  }
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
canvas.addEventListener('pointermove', updateDrinkLeverDrag);
function releasePointers(e) {
  const now = performance.now();
  if (activeDrinkLeverDrag && (!e || e.pointerId === activeDrinkLeverDrag.pointerId)) {
    setDrinkLeverDragZone(null, now);
    if (canvas.hasPointerCapture?.(activeDrinkLeverDrag.pointerId)) {
      canvas.releasePointerCapture(activeDrinkLeverDrag.pointerId);
    }
    activeDrinkLeverDrag = null;
  } else {
    pour.release(now);
  }
  R.setObjectTexture?.('drinkStation', COOKING_ART.drinkStation, DRINK_ART_STATE.leverNeutral);
  if (cleanupHold && ops) {
    if (now - cleanupHold.startMs >= ops.cfg.cleanupMs) { ops.cleanup(cleanupHold.seatId); showHint('정리 완료'); }
    cleanupHold = null;
  }
}
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
      break; // 진행 표시 전용(완성 시 자동으로 대기 트레이로)
    case 'grillWaitTray': {
      const r = cook.placeToGrill(now); // 대기 꼬치를 빈 칸에
      if (!r.ok) showHint(r.reason === 'no-waiting' ? '대기 중인 꼬치가 없어요' : '빈 그릴 칸이 없어요');
      else if (r.staged) showHint(`첫 배치 동시 시작 · 꼬치 ${r.remainingForBatch}개를 더 올리세요`);
      else if (r.batchStarted) showHint('첫 배치 동시 조리 시작 · 8초 뒤 꼬치를 클릭해 뒤집으세요');
      else showHint('앞면 조리 시작 · 8초 뒤 꼬치를 클릭해 뒤집으세요');
      break;
    }
    case 'grillFinishedTray':
      showHint(dock.items().some((item) => item.menu === '네기마')
        ? '완료 트레이 · 완성품은 아래 요리 서빙대에서 선택하세요'
        : '완료된 네기마가 아직 없어요');
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
          if (!item) { showHint('요리 서빙대나 음료 픽업대에서 완성품을 고르세요'); break; }
          const r = ops.serve(seatId, item, now);
          if (r.ok) {
            dock.consumeSelected();
            if (r.left) showHint('실패한 음식! 손님이 화나서 나갔어요');
            else if (r.partial) showHint(`제공 (남은 ${r.remaining}개)`);
            else showHint(r.quality === 'good' ? '제공 완료 (만족)' : '제공 완료 (낮은 품질)');
          } else showHint('주문과 다른 메뉴예요'); // 메뉴 불일치
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
  cook.reset(); // 조리 초기화(결과 오버레이는 현재 미사용, 안전용)
  render();
});

// ── 영업 종료 · 정산 · 다음 날 ────────────────────────────────
let settling = false;
function endDay() {
  if (!ops || !baseEconomy) return;
  const records = ops.records();
  const s = settleDay(records, currentEconomy());
  const repDelta = reputationDelta(records);
  // 수익·명성을 지갑에 누적(여러 날 진행). 명성은 소비하지 않는 조건 자원이다.
  wallet.gold += s.total;
  const wages = ownedStaff().reduce((sum, st) => sum + (st.wageGold || 0), 0); // 직원 일당(매일 차감)
  wallet.gold = Math.max(0, wallet.gold - wages);
  wallet.reputation = Math.max(0, wallet.reputation + repDelta);
  const set = (f, v) => { const node = document.querySelector(`#settlement [data-f="${f}"]`); if (node) node.textContent = v; };
  set('visited', s.visited); set('served', s.served); set('lost', s.lost);
  set('good', s.quality.good); set('low', s.quality.low);
  set('revenue', s.revenue); set('tip', s.tip); set('total', s.total);
  set('wage', wages);
  set('avgSatisfaction', s.avgSatisfaction);
  set('repDelta', repDelta >= 0 ? `+${repDelta}` : `${repDelta}`);
  set('walletGold', wallet.gold); set('walletRep', wallet.reputation);
  el('settlement').hidden = false;
  settling = true; // 손님 시간 정지
}
function nextDay() {
  if (grillSlotConfig) {
    availableGrillSlots = grillUnlockState(claimedGrillSlots, wallet.reputation, grillSlotConfig).available;
  }
  if (ops) { ops.resetDay(); ops.setAutoSpawn(true); scheduleReservation(); }
  el('settlement').hidden = true;
  el('purchase').hidden = true;
  settling = false;
}
el('endDay').addEventListener('click', endDay);
el('nextDay').addEventListener('click', nextDay);

// ── 구매 카탈로그 (SCR-META-PURCHASE) ─────────────────────────
const ITEM_LABELS = {
  'ingredient-chicken-t2': { name: '닭 등급 ↑', meta: '판매가 +10%' },
  'interior-seats-8': { name: '좌석 8석', meta: '좌석 확장' },
  'interior-seats-12': { name: '좌석 12석', meta: '좌석 확장' },
};
const CAT_LABELS = { ingredient: '재료', equipment: '장비', interior: '인테리어', staff: '직원' };
const LOCK_TEXT = { 'locked-rep': '명성 부족', 'locked-prereq': '선행 필요', unaffordable: '골드 부족' };
let purchaseCat = null;

// 고용 가능한 직원(현재 증분: 드링크 자동 제조 직원만).
const hireableStaff = () => staff.filter((s) => s.active !== false && s.role === 'drink');
const STAFF_LABELS = { 'staff-drink': { name: '드링크 직원', meta: '생맥주 자동 제조' } };
const purchaseCats = () => {
  const cats = [...new Set(upgrades.filter((u) => u.active !== false).map((u) => u.category))];
  if (hireableStaff().length) cats.push('staff');
  return cats;
};
function openPurchase() {
  const cats = purchaseCats();
  if (!purchaseCat || !cats.includes(purchaseCat)) purchaseCat = cats[0];
  el('purchaseFeedback').textContent = '';
  el('purchase').hidden = false;
  renderPurchase();
}
function renderPurchase() {
  document.querySelector('#purchase [data-w="gold"]').textContent = wallet.gold;
  document.querySelector('#purchase [data-w="rep"]').textContent = wallet.reputation;
  const cats = purchaseCats();
  const tabs = el('catTabs');
  tabs.innerHTML = '';
  for (const c of cats) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = CAT_LABELS[c] ?? c;
    b.dataset.testid = `cat-${c}`;
    b.classList.toggle('active', c === purchaseCat);
    b.addEventListener('click', () => { purchaseCat = c; renderPurchase(); });
    tabs.appendChild(b);
  }
  const list = el('itemList');
  list.innerHTML = '';
  if (purchaseCat === 'staff') { renderStaffList(list); return; }
  for (const item of catalog(upgrades, wallet).filter((i) => i.category === purchaseCat)) {
    const label = ITEM_LABELS[item.id] ?? { name: item.id, meta: '' };
    const li = document.createElement('li');
    li.className = `item-card${item.state === 'owned' ? ' owned' : ''}`;
    li.dataset.testid = `item-${item.id}`;
    li.dataset.state = item.state;
    let right;
    if (item.state === 'owned') right = '<span class="held">보유</span>';
    else if (item.state === 'buyable') right = `<button class="buy" data-buy="${item.id}" data-testid="buy-${item.id}">${item.costGold}G 구매</button>`;
    else right = `<span class="locked">${LOCK_TEXT[item.state] ?? ''}${item.state === 'locked-rep' ? ` (명성 ${item.reputationReq})` : ''}</span>`;
    li.innerHTML = `<span class="info"><span class="name">${label.name}</span><span class="meta">${label.meta} · ${item.costGold}G · 명성 ${item.reputationReq}</span></span>${right}`;
    const buyBtn = li.querySelector('[data-buy]');
    if (buyBtn) buyBtn.addEventListener('click', () => buyItem(item.id));
    list.appendChild(li);
  }
}
function buyItem(id) {
  const item = upgrades.find((u) => u.id === id);
  if (!item) return;
  const r = buy(item, wallet);
  if (!r.ok) { el('purchaseFeedback').textContent = LOCK_TEXT[r.reason] ?? '구매할 수 없습니다'; return; }
  wallet.gold = r.gold;
  wallet.owned.add(r.ownedAdd);
  syncSlots(); // 그릴 칸 업그레이드 반영
  syncSeats(); // 좌석 확장 업그레이드 반영
  const label = ITEM_LABELS[id] ?? { name: id };
  el('purchaseFeedback').textContent = `${label.name} 구매 완료 (남은 골드 ${wallet.gold}G)`;
  renderPurchase();
}
// 직원 고용 목록. 일당(wageGold)은 정산에서 매일 차감되므로, 고용은 첫 일당을 감당할 수 있을 때만.
function renderStaffList(list) {
  for (const s of hireableStaff()) {
    const owned = wallet.staff.has(s.id);
    const affordable = wallet.gold >= s.wageGold;
    const label = STAFF_LABELS[s.id] ?? { name: s.id, meta: s.role };
    const li = document.createElement('li');
    li.className = `item-card${owned ? ' owned' : ''}`;
    li.dataset.testid = `item-${s.id}`;
    li.dataset.state = owned ? 'owned' : affordable ? 'hireable' : 'unaffordable';
    let right;
    if (owned) right = '<span class="held">고용됨</span>';
    else if (affordable) right = `<button class="buy" data-hire="${s.id}" data-testid="hire-${s.id}">고용 (일당 ${s.wageGold}G)</button>`;
    else right = '<span class="locked">골드 부족(첫 일당)</span>';
    li.innerHTML = `<span class="info"><span class="name">${label.name}</span><span class="meta">${label.meta} · 일당 ${s.wageGold}G</span></span>${right}`;
    const hireBtn = li.querySelector('[data-hire]');
    if (hireBtn) hireBtn.addEventListener('click', () => hireStaff(s.id));
    list.appendChild(li);
  }
}
function hireStaff(id) {
  const s = staff.find((x) => x.id === id);
  if (!s || wallet.staff.has(id)) return;
  if (wallet.gold < s.wageGold) { el('purchaseFeedback').textContent = '골드 부족(첫 일당)'; return; }
  wallet.staff.add(id);
  el('purchaseFeedback').textContent = `${STAFF_LABELS[id]?.name ?? id} 고용 완료 (일당 ${s.wageGold}G)`;
  renderPurchase();
}
el('openPurchase').addEventListener('click', openPurchase);
el('closePurchase').addEventListener('click', () => { el('purchase').hidden = true; });

// ── 그릴 칸 클릭·익힘 셰이더 ──────────────────────────────────
function clickGrillSlot(i, now) {
  const r = cook.clickSlot(i, now);
  if (r.retrieved) {
    dock.add({ menu: '네기마', label: r.quality.good ? '좋음' : '과다', good: r.quality.good });
    showHint('완성품을 요리 서빙대에 올렸어요');
  } else if (r.flipped) {
    showHint('꼬치를 뒤집는 중 · 0.3초 뒤 뒷면 조리가 시작됩니다');
  } else if (!r.ok && r.reason === 'not-ready') {
    const view = cook.slotViews(now)[i];
    const remaining = Math.max(1, Math.ceil(
      COOK_THRESHOLDS_SEC[DONENESS.PERFECT] - view.faceElapsedSec,
    ));
    showHint(`${remaining}초 더 굽고 꼬치를 클릭해 ${view.contactFace === 'front' ? '뒤집으세요' : '완성하세요'}`);
  }
  render();
}

// 각 그릴 칸의 셰이더 익힘값을 매 프레임 갱신. 굽는 칸은 경과로, 그 외는 날것(0).
function updateGrillVisual(now) {
  const views = cook.slotViews(now);
  for (const key of SLOT_KEYS) {
    const g = grillMats[key];
    if (!g) continue;
    g.setTime(now / 1000);
    const v = views[slotIndexOf(key)];
    g.setDoneness(v && v.cooking ? elapsedSecToUniform(v.faceElapsedSec) : 0);
    const mesh = R.objectMesh[key];
    if (!mesh) continue;
    mesh.userData.grillBaseQuaternion ??= mesh.quaternion.clone();
    mesh.quaternion.copy(mesh.userData.grillBaseQuaternion).multiply(
      grillFlipQuaternion.setFromAxisAngle(GRILL_FLIP_AXIS, v?.visualRotationRad ?? 0),
    );
  }
}

// 그릴 칸마다 익힘 셰이더 재질을 로드해 물린다.
for (const key of SLOT_KEYS) {
  createGrillMaterial()
    .then((g) => {
      grillMats[key] = g;
      const mesh = R.objectMesh[key];
      if (!mesh) return;
      mesh.material.dispose();
      mesh.material = g.material;
      const wasVisible = mesh.visible;
      mesh.visible = true;
      R.renderFrame(performance.now());
      mesh.visible = wasVisible;
    })
    .catch((err) => console.error('익힘 재질 로드 실패:', err));
}

// ── 그릴 칸 익힘 상태 게이지 (DOM 오버레이, 그릴 화면 전용) ──────
// 셰이더 색을 보완해, 굽는 각 칸의 면·익힘 단계·적정 구간까지의 진행도를 읽을 수 있게 한다.
const DONE_LABEL = { [DONENESS.UNDER]: '덜 익음', [DONENESS.PERFECT]: '적정', [DONENESS.OVER]: '과다', [DONENESS.BURNT]: '탄' };
const grillUnlockButton = document.createElement('button');
grillUnlockButton.type = 'button';
grillUnlockButton.className = 'grill-unlock';
grillUnlockButton.dataset.testid = 'grill-unlock';
grillUnlockButton.hidden = true;
el('grillLayer').appendChild(grillUnlockButton);

function updateGrillUnlockButton(activeScreen = director.activeScreenId()) {
  const pending = availableGrillSlots > claimedGrillSlots;
  grillUnlockButton.hidden = activeScreen !== 'SCR-SVC-GRILL' || !pending;
  grillUnlockButton.textContent = pending ? `그릴 ${availableGrillSlots}칸 해금 가능 · 클릭` : '';
}

grillUnlockButton.addEventListener('click', () => {
  if (availableGrillSlots <= claimedGrillSlots) return;
  claimedGrillSlots = availableGrillSlots;
  syncGrillSlots();
  showHint(`그릴이 ${claimedGrillSlots}칸으로 확장됐어요`);
  render();
});

const BURNT_SEC = COOK_THRESHOLDS_SEC[DONENESS.BURNT];
const grillGauges = {}; // slotKey → { node, label, marker }
for (const key of SLOT_KEYS) {
  const node = document.createElement('div');
  node.className = 'grill-gauge';
  node.dataset.testid = `grill-gauge-${slotIndexOf(key)}`;
  node.hidden = true;
  // 구간 폭을 임계값(탄=100%)으로 정규화. 매직 넘버 없이 recipe 데이터에서 파생.
  const uW = (COOK_THRESHOLDS_SEC[DONENESS.PERFECT] / BURNT_SEC) * 100;
  const pW = ((COOK_THRESHOLDS_SEC[DONENESS.OVER] - COOK_THRESHOLDS_SEC[DONENESS.PERFECT]) / BURNT_SEC) * 100;
  const oW = ((BURNT_SEC - COOK_THRESHOLDS_SEC[DONENESS.OVER]) / BURNT_SEC) * 100;
  node.innerHTML = `<span class="gg-label" data-testid="grill-gauge-label-${slotIndexOf(key)}"></span>`
    + '<div class="gg-track">'
    + `<span class="gg-zone under" style="width:${uW}%"></span>`
    + `<span class="gg-zone perfect" style="width:${pW}%"></span>`
    + `<span class="gg-zone over" style="width:${oW}%"></span>`
    + '<span class="gg-marker"></span></div>';
  el('grillLayer').appendChild(node);
  grillGauges[key] = { node, label: node.querySelector('.gg-label'), marker: node.querySelector('.gg-marker') };
}

function updateGrillOverlays(now, activeScreen) {
  const onGrill = activeScreen === 'SCR-SVC-GRILL';
  updateGrillUnlockButton(activeScreen);
  const views = cook.slotViews(now);
  for (const key of SLOT_KEYS) {
    const g = grillGauges[key];
    const v = views[slotIndexOf(key)];
    const mesh = R.objectMesh[key];
    if (!onGrill || !mesh || !v || !v.cooking) { g.node.hidden = true; continue; }
    const p = R.projectToScreen(mesh.position);
    g.node.style.left = `${p.x}px`;
    g.node.style.top = `${p.y - 70}px`;
    g.node.hidden = false;
    g.node.dataset.stage = v.doneness;
    const face = v.status === 'front' ? '앞면' : '뒷면';
    const action = canAdvance(v.doneness) ? (v.status === 'front' ? ' · 뒤집기' : ' · 회수') : '';
    g.label.textContent = `${face} · ${DONE_LABEL[v.doneness] ?? ''}${action}`;
    g.marker.style.left = `${Math.min(1, v.faceElapsedSec / BURNT_SEC) * 100}%`;
  }
}

// ── 직원 자동 제조 (드링크) ──────────────────────────────────
// 드링크 직원을 고용하면 주기적으로 생맥주를 음료 픽업대에 자동으로 올린다. 품질은 qualityCap(초급 good) 상한,
// mistakeRate 확률로 낮은 품질(OK). 픽업대가 넘치지 않게 버퍼 상한(3잔)까지만 만든다.
const AUTO_DRINK_BASE_SEC = 10;
let lastAutoDrinkMs = 0;
function autoProduceTick(now, force = false) {
  if (settling) return;
  const ds = drinkStaff();
  if (!ds) return;
  const interval = (AUTO_DRINK_BASE_SEC / (ds.speedMult || 1)) * 1000;
  if (!force && now - lastAutoDrinkMs < interval) return;
  lastAutoDrinkMs = now;
  if (dock.items().filter((i) => i.menu === '생맥주').length >= 3) return; // 버퍼 상한
  const good = Math.random() >= (ds.mistakeRate || 0); // 실수면 낮은 품질(OK)
  const label = good ? (ds.qualityCap === 'perfect' ? 'Perfect' : 'Good') : 'OK';
  dock.add({ menu: '생맥주', label, good });
  showHint('직원이 생맥주를 준비했어요');
  render();
}

// ── 루프 ─────────────────────────────────────────────────────
let lastActive = director.activeScreenId();
let lastWaiting = -1;
function loop(now) {
  const discarded = cook.tickBurn(now); // 탄 칸 폐기
  if (discarded.length) { showHint('탄 꼬치를 폐기했어요'); render(); }

  director.tick(now);
  const active = director.activeScreenId();
  if (active !== lastActive) {
    R.goToScreen(active, now, SCREEN_TRANSITION_MS);
    lastActive = active;
    render();
  }
  // 대기 트레이 수가 바뀌면 HUD 갱신
  if (cook.waitingCount() !== lastWaiting) { lastWaiting = cook.waitingCount(); render(); }

  if (ops && !settling) ops.tick(now); // 손님 입장·생애주기 진행 (정산 중 정지)
  autoProduceTick(now); // 드링크 직원 자동 제조
  updateGrillVisual(now);
  R.setCleanupOverlayFrame(Math.floor(now / 180));
  updateGrillOverlays(now, active); // 그릴 칸 익힘 게이지
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
  fetch(PRODUCTION_CONTENT_URLS.customerTypes).then((r) => r.json()),
  fetch(PRODUCTION_CONTENT_URLS.day).then((r) => r.json()),
  fetch(PRODUCTION_CONTENT_URLS.upgrades).then((r) => r.json()).catch(() => []),
  fetch('/content/staff/staff.json').then((r) => r.json()).catch(() => []),
  fetch(PRODUCTION_CONTENT_URLS.grillSlots).then((r) => r.json()),
])
  .then(([types, day, upgradeData, staffData, grillData]) => {
    loadedDay = day;
    baseEconomy = day.economy;
    // 골드 grillSlots 업그레이드는 제외한다(그릴 칸은 명성 해금으로 이전 예정, GPL-005 v2.23.0).
    upgrades = (upgradeData || []).filter((item) => item.effect?.kind !== 'grillSlots');
    staff = staffData || [];
    grillSlotConfig = grillData;
    availableGrillSlots = grillUnlockState(claimedGrillSlots, wallet.reputation, grillSlotConfig).available;
    syncGrillSlots();
    syncSlots(); // 그릴 칸 동기화(현재 무동작 — 명성 해금 이전 예정)
    ops = createCustomerOps({
      seatIds: SEAT_IDS,
      types,
      config: {
        spawnIntervalSec: day.spawnIntervalSec,
        orderThinkMin: day.timingSec.orderThinkMin,
        orderThinkMax: day.timingSec.orderThinkMax,
        eatSec: day.timingSec.eat,
        waitRecoverySec: day.waitRecoverySec, // 항목 제공 시 인내심 회복
        urgentThresholdSec: day.urgentThresholdSec, // 긴급 대기 임계
        cleanupSec: 3,
        leaveSec: 1,
        seatCap: ownedEffects(ownedItems()).seatCap, // 초기 좌석 수(업그레이드 반영)
        waveSize: 2, // 한 파동 입장 수
        seed: 1, // 재현 가능한 손님 생성·재주문
      },
    });
    syncSeats(); // 좌석 수 반영(렌더러 + maxActive)
    scheduleReservation(); // 좌석이 충분하면 8인 예약 예약
    if (typeof window !== 'undefined') window.__ops = ops;
  })
  .catch((err) => console.error('손님 운영 콘텐츠 로드 실패:', err));

R.goToScreen(INITIAL_SCREEN, 0, 0);
render();
requestAnimationFrame(loop);

// ── 개발·테스트 훅 ───────────────────────────────────────────
window.__prodDebug = {
  // 멀티 잡 조리 (e2e)
  cookAssemble: (ing) => cook.clickIngredient(ing),
  cookFillAssembly: () => cook.debugFillAssembly(), // 조립 5클릭 대체(대기 트레이 +1)
  cookWaiting: () => cook.waitingCount(),
  cookSlots: () => cook.slotViews(performance.now()),
  grillUnlock: () => ({ claimed: claimedGrillSlots, available: availableGrillSlots, pending: availableGrillSlots > claimedGrillSlots }),
  cookPlace: () => cook.placeToGrill(performance.now()),
  cookClickSlot: (i) => clickGrillSlot(i, performance.now()),
  cookElapse: (sec) => cook.debugElapse(sec),
  activeScreen: () => director.activeScreenId(),
  isTransitioning: () => director.isTransitioning(),
  controlsLocked: () => director.controlsLocked(),
  seatStates: () => customers.getStates(),
  seatViews: () => (ops ? ops.views(performance.now()) : []),
  seatCapacity: () => (ops ? ops.capacity() : null),
  seatBaseVisible: (id) => !!R.seatBaseMesh[id]?.visible,
  dockItems: () => dock.items(),
  dockSelectedId: () => dock.selectedId(),
  dockAdd: (item) => dock.add(item), // e2e: 조리 없이 선반 적재
  // 손님 운영 (e2e): 결정론적 입장·경과.
  opsReady: () => !!ops,
  opsAutoSpawn: (v) => ops && ops.setAutoSpawn(v),
  opsClear: () => ops && ops.clearAll(),
  forceSpawn: (seatId, typeId, thinkSec) => ops && ops.forceSpawn(seatId, typeId, performance.now(), thinkSec ?? 5),
  forceGroup: (a, b, typeId, thinkSec) => ops && ops.forceGroup(a, b, typeId, performance.now(), thinkSec ?? 5),
  opsReserve: (typeId, size, dueSec, thinkSec) => ops && ops.addReservation({ typeId, size, dueMs: performance.now() + (dueSec ?? 0) * 1000, thinkSec: thinkSec ?? 5 }),
  opsReservations: () => (ops ? ops.reservations() : []),
  staffList: () => staff.map((s) => ({ id: s.id, role: s.role, wageGold: s.wageGold })),
  staffOwned: () => [...wallet.staff],
  hireStaff: (id) => hireStaff(id),
  autoProduceOnce: () => autoProduceTick(performance.now(), true), // e2e: 간격 무시하고 1회 제조
  reorderOverride: (v) => ops && ops.setReorderOverride(v),
  opsElapse: (sec) => ops && ops.debugElapse(sec),
  acceptOrder: (seatId) => ops && ops.acceptOrder(seatId),
  opsRecords: () => (ops ? ops.records() : []),
  // production fetch 원본과 runtime 적용값을 함께 노출한다. E2E는 별도 수치 상수 대신 이 계약을 쓴다.
  contentContract: () => ({
    urls: { ...PRODUCTION_CONTENT_URLS },
    day: loadedDay ? {
      id: loadedDay.id,
      spawnIntervalSec: loadedDay.spawnIntervalSec,
      economy: { ...loadedDay.economy },
    } : null,
    applied: {
      spawnIntervalSec: ops ? ops.cfg.spawnIntervalMs / 1000 : null,
      economy: baseEconomy ? { ...baseEconomy } : null,
    },
    upgrades: upgrades.map((item) => ({
      id: item.id,
      costGold: item.costGold,
      reputationReq: item.reputationReq,
      effect: item.effect ? { ...item.effect } : null,
    })),
  }),
  wallet: () => ({ gold: wallet.gold, reputation: wallet.reputation, owned: [...wallet.owned] }),
  setWallet: (gold, reputation) => { wallet.gold = gold; wallet.reputation = reputation; },
  economyBasePrice: () => (currentEconomy() ? currentEconomy().basePrice : null),
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
  grillMaterial: (slot = 0) => grillMats[SLOT_KEYS[slot]] ?? null,
  grillContract: () => ({
    slots: D1_GRILL_SLOTS,
    finishedTray: D1_GRILL_FINISHED_TRAY,
  }),
  requestScreen: (id) => director.request(id, performance.now()),
  navLeft: () => director.left(performance.now()),
  navRight: () => director.right(performance.now()),
  screenPosOf: (key) => {
    const m = R.interactionMesh[key] ?? R.objectMesh[key];
    if (!m || !m.visible) return null;
    const v = m.position.clone().project(R.camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  },
  performanceStats: () => R.performanceStats(),
  renderer: R,
};
