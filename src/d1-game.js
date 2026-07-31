// D1 전체 영업 프로덕션 진입점. D1BusinessDayRuntime의 상태를 D1BusinessDayUiPort로만 소비해
// S0 종료→4주문 영업→마감 drain→숯불→정산 5단계→단일 저장 commit→D2 전환을 연결한다.
// 조리 모델은 영업 도메인과 독립이며 이 파일이 완성품·위험 공정 intent만 번역한다.

import * as THREE from 'three';
import { createProductionRenderer } from './render/productionRenderer.js';
import { createStationDirector } from './render/stationDirector.js';
import { createGrillMaterial } from './render/grillMaterial.js';
import { elapsedSecToUniform } from './render/grillRenderer.js';
import {
  COOK_SLOT_NEXT_ACTION,
  createD1CookStations,
} from './render/cookStations.js';
import { createDrinkPour, DRINK } from './render/drinkStation.js';
import { createPreparedDock } from './render/preparedDock.js';
import { createCustomerAdapter } from './render/customerAdapter.js';
import {
  SCREENS,
  SCREEN_IDS,
  SCREEN_BY_ID,
  INITIAL_SCREEN,
  SCREEN_TRANSITION_MS,
  OBJECTS,
  SEAT_IDS,
  GRILL_SLOT_KEYS,
  computeGrillSlots,
} from './config/screenLayout.js';
import { D1_GRILL_FINISHED_TRAY } from './config/d1GrillLayout.js';
import { createFirstOrderGuide } from './d1/firstOrderGuide.js';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY, clearFirstOrderRuntime } from './d1/firstOrderRuntimeStorage.js';
import { RECIPE } from './config/recipe.js';
import { runtimeAssetUrl } from './assets/runtimeAssetResolver.js';
import {
  D1_UI_INTENT,
  canServeD1MenuToSeat,
} from './application/businessDay/d1BusinessDayUiPort.js';
import {
  createD1BusinessDayBrowserSession,
} from './application/businessDay/d1BusinessDayBrowserSession.js';
import {
  D1_BUSINESS_DAY_RELEASE_DEFINITION_URL,
  loadD1BusinessDayReleaseDefinition,
} from './application/ports/d1BusinessDayDefinition.js';

const el = (id) => document.getElementById(id);
const guide = el('guide');
const guideToggle = el('guideToggle');
guideToggle.addEventListener('click', () => {
  const expanded = guide.dataset.expanded !== 'true';
  guide.dataset.expanded = String(expanded);
  guideToggle.setAttribute('aria-expanded', String(expanded));
  guideToggle.textContent = expanded ? '접기' : '전체 보기';
});
const canvas = el('scene');
const R = createProductionRenderer(canvas);
const director = createStationDirector({ screens: SCREEN_IDS, initial: INITIAL_SCREEN, transitionMs: SCREEN_TRANSITION_MS });

const resetFirstOrderRuntime = new URLSearchParams(window.location.search).get('reset') === '1';
if (resetFirstOrderRuntime) clearFirstOrderRuntime(window.localStorage);
function readFirstOrderRuntime() {
  try {
    const value = window.localStorage.getItem(FIRST_ORDER_RUNTIME_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : null;
    return parsed?.stateVersion === 1 ? parsed : null;
  } catch {
    return null;
  }
}
const restoredFirstOrderRuntime = readFirstOrderRuntime();
const cook = createD1CookStations();
if (restoredFirstOrderRuntime?.cook) cook.restore(restoredFirstOrderRuntime.cook, performance.now());
const SLOT_KEYS = GRILL_SLOT_KEYS.slice(0, cook.slotCount());
R.setGrillSlots(cook.slotCount());
let firstOrderGuide = createFirstOrderGuide(restoredFirstOrderRuntime?.guide);
let glassPlaced = restoredFirstOrderRuntime?.glassPlaced === true;
let guideFlipCount = Number(restoredFirstOrderRuntime?.guideFlipCount ?? 0);
let guideRetrieveCount = Number(restoredFirstOrderRuntime?.guideRetrieveCount ?? 0);
const guideFlippedSlots = new Set(restoredFirstOrderRuntime?.guideFlippedSlots ?? []);
const guideRetrievedSlots = new Set(restoredFirstOrderRuntime?.guideRetrievedSlots ?? []);
const grillMats = {};
const grillStatusLayer = el('grillStatusLayer');
const customerServePanel = el('customerServePanel');
const customerServeTargets = el('customerServeTargets');
const selectedPreparedItem = el('selectedPreparedItem');
const serveQuantity = el('serveQuantity');
const serveQuantitySummary = el('serveQuantitySummary');
let pendingServeSeatId = null;
const GRILL_FLIP_AXIS = new THREE.Vector3(0, 1, 0);
const grillFlipQuaternion = new THREE.Quaternion();
const lockUntil = {};
const dock = createPreparedDock({ container: el('dockShelf') });
if (restoredFirstOrderRuntime?.dock) dock.restore(restoredFirstOrderRuntime.dock);
const pour = createDrinkPour();
const LEVER_ZONE = { drinkLeverLower: 'beer', drinkLeverUpper: 'foam' };
const customers = createCustomerAdapter({ renderer: R, container: el('bubbleLayer') });

function persistFirstOrderRuntime() {
  try {
    window.localStorage.setItem(FIRST_ORDER_RUNTIME_STORAGE_KEY, JSON.stringify({
      stateVersion: 1,
      guide: firstOrderGuide.snapshot(),
      cook: cook.snapshot(performance.now()),
      dock: dock.snapshot(),
      glassPlaced,
      guideFlipCount,
      guideRetrieveCount,
      guideFlippedSlots: [...guideFlippedSlots],
      guideRetrievedSlots: [...guideRetrievedSlots],
    }));
  } catch {
    // 저장 공간 실패는 campaign 저장을 덮어쓰지 않으며 현재 세션 진행은 유지한다.
  }
}

function reportGuideInvalid(reason) {
  const result = firstOrderGuide.invalid(reason);
  persistFirstOrderRuntime();
  return result;
}

// 각 조작 대상이 속한 화면 + 레이캐스트로 클릭 가능한 키(이미지 레이어는 제외).
const SCREEN_OF = {};
for (const s of SCREENS) {
  for (const k of s.objects) {
    if (OBJECTS[k].kind !== 'fullframe' && OBJECTS[k].kind !== 'image') SCREEN_OF[k] = s.id;
  }
}
const SEAT_KEYS = SEAT_IDS.map((seatId) => `seatServe:${seatId}`);
const CLICKABLE = new Set([
  ...SEAT_KEYS,
  'binChicken',
  'binLeek',
  'jigSkewer',
  'grillWaitTray',
  ...SLOT_KEYS,
  'grillFinishedTray',
  'glassRack',
  'drinkLeverUpper',
  'drinkLeverLower',
]);

// ── D1BusinessDayUiPort 화면 소비 상태 ───────────────────────
const ORDER_ICON = { '생맥주': '/assets/core/ui/order-icon-draft-beer-r1-b1.png', '네기마': '/assets/core/ui/order-icon-negima-r1-b1.png' };
const PHASE_LABEL = {
  open: '영업 중',
  'closing-drain': '마감 정리',
  'charcoal-down': '숯불',
  settlement: '정산',
  complete: 'D2 준비',
};
const SETTLEMENT_LABEL = {
  'customers-orders': '1. 방문 손님과 완료 주문',
  'quality-wait': '2. 조리 품질과 대기',
  'revenue-tip': '3. 매출과 팁',
  'reputation-review': '4. 명성과 리뷰',
  'recipe-goal': '5. 레시피와 다음 목표',
};
const EXTRA_ASSET = {
  office: 'CH-EXTRA-COMMUTER-SERVICE',
  solo: 'CH-EXTRA-SOLO-SERVICE',
};
let businessSession = null;
let businessPort = null;
let businessBootError = null;
let businessIntentSequence = 0;
let cleanupSeatId = null;
let reportedRiskCount = 0;
let businessRenderDue = true;
let lastBusinessFrameAt = null;
let finalizing = false;

const nextIntentId = (type) => `d1-screen:${type}:${++businessIntentSequence}`;
const businessView = () => businessPort?.getViewModel() ?? null;

function dispatchBusiness(type, fields = {}, intentId = nextIntentId(type)) {
  if (!businessPort) return { ok: false };
  const result = businessPort.dispatch({ intentId, type, ...fields });
  businessRenderDue = true;
  if (!result.ok) showHint(result.error.message);
  return result;
}

function seatView(seatId) {
  return businessView()?.seats.find((seat) => seat.seatId === seatId) ?? null;
}

function seatCanReceiveSelected(seat, selected = dock.selected()) {
  return Boolean(selected && canServeD1MenuToSeat(seat, selected.menu));
}

function openServeQuantity(seatId) {
  const selected = dock.selected();
  if (!selected) {
    firstOrderGuide.invalid('완성품 카드가 선택되지 않았습니다.');
    showHint('선반에서 낼 완성품을 고르세요');
    return;
  }
  const seat = seatView(seatId);
  if (!seatCanReceiveSelected(seat, selected)) {
    firstOrderGuide.invalid('선택한 완성품과 손님의 남은 주문이 다릅니다.');
    showHint(`선택한 ${selected.menu} 주문이 남은 손님을 고르세요`);
    return;
  }
  pendingServeSeatId = seatId;
  firstOrderGuide.selectedCustomer(selected.menu === '생맥주' ? 'beer' : 'negima');
  persistFirstOrderRuntime();
  serveQuantitySummary.textContent = `${selected.menu} → ${seat.customerId === 'REGULAR_TSUKIOKA' ? '츠키오카' : seatId}`;
  serveQuantity.hidden = false;
  serveQuantity.querySelector('[data-act="serve-one"]').focus();
}

function closeServeQuantity() {
  pendingServeSeatId = null;
  serveQuantity.hidden = true;
}

function confirmServe(all) {
  const selected = dock.selected();
  const seat = pendingServeSeatId ? seatView(pendingServeSeatId) : null;
  if (!selected || !seatCanReceiveSelected(seat, selected)) {
    closeServeQuantity();
    firstOrderGuide.invalid('제공 대상 또는 완성품이 더 이상 유효하지 않습니다.');
    render();
    return;
  }
  const menuId = selected.menu === '생맥주' ? 'beer' : 'negima';
  const remaining = seat.remainingItems.find((item) => item.menuId === menuId)?.remaining ?? 0;
  const available = dock.items().filter((item) => item.menu === selected.menu).length;
  const count = all ? Math.min(remaining, available) : Math.min(1, remaining, available);
  let applied = 0;
  let lastResult = null;
  for (let index = 0; index < count; index += 1) {
    const item = dock.items().find((candidate) => candidate.menu === selected.menu);
    if (!item) break;
    lastResult = dispatchBusiness(D1_UI_INTENT.SERVE_ITEM, {
      seatId: pendingServeSeatId,
      menu: item.menu,
      quality: item.label,
    });
    if (!lastResult.ok || !lastResult.applied) break;
    dock.consumeMenu(item.menu, 1);
    applied += 1;
  }
  if (applied > 0) firstOrderGuide.served(menuId, applied);
  persistFirstOrderRuntime();
  closeServeQuantity();
  showHint(lastResult?.completedOrder ? '최종 제공 완료 · 총 3항목' : `부분 제공 · ${applied}개 전달`);
  render();
}

function activateSeat(seatId) {
  const seat = seatView(seatId);
  if (!seat) return;
  if (seat.canOrder) {
    const result = dispatchBusiness(D1_UI_INTENT.ACCEPT_ORDER, { seatId });
    if (result.ok) {
      if (seat.customerId === 'REGULAR_TSUKIOKA') firstOrderGuide.complete('order.accept');
      persistFirstOrderRuntime();
      showHint(`${seat.customerId === 'REGULAR_TSUKIOKA' ? '츠키오카' : '엑스트라'} 주문 접수`);
    }
  } else if (seat.canServe) {
    openServeQuantity(seatId);
  } else if (seat.cleanupNeeded) {
    showHint('좌석을 3초 동안 눌러 정리하세요');
  }
}

serveQuantity.querySelector('[data-act="serve-one"]').addEventListener('click', () => confirmServe(false));
serveQuantity.querySelector('[data-act="serve-all"]').addEventListener('click', () => confirmServe(true));
serveQuantity.querySelector('[data-act="serve-cancel"]').addEventListener('click', () => { closeServeQuantity(); render(); });

const FACE_COPY = Object.freeze({
  front: Object.freeze({ label: '앞면', symbol: '○', className: 'front' }),
  back: Object.freeze({ label: '뒷면', symbol: '◆', className: 'back' }),
});
const grillStatusEls = SLOT_KEYS.map((_, index) => {
  const card = document.createElement('article');
  card.className = 'grill-slot-status';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.dataset.testid = `grill-status-${index}`;
  card.hidden = true;
  card.innerHTML = `
    <div class="grill-face">
      <span class="grill-face-icon front" aria-hidden="true"><span>○</span></span>
      <span class="grill-face-text"></span>
    </div>
    <div class="grill-times">
      <span class="grill-front-time"></span>
      <span class="grill-back-time"></span>
    </div>
    <p class="grill-preserved"></p>
    <p class="grill-action"></p>`;
  grillStatusLayer.appendChild(card);
  card.addEventListener('click', () => clickGrillSlot(index, performance.now()));
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    clickGrillSlot(index, performance.now());
  });
  return {
    card,
    icon: card.querySelector('.grill-face-icon'),
    iconGlyph: card.querySelector('.grill-face-icon > span'),
    face: card.querySelector('.grill-face-text'),
    front: card.querySelector('.grill-front-time'),
    back: card.querySelector('.grill-back-time'),
    preserved: card.querySelector('.grill-preserved'),
    action: card.querySelector('.grill-action'),
  };
});

function elapsedLabel(value) {
  return Number(value ?? 0).toFixed(1);
}

const GRILL_NEXT_ACTION_COPY = Object.freeze({
  [COOK_SLOT_NEXT_ACTION.NONE]: '현재 행동 · 대기',
  [COOK_SLOT_NEXT_ACTION.WAIT]: '현재 행동 · 회전/입력 잠금 대기',
  [COOK_SLOT_NEXT_ACTION.FLIP]: '현재 행동 · 뒤집기',
  [COOK_SLOT_NEXT_ACTION.RETRIEVE]: '현재 행동 · 회수',
});

function grillNextActionCopy(slot) {
  return GRILL_NEXT_ACTION_COPY[slot.nextAction]
    ?? GRILL_NEXT_ACTION_COPY[COOK_SLOT_NEXT_ACTION.WAIT];
}

function grillStatusCopy(slot) {
  const front = elapsedLabel(slot.frontElapsedSec);
  const back = elapsedLabel(slot.backElapsedSec);
  if (slot.status === 'staged') {
    return {
      face: '접촉면 없음',
      icon: { symbol: 'Ⅱ', className: 'airborne' },
      preserved: '앞면 0.0초 · 뒷면 0.0초 보존',
      action: grillNextActionCopy(slot),
    };
  }
  if (slot.flipping) {
    return {
      face: '공중 회전',
      icon: { symbol: '↻', className: 'airborne' },
      preserved: `앞면 ${front}초 · 뒷면 ${back}초 · 양면 정지`,
      action: grillNextActionCopy(slot),
    };
  }
  const contact = FACE_COPY[slot.contactFace] ?? {
    label: '접촉면 없음',
    symbol: 'Ⅱ',
    className: 'airborne',
  };
  const preservedFace = slot.contactFace === 'back' ? '앞면' : '뒷면';
  const preservedElapsed = slot.contactFace === 'back' ? front : back;
  const cookingFace = slot.contactFace === 'back' ? '뒷면' : '앞면';
  return {
    face: `현재 접촉면 · ${contact.label}`,
    icon: contact,
    preserved: `${preservedFace} ${preservedElapsed}초 보존 · ${cookingFace} 조리 중`,
    action: grillNextActionCopy(slot),
  };
}

function updateGrillStatus(now) {
  const onGrill = director.activeScreenId() === 'SCR-SVC-GRILL';
  grillStatusLayer.hidden = !onGrill;
  if (!onGrill) return;
  const views = cook.slotViews(now);
  const currentStepId = firstOrderGuide.view().currentStepId ?? '';
  const wantedAction = currentStepId.startsWith('grill.flip')
    ? COOK_SLOT_NEXT_ACTION.FLIP
    : currentStepId.startsWith('grill.retrieve')
      ? COOK_SLOT_NEXT_ACTION.RETRIEVE
      : null;
  const excluded = wantedAction === COOK_SLOT_NEXT_ACTION.FLIP ? guideFlippedSlots : guideRetrievedSlots;
  const priorityIndex = views
    .filter((slot) => slot.nextAction === wantedAction && !excluded.has(slot.index))
    .sort((a, b) => {
      const aReadyAt = Number.isFinite(a.actionReadyAtMs) ? a.actionReadyAtMs : Number.MAX_SAFE_INTEGER;
      const bReadyAt = Number.isFinite(b.actionReadyAtMs) ? b.actionReadyAtMs : Number.MAX_SAFE_INTEGER;
      return (aReadyAt - bReadyAt) || (a.index - b.index);
    })[0]?.index ?? -1;
  views.forEach((slot, index) => {
    const ui = grillStatusEls[index];
    const active = slot.status !== 'empty';
    ui.card.hidden = !active;
    if (!active) return;
    const copy = grillStatusCopy(slot);
    ui.card.dataset.contactFace = slot.contactFace ?? 'none';
    ui.card.dataset.flipping = String(slot.flipping);
    ui.card.dataset.nextAction = slot.nextAction;
    ui.card.dataset.guideTarget = String(index === priorityIndex);
    ui.card.dataset.frontElapsedSec = elapsedLabel(slot.frontElapsedSec);
    ui.card.dataset.backElapsedSec = elapsedLabel(slot.backElapsedSec);
    ui.icon.className = `grill-face-icon ${copy.icon.className}`;
    ui.iconGlyph.textContent = copy.icon.symbol;
    ui.face.textContent = copy.face;
    ui.front.textContent = `앞면 ${elapsedLabel(slot.frontElapsedSec)}초`;
    ui.back.textContent = `뒷면 ${elapsedLabel(slot.backElapsedSec)}초`;
    ui.preserved.textContent = copy.preserved;
    ui.action.textContent = copy.action;
    ui.card.setAttribute(
      'aria-label',
      `${index + 1}번 꼬치. ${copy.face}. ${ui.front.textContent}. ${ui.back.textContent}. ${copy.preserved}. ${copy.action}.`,
    );
  });
}

const serveTargetButtons = new Map(SEAT_IDS.map((seatId, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'customer-serve-target';
  button.dataset.testid = `serve-target-${seatId}`;
  button.dataset.seatId = seatId;
  button.addEventListener('click', () => {
    activateSeat(seatId);
    render();
  });
  customerServeTargets.appendChild(button);
  return [seatId, { button, index }];
}));

function renderPreparedSelection() {
  const selected = dock.selected();
  selectedPreparedItem.textContent = selected
    ? `선택 완성품 · ${selected.menu} · ${selected.label}`
    : '완성품을 먼저 선택하세요';
  for (const card of el('dockShelf').querySelectorAll('.dock-card')) {
    const selectedCard = card.dataset.testid === `dock-item-${dock.selectedId()}`;
    card.setAttribute('aria-pressed', String(selectedCard));
    const menu = card.querySelector('.dock-menu')?.textContent ?? '완성품';
    const quality = card.querySelector('.dock-quality')?.textContent ?? '';
    card.setAttribute('aria-label', `${menu} ${quality} 완성품${selectedCard ? ' · 선택됨' : ''}`);
  }
}

function renderServeTargets() {
  const onCustomers = director.activeScreenId() === 'SCR-SVC-CUSTOMERS';
  const view = businessView();
  customerServePanel.hidden = !onCustomers || !view?.ready;
  if (customerServePanel.hidden) return;
  renderPreparedSelection();
  const selected = dock.selected();
  for (const seatId of SEAT_IDS) {
    const seat = view.seats.find((item) => item.seatId === seatId);
    const { button, index } = serveTargetButtons.get(seatId);
    const eligible = seatCanReceiveSelected(seat, selected);
    const cleanupNeeded = Boolean(seat?.cleanupNeeded);
    const canActivate = Boolean(seat?.canOrder || eligible || cleanupNeeded);
    const seatLabel = `${index + 1}번 좌석`;
    const customerLabel = seat?.customerId === 'REGULAR_TSUKIOKA'
      ? '츠키오카'
      : seat?.occupied ? '이름 없는 손님' : '빈 자리';
    const remaining = seat?.remainingOrderLabel || '남은 주문 없음';
    button.disabled = !canActivate;
    button.dataset.eligible = String(eligible);
    button.dataset.cleanup = String(cleanupNeeded);
    button.dataset.remainingMenuIds = (seat?.remainingItems ?? [])
      .map((item) => item.menuId)
      .join(',');
    button.innerHTML = cleanupNeeded
      ? `<strong>${seatLabel} · 정리 필요</strong><span>3초 동안 눌러 정리</span>`
      : `<strong>${seatLabel} · ${customerLabel}</strong><span>${remaining}</span>`;
    button.setAttribute(
      'aria-label',
      cleanupNeeded
        ? `${seatLabel}. 정리 필요. 3초 동안 눌러 정리하세요.`
        : `${seatLabel} ${customerLabel}. ${remaining}.${seat?.canOrder ? ' 주문 접수 가능.' : ''}${eligible ? ` 선택한 ${selected.menu} 제공 가능.` : ''}`,
    );
  }
}

const dockObserver = new MutationObserver(() => {
  renderPreparedSelection();
  renderServeTargets();
  syncCustomers();
});
dockObserver.observe(el('dockShelf'), { childList: true, subtree: true });
el('dockShelf').addEventListener('click', (event) => {
  const card = event.target.closest('.dock-card');
  if (!card) return;
  const selected = dock.selected();
  if (!selected) return;
  firstOrderGuide.selectedCard(selected.menu === '생맥주' ? 'beer' : 'negima');
  persistFirstOrderRuntime();
  render();
});

function syncRiskCount(now = performance.now()) {
  if (!businessPort) return;
  // 뒤집기 공중·그릴 밖에서는 접촉면 시간은 멈추지만, 제작물이 그릴 공정에 남아 있는 동안은
  // 마감 숯불을 낮출 수 없도록 위험 공정 1건을 유지한다.
  const riskCount = cook.slotViews(now).some((slot) => slot.status !== 'empty') ? 1 : 0;
  if (riskCount === reportedRiskCount) return;
  const result = dispatchBusiness(D1_UI_INTENT.SET_RISK_COUNT, { count: riskCount });
  if (result.ok) reportedRiskCount = riskCount;
}

// ── 더미 오브젝트 이름표 ──────────────────────────────────────
const OBJECT_LABELS = {
  workbench: '조립대', binChicken: '닭', binLeek: '파', jigSkewer: '완성 꼬치',
  grillBody: '숯불 그릴', grillWaitTray: '대기', grillFinishedTray: '완료 트레이 (개발)',
  drinkTower: '맥주 타워', glassRack: '잔 랙',
  drinkLeverUpper: '레버·거품', drinkLeverLower: '레버·맥주',
};
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
  if (q) {
    dock.add({ menu: '생맥주', label: q, good: q === 'Perfect' || q === 'Good' });
    firstOrderGuide.complete('beer.pour');
    firstOrderGuide.complete('beer.finish');
    firstOrderGuide.preparedItem('beer', performance.now());
    glassPlaced = false;
    persistFirstOrderRuntime();
    showHint('생맥주를 선반에 올렸어요');
  }
  pour.reset();
  render();
}
function serveOverflowLow() {
  const q = pour.serveOverflow();
  if (q) {
    dock.add({ menu: '생맥주', label: q, good: false });
    firstOrderGuide.complete('beer.pour');
    firstOrderGuide.complete('beer.finish');
    firstOrderGuide.preparedItem('beer', performance.now());
    glassPlaced = false;
    persistFirstOrderRuntime();
  }
  pour.reset();
  render();
}
function discardDrink() { pour.discard(); pour.reset(); glassPlaced = false; persistFirstOrderRuntime(); showHint('잔을 폐기했어요'); render(); }
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
  return true;
}

const defaultSeatMaps = Object.fromEntries(
  SEAT_IDS.map((seatId) => [seatId, R.seatActorMesh[seatId]?.material.map ?? null]),
);

function extraKind(customerId) {
  if (customerId?.startsWith('D1-OFFICE')) return 'office';
  if (customerId?.startsWith('D1-SOLO')) return 'solo';
  return null;
}

function syncCustomers() {
  const view = businessView();
  const seats = view?.seats ?? [];
  const onCustomers = director.activeScreenId() === 'SCR-SVC-CUSTOMERS';
  for (const seatId of SEAT_IDS) {
    const seat = seats.find((item) => item.seatId === seatId);
    const target = R.objectMesh[`seatServe:${seatId}`];
    if (target) {
      target.visible = onCustomers && !!seat
        && (seat.canOrder || seatCanReceiveSelected(seat) || seat.cleanupNeeded);
    }
    const actor = R.seatActorMesh[seatId];
    const kind = extraKind(seat?.customerId);
    if (actor) {
      actor.material.map = kind ? null : defaultSeatMaps[seatId];
      actor.material.needsUpdate = true;
    }
    const bubble = document.querySelector(`[data-testid="bubble-${seatId}"]`);
    if (bubble) {
      bubble.dataset.serveEligible = String(seatCanReceiveSelected(seat));
      if (kind) {
        bubble.dataset.placeholder = 'development';
        bubble.dataset.componentId = kind === 'office'
          ? 'customers.actor.commuter'
          : 'customers.actor.solo';
        bubble.dataset.requiredAssetId = EXTRA_ASSET[kind];
      } else {
        delete bubble.dataset.placeholder;
        delete bubble.dataset.componentId;
        delete bubble.dataset.requiredAssetId;
      }
    }
  }
  customers.apply(seats, { actorsVisible: onCustomers });
}

function render() {
  const now = performance.now();
  for (const key of Object.keys(SCREEN_OF)) {
    R.setObjectVisible(key, shouldShow(key));
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

  el('svcStation').textContent = SCREEN_BY_ID[director.activeScreenId()].name;
  renderReceipts();
  renderOrderHud();
  renderBusiness();
  syncCustomers();
  renderServeTargets();
  for (const btn of document.querySelectorAll('.quick-nav button')) btn.classList.toggle('active', btn.dataset.screen === director.activeScreenId());
  el('navLeft').disabled = !director.canLeft();
  el('navRight').disabled = !director.canRight();
  businessRenderDue = false;
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
  const orders = businessView()?.orders ?? [];
  hud.innerHTML = orders
    .filter((order) => !['completed', 'failed', 'abandoned'].includes(order.status))
    .flatMap((order) => order.lines.map((line) => {
      const menu = line.menuLabel;
      return `<span class="oi ${line.remaining === 0 ? 'done' : ''}" data-testid="order-${order.orderId}-${line.menuId}">`
        + `<img src="${ORDER_ICON[menu]}" alt="">${menu} ${line.served}/${line.quantity}</span>`;
    }))
    .join('');
}

function guideText(view) {
  if (businessBootError) return `D1 시작 실패 · ${businessBootError.message ?? businessBootError.code}`;
  if (!view) return 'S0 저장을 확인하고 D1 영업을 준비하는 중입니다.';
  if (view.phase === 'closing-drain') {
    const risk = view.limits.riskProcessCount;
    return `02:30 마감. 남은 주문 ${view.closing.unfinishedOrderCount}건·좌석 정리 ${view.closing.cleanupSeatCount}건${risk ? `·그릴 위험 공정 ${risk}건` : ''}을 끝내세요.`;
  }
  if (view.phase === 'charcoal-down') return '모든 주문을 drain했습니다. 남은 숯불을 낮추세요.';
  if (view.phase === 'settlement') return '영업 결과를 다섯 단계로 확인한 뒤 한 번만 저장합니다.';
  if (view.phase === 'complete') return 'D1 완료 저장 성공 · D2 영업 전 상태로 전환했습니다.';
  const cleanup = view.seats.find((seat) => seat.cleanupNeeded);
  if (cleanup) return `${cleanup.seatId} 좌석을 3초 동안 눌러 정리하세요.`;
  const ordering = view.seats.find((seat) => seat.canOrder);
  if (ordering) return `${ordering.customerId === 'REGULAR_TSUKIOKA' ? '츠키오카' : '엑스트라'} 좌석을 눌러 주문을 받으세요.`;
  const waiting = view.seats.find((seat) => seat.canServe);
  const selected = dock.selected();
  if (waiting && selected) {
    const eligibleCount = view.seats.filter((seat) => seatCanReceiveSelected(seat, selected)).length;
    return `선택한 ${selected.menu} · 제공 가능한 손님 ${eligibleCount}명을 직접 고르세요.`;
  }
  if (waiting) return '선반에서 완성품을 고른 뒤 일치하는 남은 주문이 있는 손님을 선택하세요.';
  const remainingSec = Math.max(0, Math.ceil((view.clock.targetMs - view.clock.elapsedMs) / 1000));
  const remaining = `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, '0')}`;
  return `02:30 자동 마감까지 ${remaining} · 다음 손님을 기다리며 조립·그릴·드링크를 준비할 수 있습니다.`;
}

function renderFirstOrderGuide() {
  const model = firstOrderGuide.view();
  const current = model.steps.find((step) => step.status === 'current');
  el('guideCurrent').textContent = current ? `현재 · ${current.label}` : '완료';
  el('guideNextAction').textContent = model.complete
    ? guideText(businessView())
    : model.feedback ?? model.nextAction;
  el('guideSteps').replaceChildren(...model.steps.map((step) => {
    const row = document.createElement('li');
    row.dataset.stepId = step.id;
    row.dataset.status = step.status;
    row.textContent = step.label;
    return row;
  }));

  for (const target of document.querySelectorAll('[data-guide-target="true"]')) {
    target.dataset.guideTarget = 'false';
  }
  if (!current) return;
  if (director.activeScreenId() !== current.targetScreenId) {
    const nav = document.querySelector(`.quick-nav button[data-screen="${current.targetScreenId}"]`);
    if (nav) nav.dataset.guideTarget = 'true';
    return;
  }
  if (current.targetControlId === 'serve-target-seat-01') {
    const seat = businessView()?.seats.find((item) => item.customerId === 'REGULAR_TSUKIOKA');
    const target = seat ? serveTargetButtons.get(seat.seatId)?.button : null;
    if (target) target.dataset.guideTarget = 'true';
  } else if (current.targetControlId === 'serve-quantity') {
    for (const button of serveQuantity.querySelectorAll('button:not([data-act="serve-cancel"])')) {
      button.dataset.guideTarget = 'true';
    }
  } else if (current.targetControlId.startsWith('dock-card-')) {
    const menu = current.targetControlId.endsWith('beer') ? '생맥주' : '네기마';
    const card = [...el('dockShelf').querySelectorAll('.dock-card')]
      .find((candidate) => candidate.querySelector('.dock-menu')?.textContent === menu);
    if (card) card.dataset.guideTarget = 'true';
  }
}

function renderBusiness() {
  const view = businessView();
  el('businessClock').textContent = view?.clock?.label ?? '--:--';
  el('businessPhase').textContent = PHASE_LABEL[view?.phase] ?? (businessBootError ? '오류' : '준비');
  renderFirstOrderGuide();

  const panel = el('postBusinessPanel');
  const action = el('postBusinessAction');
  const steps = el('settlementSteps');
  const showPost = view?.phase === 'charcoal-down' || view?.phase === 'settlement';
  panel.hidden = !showPost;
  steps.innerHTML = '';
  if (view?.phase === 'charcoal-down') {
    panel.dataset.componentId = 'closing.charcoal';
    panel.dataset.requiredAssetId = 'ST-CHARCOAL-CORE';
    el('postBusinessTitle').textContent = '마감 · 숯불 낮추기';
    el('postBusinessSummary').textContent = `남은 준비품 ${dock.count()}개는 폐기 수량으로 정산됩니다.`;
    action.textContent = '숯불 낮추기';
    action.disabled = !view.closing.canLowerCharcoal;
  } else if (view?.phase === 'settlement') {
    panel.dataset.componentId = 'settlement.ledger.economy';
    panel.dataset.requiredAssetId = 'UI-ECONOMY-ICONS';
    const summary = view.settlement.summary;
    el('postBusinessTitle').textContent = 'D1 정산 · 5단계';
    el('postBusinessSummary').textContent = summary
      ? `방문 ${summary.customers.visited} · 완료 주문 ${summary.orders.completed}\n매출 ${summary.economy.revenue} + 팁 ${summary.economy.tip} = ${summary.economy.total}`
      : '';
    const revealed = new Set(view.settlement.revealedSteps);
    for (const stepId of view.settlement.steps) {
      const row = document.createElement('li');
      row.dataset.testid = `settlement-step-${stepId}`;
      row.classList.toggle('revealed', revealed.has(stepId));
      row.textContent = revealed.has(stepId) ? `${SETTLEMENT_LABEL[stepId]} · 확인` : SETTLEMENT_LABEL[stepId];
      steps.appendChild(row);
    }
    action.textContent = view.settlement.ready
      ? (finalizing ? '저장 중…' : 'D1 보상 저장 · D2 전환')
      : `다음 결과 확인 (${view.settlement.revealedSteps.length + 1}/5)`;
    action.disabled = finalizing;
  }

  const completed = view?.phase === 'complete' || businessSession?.completed;
  el('resultOverlay').hidden = !completed;
  if (completed) {
    const campaign = businessSession?.bridge?.getState?.();
    el('resultMessage').textContent = `D1 완료 · 보상 ${campaign?.economy?.balance ?? 44} · 명성 ${campaign?.economy?.reputation ?? 12} · D2 저장 완료`;
  }
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
  const targets = [...CLICKABLE]
    .map((key) => R.interactionMesh[key] ?? R.objectMesh[key])
    .filter((mesh) => mesh?.visible);
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit ? hit.object.userData.objectKey : null;
}
canvas.addEventListener('pointerdown', (e) => {
  if (director.controlsLocked()) return;
  const key = hitTest(e);
  if (!key) return;
  const now = performance.now();
  if (LEVER_ZONE[key]) {
    if (!glassPlaced) {
      reportGuideInvalid('빈 잔을 먼저 놓아야 레버를 사용할 수 있습니다.');
      showHint('빈 잔을 먼저 놓으세요');
      render();
      return;
    }
    pour.press(LEVER_ZONE[key], now);
    return;
  }
  if (key.startsWith('seatServe:')) {
    const seatId = key.slice('seatServe:'.length);
    const seat = seatView(seatId);
    if (seat?.cleanupNeeded) {
      const result = dispatchBusiness(D1_UI_INTENT.BEGIN_CLEANUP, { seatId });
      if (result.ok) cleanupSeatId = seatId;
      render();
      return;
    }
  }
  if ((lockUntil[key] || 0) > now) return;
  lockUntil[key] = now + 200;
  handle(key, now);
});
function releasePointers() {
  pour.release(performance.now());
  const drink = pour.state();
  if (drink.beerSec > 0 && drink.foamSec > 0) {
    firstOrderGuide.complete('beer.pour');
    persistFirstOrderRuntime();
  }
  if (!cleanupSeatId) return;
  const seatId = cleanupSeatId;
  cleanupSeatId = null;
  if (seatView(seatId)?.cleanupNeeded) {
    dispatchBusiness(D1_UI_INTENT.CANCEL_CLEANUP, { seatId });
    showHint('좌석 정리를 멈췄어요');
    render();
  }
}
window.addEventListener('pointerup', releasePointers);
window.addEventListener('pointercancel', releasePointers);

function handle(key, now) {
  const si = slotIndexOf(key);
  if (si >= 0) { clickGrillSlot(si, now); return; }
  switch (key) {
    case 'glassRack':
      glassPlaced = true;
      firstOrderGuide.complete('beer.glass');
      persistFirstOrderRuntime();
      showHint('빈 잔을 노즐 아래에 놓았어요');
      break;
    case 'binChicken':
    case 'binLeek': {
      const r = cook.clickIngredient(key === 'binChicken' ? 'chicken' : 'leek');
      if (!r.ok) {
        reportGuideInvalid(r.reason === 'transfer-required' ? '완성 꼬치를 먼저 눌러 트레이로 옮기세요.' : '재료 순서가 다릅니다.');
        showHint(r.reason === 'transfer-required' ? '완성 꼬치를 먼저 옮기세요' : '순서가 달라요');
      } else if (r.completed) {
        const ordinal = cook.assemblyProgress().assembledCount;
        firstOrderGuide.complete(`negima.assemble.${ordinal}`);
        persistFirstOrderRuntime();
        showHint('꼬치 완성 · 완성 꼬치 자체를 눌러 트레이로 옮기세요');
      }
      break;
    }
    case 'jigSkewer': {
      const r = cook.transferAssembly();
      if (!r.ok) {
        reportGuideInvalid('재료 다섯 개를 먼저 올바른 순서로 조립하세요.');
        showHint('아직 완성된 꼬치가 없어요');
      } else {
        firstOrderGuide.complete(`negima.transfer.${r.transferredCount}`);
        persistFirstOrderRuntime();
        showHint(`완성 꼬치 ${r.transferredCount}/2 · 전달 트레이 이동 완료`);
      }
      break;
    }
    case 'grillWaitTray': {
      const r = cook.placeToGrill(now);
      if (!r.ok) {
        reportGuideInvalid(r.reason === 'no-waiting' ? '전달 트레이에 네기마가 없습니다.' : '빈 그릴 칸이 없습니다.');
        showHint(r.reason === 'no-waiting' ? '대기 중인 꼬치가 없어요' : '빈 그릴 칸이 없어요');
      } else if (r.staged) {
        firstOrderGuide.complete('grill.place.1');
        showHint(`첫 2개 동시 시작 · 꼬치 ${r.remainingForBatch}개를 더 올리세요`);
      } else if (r.batchStarted) {
        firstOrderGuide.complete('grill.place.2');
        showHint('2개 동시 조리 시작 · 각 꼬치에서 앞면 누적과 뒤집기를 확인하세요');
      }
      else showHint('앞면 조리 시작 · 꼬치를 눌러 뒤집을 수 있어요');
      persistFirstOrderRuntime();
      syncRiskCount(now);
      break;
    }
    case 'grillFinishedTray':
      showHint(dock.items().some((item) => item.menu === '네기마')
        ? '완료 트레이 · 완성품은 아래 선반에서 선택하세요'
        : '완료된 네기마가 아직 없어요');
      break;
    default:
      if (key.startsWith('seatServe:')) activateSeat(key.slice('seatServe:'.length));
      break;
  }
  render();
}

function clickGrillSlot(i, now) {
  const r = cook.clickSlot(i, now);
  if (r.retrieved) {
    dock.add({ menu: '네기마', label: r.quality.grade, good: r.quality.good });
    if (!guideRetrievedSlots.has(i)) {
      guideRetrievedSlots.add(i);
      guideRetrieveCount += 1;
      firstOrderGuide.complete(`grill.retrieve.${guideRetrieveCount}`);
    }
    firstOrderGuide.preparedItem('negima', now);
    persistFirstOrderRuntime();
    showHint('완성품을 선반에 올렸어요');
  }
  else if (r.flipped) {
    if (!guideFlippedSlots.has(i)) {
      guideFlippedSlots.add(i);
      guideFlipCount += 1;
      firstOrderGuide.complete(`grill.flip.${guideFlipCount}`);
    }
    persistFirstOrderRuntime();
    showHint('꼬치를 뒤집는 중 · 0.3초 동안 양면 시간이 멈춥니다');
  }
  else if (!r.ok && r.reason === 'not-ready') {
    const view = cook.slotViews(now)[i];
    const face = view.contactFace === 'front' ? '앞면' : '뒷면';
    showHint(`${face} ${view.faceElapsedSec.toFixed(1)}초 누적 · 반대 면 시간은 보존됩니다`);
  }
  syncRiskCount(now);
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
    const mesh = R.objectMesh[key];
    if (!mesh) continue;
    mesh.userData.grillBaseQuaternion ??= mesh.quaternion.clone();
    mesh.quaternion.copy(mesh.userData.grillBaseQuaternion).multiply(
      grillFlipQuaternion.setFromAxisAngle(GRILL_FLIP_AXIS, v?.visualRotationRad ?? 0),
    );
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

async function finalizeBusinessDay() {
  if (!businessPort || finalizing) return null;
  finalizing = true;
  render();
  const result = await businessPort.finalize();
  finalizing = false;
  if (!result.ok) {
    showHint(result.error.message);
  } else {
    showHint(result.duplicate ? '이미 저장된 D1 보상입니다.' : 'D1 저장 완료 · D2로 전환했습니다.');
  }
  render();
  return result;
}

async function handlePostBusinessAction() {
  const view = businessView();
  if (view?.phase === 'charcoal-down') {
    const result = dispatchBusiness(D1_UI_INTENT.LOWER_CHARCOAL, {
      disposedPreparedItems: dock.count(),
    });
    if (result.ok) {
      dock.clear();
      showHint('숯불을 낮췄습니다. 정산을 시작합니다.');
    }
    render();
    return;
  }
  if (view?.phase !== 'settlement') return;
  if (!view.settlement.ready) {
    dispatchBusiness(D1_UI_INTENT.REVEAL_SETTLEMENT_STEP);
    render();
    return;
  }
  await finalizeBusinessDay();
}
el('postBusinessAction').addEventListener('click', handlePostBusinessAction);

async function bootBusinessDay() {
  try {
    const consumed = await loadD1BusinessDayReleaseDefinition({
      url: D1_BUSINESS_DAY_RELEASE_DEFINITION_URL,
    });
    if (!consumed.ok) {
      businessBootError = consumed.error;
      businessRenderDue = true;
      render();
      return;
    }
    const resetDevelopment = new URLSearchParams(window.location.search).get('reset') === '1';
    businessSession = await createD1BusinessDayBrowserSession({
      definition: consumed.definition,
      browserStorage: window.localStorage,
      resetDevelopment,
    });
    if (resetDevelopment) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (!businessSession.ok) {
      businessBootError = businessSession.error;
    } else {
      businessPort = businessSession.port;
      reportedRiskCount = businessView()?.limits.riskProcessCount ?? 0;
      lastBusinessFrameAt = performance.now();
    }
  } catch (error) {
    businessBootError = error;
  }
  businessRenderDue = true;
  render();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persistFirstOrderRuntime();
  if (!businessPort) return;
  if (document.hidden) {
    dispatchBusiness(D1_UI_INTENT.PAUSE);
  } else {
    dispatchBusiness(D1_UI_INTENT.RESUME);
    lastBusinessFrameAt = performance.now();
  }
  render();
});

// ── 루프 ─────────────────────────────────────────────────────
let lastActive = director.activeScreenId();
let lastWaiting = -1;
let businessDeltaMs = 0;
function loop(now) {
  const discarded = cook.tickBurn(now);
  if (discarded.length) {
    showHint('양면이 탄 꼬치를 폐기했어요');
    syncRiskCount(now);
    render();
  }
  director.tick(now);
  const active = director.activeScreenId();
  if (active !== lastActive) { R.goToScreen(active, now, SCREEN_TRANSITION_MS); lastActive = active; render(); }
  if (cook.waitingCount() !== lastWaiting) { lastWaiting = cook.waitingCount(); render(); }
  if (businessPort && lastBusinessFrameAt !== null) {
    businessDeltaMs += Math.max(0, Math.min(1_000, now - lastBusinessFrameAt));
    if (businessDeltaMs >= 100) {
      businessPort.advance(businessDeltaMs);
      businessDeltaMs = 0;
      businessRenderDue = true;
    }
  }
  lastBusinessFrameAt = now;
  updateGrillVisual(now);
  updateGrillStatus(now);
  pour.tick(now);
  updateDrinkPanel(active);
  updateLabels();
  customers.tick(active);
  if (businessRenderDue) render();
  R.renderFrame(now);
  requestAnimationFrame(loop);
}
R.goToScreen(INITIAL_SCREEN, 0, 0);
render();
requestAnimationFrame(loop);
bootBusinessDay();

// ── 개발·테스트 훅 ───────────────────────────────────────────
R.texturesReady = R.texturesReady ?? (() => true);
R.textureErrors = R.textureErrors ?? (() => 0);
function legacyFirstOrder() {
  const order = businessView()?.orders.find((item) => item.orderId === 'D1-ORDER-001');
  return {
    생맥주: {
      need: order?.lines.find((line) => line.menuId === 'beer')?.quantity ?? 1,
      done: order?.lines.find((line) => line.menuId === 'beer')?.served ?? 0,
    },
    네기마: {
      need: order?.lines.find((line) => line.menuId === 'negima')?.quantity ?? 2,
      done: order?.lines.find((line) => line.menuId === 'negima')?.served ?? 0,
    },
  };
}
function legacyCustomerPhase() {
  const view = businessView();
  const order = view?.orders.find((item) => item.orderId === 'D1-ORDER-001');
  const seat = view?.seats.find((item) => item.customerId === 'REGULAR_TSUKIOKA');
  if (!order || order.status === 'unaccepted') return 'entering';
  if (order.status === 'completed' && !seat) return 'complete';
  if (order.status === 'completed') return 'reacting';
  return 'ordered';
}
window.__d1GameDebug = {
  activeScreen: () => director.activeScreenId(),
  isTransitioning: () => director.isTransitioning(),
  controlsLocked: () => director.controlsLocked(),
  requestScreen: (id) => director.request(id, performance.now()),
  businessReady: () => businessSession !== null || businessBootError !== null,
  businessSession: () => ({
    ok: businessSession?.ok ?? false,
    completed: businessSession?.completed ?? false,
    resumed: businessSession?.resumed ?? false,
    startedFromS0: businessSession?.startedFromS0 ?? false,
    error: businessBootError,
  }),
  businessView: () => businessView(),
  businessAdvance: (deltaMs) => {
    const result = businessPort?.advance(deltaMs) ?? { ok: false };
    businessRenderDue = true;
    render();
    return result;
  },
  businessAdvanceTo: (elapsedMs) => {
    const current = businessView()?.clock.elapsedMs ?? 0;
    const result = businessPort?.advance(Math.max(0, elapsedMs - current)) ?? { ok: false };
    businessRenderDue = true;
    render();
    return result;
  },
  businessDispatch: (intent) => {
    const result = businessPort?.dispatch(intent) ?? { ok: false };
    businessRenderDue = true;
    render();
    return result;
  },
  businessClickSeat: (seatId) => { activateSeat(seatId); render(); },
  businessBeginCleanup: (seatId) => {
    const result = dispatchBusiness(D1_UI_INTENT.BEGIN_CLEANUP, { seatId });
    if (result.ok) cleanupSeatId = seatId;
    render();
    return result;
  },
  businessPostAction: () => handlePostBusinessAction(),
  businessFinalize: () => businessPort?.finalize(),
  campaignState: () => businessSession?.bridge?.getState?.() ?? null,
  custPhase: () => legacyCustomerPhase(),
  order: () => legacyFirstOrder(),
  customerArt: () => legacyFirstOrder().생맥주.done > 0 ? 'partial-beer' : 'waiting',
  texturesReady: () => R.texturesReady(),
  dockItems: () => dock.items(),
  dockSelectedId: () => dock.selectedId(),
  dockAdd: (item) => dock.add(item),
  dockSelect: (id) => dock.select(id),
  cookFillAssembly: () => cook.debugFillAssembly(),
  cookAssemblyIndex: () => cook.assemblyIndex(),
  cookWaiting: () => cook.waitingCount(),
  cookSlots: () => cook.slotViews(performance.now()),
  grillStatusSnapshot: () => grillStatusEls.map(({ card }) => ({
    hidden: card.hidden,
    contactFace: card.dataset.contactFace,
    flipping: card.dataset.flipping,
    nextAction: card.dataset.nextAction,
    frontElapsedSec: card.dataset.frontElapsedSec,
    backElapsedSec: card.dataset.backElapsedSec,
    text: card.textContent.replace(/\s+/g, ' ').trim(),
    ariaLabel: card.getAttribute('aria-label'),
    rect: card.getBoundingClientRect().toJSON(),
  })),
  serveTargetSnapshot: () => [...serveTargetButtons.entries()].map(([seatId, { button }]) => ({
    seatId,
    disabled: button.disabled,
    eligible: button.dataset.eligible,
    remainingMenuIds: button.dataset.remainingMenuIds,
    text: button.textContent.replace(/\s+/g, ' ').trim(),
    ariaLabel: button.getAttribute('aria-label'),
  })),
  cookPlace: () => {
    const now = performance.now();
    const result = cook.placeToGrill(now);
    syncRiskCount(now);
    render();
    return result;
  },
  cookClickSlot: (i) => clickGrillSlot(i, performance.now()),
  cookElapse: (sec) => cook.debugElapse(sec),
  cookTransferAssembly: () => cook.transferAssembly(),
  firstOrderGuide: () => firstOrderGuide.view(),
  firstOrderGuideSnapshot: () => firstOrderGuide.snapshot(),
  grillContract: () => ({
    slots: computeGrillSlots(cook.slotCount()),
    finishedTray: D1_GRILL_FINISHED_TRAY,
  }),
  clickCustomer: () => {
    const seat = businessView()?.seats.find((item) => item.customerId === 'REGULAR_TSUKIOKA');
    if (seat) activateSeat(seat.seatId);
    render();
  },
  pourExact: (beerSec, foamSec) => { pour.reset(); pour.press('beer', 0); pour.release(beerSec * 1000); pour.press('foam', beerSec * 1000); pour.release((beerSec + foamSec) * 1000); return pour.state(); },
  drinkFinish: () => finishDrink(),
  screenPosOf: (key) => {
    const m = R.interactionMesh[key] ?? R.objectMesh[key];
    if (!m || !m.visible) return null;
    const v = m.position.clone().project(R.camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  },
  renderer: R,
};
