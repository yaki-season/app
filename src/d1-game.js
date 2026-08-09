// D1 전체 영업 프로덕션 진입점. D1BusinessDayRuntime의 상태를 D1BusinessDayUiPort로만 소비해
// S0 종료→4주문 영업→마감 drain→숯불→정산 5단계→단일 저장 commit→D2 전환을 연결한다.
// 조리 모델은 영업 도메인과 독립이며 이 파일이 완성품·위험 공정 intent만 번역한다.

import * as THREE from 'three';
import { createProductionRenderer } from './render/productionRenderer.js';
import { createStationDirector } from './render/stationDirector.js';
import { createD1RawNegimaCompositor } from './render/d1RawNegimaCompositor.js';
import {
  COOK_SLOT_NEXT_ACTION,
  createD1CookStations,
} from './render/cookStations.js';
import { createDrinkPour, DRINK } from './render/drinkStation.js';
import { drinkLeverZoneForDelta } from './render/drinkLeverDrag.js';
import { createBeerLiquidMaterial } from './render/beerLiquidMaterial.js';
import { createBeerCoreVfxMaterial } from './render/beerCoreVfxMaterial.js';
import { createGrillMaterial } from './render/grillMaterial.js';
import { elapsedSecToUniform } from './render/grillRenderer.js';
import { d1SecondFaceR3Params } from './render/d1SecondFaceR3.js';
import { createPreparedDock } from './render/preparedDock.js';
import { createD3GrillSession } from './domain/cooking/d3GrillSession.js';
import { createCustomerAdapter } from './render/customerAdapter.js';
import {
  isD1OfficeBeerFrame,
  resolveD1OfficeCustomerFrame,
} from './render/d1OfficeCustomerArt.js';
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
  COOKING_ART,
  DRINK_ART_STATE,
} from './config/screenLayout.js';
import {
  D1_GRILL_FOOD_FOOTPRINT,
  D1_GRILL_FINISHED_TRAY,
  D1_PUBLIC_GRILL_LAYOUT,
} from './config/d1GrillLayout.js';
import {
  D1_ASSEMBLY_BUILD_SLOT,
  D1_ASSEMBLY_TRAY_SLOTS,
} from './config/d1AssemblyLayout.js';
import { createFirstOrderGuide } from './d1/firstOrderGuide.js';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY, clearFirstOrderRuntime } from './d1/firstOrderRuntimeStorage.js';
import { RECIPE } from './config/recipe.js';
import {
  loadD1RuntimeAssets,
  reportD1RawNegimaExactLoadReadiness,
  resolveD1ReceivedEatingFrame,
} from './assets/runtimeAssetResolver.js';
import {
  D1_UI_INTENT,
  canServeD1MenuToSeat,
} from './application/businessDay/d1BusinessDayUiPort.js';
import {
  createD1BusinessDayBrowserSession,
} from './application/businessDay/d1BusinessDayBrowserSession.js';
import { D1_TSUKIOKA_DEPARTURE_SCENE } from './scenario/d1BusinessCutscenes.js';
import {
  D1_BUSINESS_DAY_RELEASE_DEFINITION_URL,
  loadD1BusinessDayReleaseDefinition,
} from './application/ports/d1BusinessDayDefinition.js';
import {
  D2_BUSINESS_DAY_DEFINITION_URL,
  loadD2BusinessDayDefinition,
} from './application/ports/d2BusinessDayDefinition.js';
import {
  D3_BUSINESS_DAY_DEFINITION_URL,
  loadD3BusinessDayDefinition,
} from './application/ports/d3BusinessDayDefinition.js';

// 정적 진입점의 module graph가 평가된 직후부터 동일 객체를 유지한다. manifest fetch와 영업 세션
// 복구가 끝나기 전에도 reload/E2E consumer는 readiness를 안전하게 읽을 수 있고, 준비되지 않은
// 기능 호출은 명시적으로 false를 반환한다. 아래 최종 debug API는 이 객체에 원자적으로 덧붙인다.
const d1GameDebug = {
  lifecycle: () => 'booting',
  businessReady: () => false,
  texturesReady: () => false,
};
window.__d1GameDebug = d1GameDebug;

const requestedDayId = new URLSearchParams(window.location.search).get('day');
const ACTIVE_DAY_ID = ['d2', 'd3'].includes(requestedDayId) ? requestedDayId : 'd1';
const DAY_GUIDE_POLICY = Object.freeze({
  d1: { title: '첫 주문 · 총 3항목', mode: 'sequential' },
  d2: { title: 'D2 · 복습 도움', mode: 'review', steps: ['주문을 직접 확인하세요', '조립·그릴·드링크를 병행하세요', '필요하면 전체 보기를 다시 여세요'] },
  d3: { title: 'D3 · 타레와 토치', mode: 'new-action', steps: ['타레 모모를 양면 조리하세요', '타레를 바른 뒤 토치를 좌우로 훑으세요', '게이지와 과열 경고를 확인하세요'] },
});
const MENU_ID_BY_LABEL = Object.freeze({ '생맥주': 'beer', '네기마': 'negima', '모모': 'momo' });
const menuIdForLabel = (label) => MENU_ID_BY_LABEL[label] ?? null;

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
const runtimeAssets = await loadD1RuntimeAssets();
document.getElementById('dockShelf')?.style.setProperty(
  '--dock-food-art',
  `url("${runtimeAssets.ORDER_NEGIMA.url}")`,
);
document.getElementById('dockShelf')?.style.setProperty(
  '--dock-drink-art',
  `url("${runtimeAssets.ORDER_DRAFT_BEER.url}")`,
);
document.body.dataset.assetPlaceholderCount = String(runtimeAssets.readiness.placeholderCount);
document.body.dataset.runtimeAssetsReady = String(runtimeAssets.readiness.ready);
document.body.dataset.runtimeContractValid = String(runtimeAssets.readiness.contractAudit.valid);
const R = createProductionRenderer(canvas, { runtimeAssets });
const director = createStationDirector({ screens: SCREEN_IDS, initial: INITIAL_SCREEN, transitionMs: SCREEN_TRANSITION_MS });

// 새로고침은 진행 중 영업일을 복구한다(PM 001·002 "새로고침 복구" 완료 기준, 공개 S0→D1 인계).
// 깨끗한 시작이 필요하면 ?reset=1로 명시한다.
const runtimeParams = new URLSearchParams(window.location.search);
const resetFirstOrderRuntime = runtimeParams.get('reset') === '1';
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
const d3Grill = createD3GrillSession(restoredFirstOrderRuntime?.d3Grill ?? null);
const SLOT_KEYS = GRILL_SLOT_KEYS.slice(0, cook.slotCount());
R.setGrillSlots(D1_PUBLIC_GRILL_LAYOUT);
let firstOrderGuide = createFirstOrderGuide(restoredFirstOrderRuntime?.guide);
let glassPlaced = restoredFirstOrderRuntime?.glassPlaced === true;
let guideFlipCount = Number(restoredFirstOrderRuntime?.guideFlipCount ?? 0);
let guideRetrieveCount = Number(restoredFirstOrderRuntime?.guideRetrieveCount ?? 0);
const guideFlippedSlots = new Set(restoredFirstOrderRuntime?.guideFlippedSlots ?? []);
const guideRetrievedSlots = new Set(restoredFirstOrderRuntime?.guideRetrievedSlots ?? []);
const grillMats = {};
const rawNegimaInstances = {};
const assemblyNegimaInstances = {
  build: null,
  tray: [],
};
let rawNegimaReadiness = runtimeAssets.readiness;
const rawNegimaRuntime = {
  status: runtimeAssets.GRILL_RAW_BUNDLE ? 'loading' : 'unavailable',
  diagnostics: null,
  grillRawTexture: null,
  error: null,
};
document.body.dataset.rawNegimaBindingStatus = rawNegimaRuntime.status;
document.body.dataset.assemblyArtBindingStatus = rawNegimaRuntime.status;

function publishRawNegimaReadiness(readiness) {
  rawNegimaReadiness = readiness;
  document.body.dataset.assetPlaceholderCount = String(readiness.placeholderCount);
  document.body.dataset.runtimeAssetsReady = String(readiness.ready);
  document.body.dataset.runtimeContractValid = String(readiness.contractAudit.valid);
}

async function bootRawNegimaRuntime() {
  if (!runtimeAssets.GRILL_RAW_BUNDLE) return;
  try {
    const compositor = await createD1RawNegimaCompositor({
      bundle: runtimeAssets.GRILL_RAW_BUNDLE,
    });
    for (const key of SLOT_KEYS) {
      const slotMesh = R.objectMesh[key];
      if (!slotMesh) throw new Error(`RAW 네기마 slot mesh 누락: ${key}`);
      const instance = compositor.createInstance(
        slotMesh,
        D1_GRILL_FOOD_FOOTPRINT.sourceModelTransform,
      );
      rawNegimaInstances[key] = instance;
      R.scene.add(instance.holder);
    }
    const buildMesh = R.objectMesh[D1_ASSEMBLY_BUILD_SLOT.key];
    if (!buildMesh) throw new Error('조립 지그 배치 mesh 누락');
    assemblyNegimaInstances.build = compositor.createAssemblyInstance(
      buildMesh,
      D1_ASSEMBLY_BUILD_SLOT.sourceModelTransform,
    );
    R.scene.add(assemblyNegimaInstances.build.holder);
    for (const [index, slot] of D1_ASSEMBLY_TRAY_SLOTS.entries()) {
      const trayMesh = R.objectMesh[slot.key];
      if (!trayMesh) throw new Error(`조립 트레이 배치 mesh 누락: ${slot.key}`);
      const instance = compositor.createTrayInstance(
        trayMesh,
        slot.sourceModelTransform,
        index,
      );
      assemblyNegimaInstances.tray.push(instance);
      R.scene.add(instance.holder);
    }
    rawNegimaRuntime.status = 'ready';
    rawNegimaRuntime.diagnostics = compositor.diagnostics;
    rawNegimaRuntime.grillRawTexture = compositor.grillRawTexture;
    for (const key of SLOT_KEYS) bindCookingMaterialToApprovedPlane(key);
    rawNegimaReadiness = reportD1RawNegimaExactLoadReadiness(runtimeAssets.manifest);
    publishRawNegimaReadiness(rawNegimaReadiness);
    document.body.dataset.rawNegimaBindingStatus = 'ready';
    document.body.dataset.assemblyArtBindingStatus = 'ready';
    render();
  } catch (error) {
    rawNegimaRuntime.status = 'failed';
    rawNegimaRuntime.error = error;
    rawNegimaRuntime.diagnostics = error.diagnostics ?? null;
    document.body.dataset.rawNegimaBindingStatus = 'failed';
    document.body.dataset.assemblyArtBindingStatus = 'failed';
    publishRawNegimaReadiness(runtimeAssets.readiness);
    console.error('승인 RAW 네기마 exact-load 실패:', error);
  }
}
void bootRawNegimaRuntime();
const grillStatusLayer = el('grillStatusLayer');
const grillInventory = el('grillInventory');
const grillWaitingNegima = el('grillWaitingNegima');
const grillWaitingNegimaHint = el('grillWaitingNegimaHint');
const grillWaitingNegimaCount = el('grillWaitingNegimaCount');
const grillFinishedInventoryCount = el('grillFinishedInventoryCount');
const grillFinishedQualityList = el('grillFinishedQualityList');
const customerServePanel = el('customerServePanel');
const customerServeTargets = el('customerServeTargets');
const selectedPreparedItem = el('selectedPreparedItem');
const serveQuantity = el('serveQuantity');
const serveQuantitySummary = el('serveQuantitySummary');
let pendingServeSeatId = null;
const GRILL_FLIP_AXIS = new THREE.Vector3(0, 1, 0);
const grillFlipQuaternion = new THREE.Quaternion();
const lockUntil = {};
function invokeLockedControl(key, now = performance.now()) {
  if (director.controlsLocked()) return false;
  if ((lockUntil[key] || 0) > now) return false;
  lockUntil[key] = now + 200;
  handle(key, now);
  // 동기 렌더가 오래 걸려도 같은 activation의 중복 intent가 잠금을 소진하지 않게 한다.
  lockUntil[key] = performance.now() + 200;
  return true;
}
grillWaitingNegima.addEventListener('click', () => invokeLockedControl('grillWaitTray'));
const dockShelf = el('dockShelf');
const dock = createPreparedDock({ container: dockShelf });
const momoPrep = el('momoPrep');
momoPrep.hidden = true;
momoPrep.addEventListener('click', () => {
  if (ACTIVE_DAY_ID === 'd3') {
    const id = 'D3-MOMO-TARE-ACTIVE';
    if (!d3Grill.job(id)) {
      d3Grill.stageCookedItem({ id, menuId: 'momo', seasoning: 'tare', bothFacesCooked: true });
    }
    persistFirstOrderRuntime();
    showHint('양면 조리 완료 · 타레와 토치 마감을 진행하세요');
    renderD3Torch();
    return;
  }
  dock.add({ menu: '모모', label: 'Perfect', good: true });
  showHint('모모 꼬치를 준비 목록에 올렸어요');
  render();
});
const D3_TORCH_JOB_ID = 'D3-MOMO-TARE-ACTIVE';
const d3TorchPanel = el('d3TorchPanel');
const d3TorchTrack = el('d3TorchTrack');
let d3TorchPointerActive = false;
let d3TorchLastAt = 0;
let d3KeyboardPosition = 0.5;

function renderD3Torch() {
  const job = d3Grill.job(D3_TORCH_JOB_ID);
  const d3FeatureOpen = businessSession?.ok === true
    && businessSession.completed !== true
    && businessView()?.dayId === 'D3';
  d3TorchPanel.hidden = !d3FeatureOpen || !job;
  if (!job) return;
  const finish = job.finish;
  const percent = Math.round(finish.torchCoverage * 100);
  const stateLabel = {
    none: finish.tareApplied ? '토치 대기' : '타레 대기',
    active: '토치 작동 중',
    under: '마감 부족 · Good',
    proper: '적정 마감 · Perfect + 불향',
    over: '과다 마감 · OK',
    failed: '집중 과열 · Fail',
  }[finish.torchState];
  d3TorchPanel.dataset.stateId = {
    none: finish.tareApplied ? 'D3-MOMO-TARE-APPLIED' : 'D3-MOMO-TARE-READY',
    active: 'D3-MOMO-TORCH-ACTIVE',
    under: 'D3-MOMO-TORCH-UNDER',
    proper: 'D3-MOMO-TORCH-PROPER',
    over: 'D3-MOMO-TORCH-OVER',
    failed: 'D3-MOMO-TORCH-FAILED',
  }[finish.torchState];
  el('d3TorchState').textContent = stateLabel;
  el('d3ApplyTare').disabled = finish.tareApplied || finish.torchState === 'active';
  d3TorchTrack.disabled = !finish.tareApplied || finish.torchCompleted;
  el('d3RetrieveMomo').disabled = !finish.torchCompleted;
  el('d3TorchFill').style.width = `${percent}%`;
  el('d3TorchCoverage').style.width = `${percent}%`;
  const meter = d3TorchPanel.querySelector('[role="progressbar"]');
  meter.setAttribute('aria-valuenow', String(percent));
  el('d3TorchWarning').textContent = finish.torchFocusMs >= 800 && !finish.torchCompleted
    ? '한 지점이 과열되고 있어요. 좌우로 이동하세요.'
    : finish.torchState === 'failed' ? '집중 과열로 품질이 Fail이 됐어요.' : '';
}

function ensureD3TorchActive() {
  const job = d3Grill.job(D3_TORCH_JOB_ID);
  if (!job || job.finish.torchCompleted) return false;
  if (job.finish.torchState !== 'active') {
    const started = d3Grill.beginTorch(D3_TORCH_JOB_ID);
    if (!started.ok) return false;
  }
  return true;
}

function sweepD3Torch(position, deltaMs) {
  if (!ensureD3TorchActive()) return;
  d3Grill.sweepTorch(D3_TORCH_JOB_ID, { position, deltaMs: Math.max(16, Math.min(250, deltaMs)) });
  persistFirstOrderRuntime();
  renderD3Torch();
}

function finishD3TorchInput() {
  const job = d3Grill.job(D3_TORCH_JOB_ID);
  if (job?.finish.torchState === 'active') d3Grill.finishTorch(D3_TORCH_JOB_ID);
  d3TorchPointerActive = false;
  persistFirstOrderRuntime();
  renderD3Torch();
}

el('d3ApplyTare').addEventListener('click', () => {
  const result = d3Grill.applyTare(D3_TORCH_JOB_ID);
  if (result.ok) showHint('타레 적용 완료 · 토치를 누른 채 좌우로 훑으세요');
  persistFirstOrderRuntime();
  renderD3Torch();
});
d3TorchTrack.addEventListener('pointerdown', (event) => {
  if (!ensureD3TorchActive()) return;
  d3TorchPointerActive = true;
  d3TorchLastAt = performance.now();
  d3TorchTrack.setPointerCapture?.(event.pointerId);
  sweepD3Torch((event.clientX - d3TorchTrack.getBoundingClientRect().left) / d3TorchTrack.clientWidth, 16);
});
d3TorchTrack.addEventListener('pointermove', (event) => {
  if (!d3TorchPointerActive) return;
  const now = performance.now();
  sweepD3Torch((event.clientX - d3TorchTrack.getBoundingClientRect().left) / d3TorchTrack.clientWidth, now - d3TorchLastAt);
  d3TorchLastAt = now;
});
d3TorchTrack.addEventListener('pointerup', finishD3TorchInput);
d3TorchTrack.addEventListener('pointercancel', finishD3TorchInput);
d3TorchTrack.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    ensureD3TorchActive();
    renderD3Torch();
  } else if (['ArrowLeft', 'ArrowRight'].includes(event.code) && d3Grill.job(D3_TORCH_JOB_ID)?.finish.torchState === 'active') {
    event.preventDefault();
    d3KeyboardPosition = Math.max(0.05, Math.min(0.95, d3KeyboardPosition + (event.code === 'ArrowLeft' ? -0.2 : 0.2)));
    sweepD3Torch(d3KeyboardPosition, 200);
  }
});
d3TorchTrack.addEventListener('keyup', (event) => {
  if (event.code === 'Space') finishD3TorchInput();
});
el('d3RetrieveMomo').addEventListener('click', () => {
  const result = d3Grill.retrieve(D3_TORCH_JOB_ID);
  if (!result.ok) return;
  dock.add({ menu: '모모', label: result.item.quality.grade, good: result.item.quality.good });
  persistFirstOrderRuntime();
  showHint(result.item.quality.smokyBonus ? '불향 모모 완성 · 준비 목록에 올렸어요' : '모모 완성품을 준비 목록에 올렸어요');
  render();
});
if (restoredFirstOrderRuntime?.dock) dock.restore(restoredFirstOrderRuntime.dock);
const pour = createDrinkPour();
let beerLiquid = null;
createBeerLiquidMaterial().then((controller) => {
  beerLiquid = controller;
  const mesh = R.objectMesh.drinkBeerLiquid;
  if (!mesh) return;
  mesh.material.dispose();
  mesh.material = controller.material;
  mesh.renderOrder = 20.5; // 액체는 승인된 유리잔(order 21) 뒤에 둔다.
}).catch((error) => console.error('맥주 액체 셰이더 로드 실패:', error));
let beerCoreVfx = null;
createBeerCoreVfxMaterial().then((controller) => {
  beerCoreVfx = controller;
  const mesh = R.objectMesh.drinkBeerVfx;
  if (!mesh) return;
  mesh.material.dispose();
  mesh.material = controller.material;
  mesh.renderOrder = 22;
}).catch((error) => console.error('맥주 코어 VFX 셰이더 로드 실패:', error));
let activeDrinkLeverDrag = null;
const customers = createCustomerAdapter({ renderer: R, container: el('bubbleLayer') });

function persistFirstOrderRuntime() {
  try {
    window.localStorage.setItem(FIRST_ORDER_RUNTIME_STORAGE_KEY, JSON.stringify({
      stateVersion: 1,
      guide: firstOrderGuide.snapshot(),
      cook: cook.snapshot(performance.now()),
      d3Grill: d3Grill.snapshot(),
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
  'drinkLeverDrag',
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
let departureCutsceneActive = false;
let departureCutsceneSeen = false;

const nextIntentId = (type) => `d1-screen:${type}:${++businessIntentSequence}`;
const businessView = () => businessPort?.getViewModel() ?? null;

function dispatchBusiness(type, fields = {}, intentId = nextIntentId(type)) {
  if (!businessPort) return { ok: false };
  const result = businessPort.dispatch({ intentId, type, ...fields });
  businessRenderDue = true;
  if (!result.ok) showHint(result.error.message);
  return result;
}

function tsukiokaSeatFrom(view) {
  return view?.seats.find((seat) => seat.customerId === 'REGULAR_TSUKIOKA') ?? null;
}

function openTsukiokaDepartureCutscene() {
  if (ACTIVE_DAY_ID !== 'd1' || departureCutsceneActive || departureCutsceneSeen) return false;
  departureCutsceneActive = true;
  departureCutsceneSeen = true;
  const [line] = D1_TSUKIOKA_DEPARTURE_SCENE.lines;
  el('departureCutsceneSpeaker').textContent = line.speakerName;
  el('departureCutsceneLine').textContent = line.text;
  el('departureCutscene').hidden = false;
  document.body.dataset.departureCutscene = 'true';
  director.request(D1_TSUKIOKA_DEPARTURE_SCENE.screenId, performance.now());
  dispatchBusiness(D1_UI_INTENT.PAUSE);
  businessDeltaMs = 0;
  render();
  el('departureCutsceneContinue').focus();
  return true;
}

function closeTsukiokaDepartureCutscene() {
  if (!departureCutsceneActive) return false;
  departureCutsceneActive = false;
  el('departureCutscene').hidden = true;
  delete document.body.dataset.departureCutscene;
  dispatchBusiness(D1_UI_INTENT.RESUME);
  lastBusinessFrameAt = performance.now();
  render();
  return true;
}

function advanceBusinessRuntime(deltaMs, { showDepartureCutscene = true } = {}) {
  const before = businessView();
  const beforeTsukioka = tsukiokaSeatFrom(before);
  const result = businessPort?.advance(deltaMs) ?? { ok: false };
  const afterTsukioka = tsukiokaSeatFrom(businessView());
  if (
    showDepartureCutscene
    && !departureCutsceneSeen
    && ['eating', 'done'].includes(beforeTsukioka?.phase)
    && afterTsukioka?.phase === 'leaving'
  ) {
    openTsukiokaDepartureCutscene();
  }
  businessRenderDue = true;
  return result;
}

el('departureCutsceneContinue').addEventListener('click', closeTsukiokaDepartureCutscene);

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
    showHint('요리 서빙대나 음료 픽업대에서 낼 완성품을 고르세요');
    return;
  }
  const seat = seatView(seatId);
  if (!seatCanReceiveSelected(seat, selected)) {
    firstOrderGuide.invalid('선택한 완성품과 손님의 남은 주문이 다릅니다.');
    showHint(`선택한 ${selected.menu} 주문이 남은 손님을 고르세요`);
    return;
  }
  pendingServeSeatId = seatId;
  firstOrderGuide.selectedCustomer(menuIdForLabel(selected.menu));
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
  const menuId = menuIdForLabel(selected.menu);
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

function beginCleanupHold(seatId) {
  if (director.controlsLocked() || cleanupSeatId) return false;
  const seat = seatView(seatId);
  if (!seat?.cleanupNeeded) return false;
  const result = dispatchBusiness(D1_UI_INTENT.BEGIN_CLEANUP, { seatId });
  if (!result.ok) return false;
  cleanupSeatId = seatId;
  render();
  return true;
}

serveQuantity.querySelector('[data-act="serve-one"]').addEventListener('click', () => confirmServe(false));
serveQuantity.querySelector('[data-act="serve-all"]').addEventListener('click', () => confirmServe(true));
serveQuantity.querySelector('[data-act="serve-cancel"]').addEventListener('click', () => { closeServeQuantity(); render(); });

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
    action: card.querySelector('.grill-action'),
  };
});

function elapsedLabel(value) {
  return Number(value ?? 0).toFixed(1);
}

function grillStatusCopy(slot) {
  if (slot.status === 'staged') {
    return {
      face: '저장 상태 복구 중',
      icon: { symbol: '·', className: 'airborne' },
      action: '앞면 조리를 다시 시작합니다',
    };
  }
  if (slot.flipping) {
    return {
      face: '뒤집는 중',
      icon: { symbol: '↻', className: 'airborne' },
      action: '꼬치가 돌아가는 중입니다',
    };
  }
  if (slot.nextAction === COOK_SLOT_NEXT_ACTION.RETRIEVE) {
    return {
      face: '양면 굽기 완료',
      icon: { symbol: '✓', className: 'back' },
      action: '다 익었어요 · 꼬치를 눌러 꺼내세요',
    };
  }

  const flipped = slot.contactFace === 'back';
  const face = flipped ? '뒤집은 면 굽는 중' : '첫 면 굽는 중';
  const icon = flipped
    ? { symbol: 'Ⅱ', className: 'back' }
    : { symbol: 'Ⅰ', className: 'front' };
  const action = slot.doneness === 'perfect'
    ? '노릇해졌어요 · 꼬치를 눌러 뒤집으세요'
    : slot.doneness === 'over'
      ? '많이 익었어요 · 지금 바로 뒤집으세요'
      : slot.doneness === 'burnt'
        ? '타기 시작했어요 · 바로 뒤집으세요'
        : '색이 노릇해질 때까지 지켜보세요';
  return { face, icon, action };
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
    ui.action.textContent = copy.action;
    ui.card.setAttribute('aria-label', `${index + 1}번 꼬치. ${copy.face}. ${copy.action}.`);
  });
}

const serveTargetButtons = new Map(SEAT_IDS.map((seatId, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'customer-serve-target';
  button.dataset.testid = `serve-target-${seatId}`;
  button.dataset.seatId = seatId;
  const syncFocusVisual = (focused) => {
    const bubble = document.querySelector(`[data-testid="bubble-${seatId}"]`);
    if (bubble) bubble.dataset.seatFocus = String(focused);
    const progress = document.querySelector(`[data-testid="cleanup-progress-${seatId}"]`);
    if (progress) progress.dataset.seatFocus = String(focused);
  };
  button.addEventListener('focus', () => syncFocusVisual(true));
  button.addEventListener('blur', () => syncFocusVisual(false));
  button.addEventListener('pointerdown', (event) => {
    if (!seatView(seatId)?.cleanupNeeded) return;
    if (beginCleanupHold(seatId)) {
      button.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
  });
  button.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || event.repeat || !seatView(seatId)?.cleanupNeeded) return;
    if (beginCleanupHold(seatId)) event.preventDefault();
  });
  button.addEventListener('keyup', (event) => {
    if (!['Enter', ' '].includes(event.key) || cleanupSeatId !== seatId) return;
    event.preventDefault();
    releaseCleanupHold();
  });
  button.addEventListener('click', (event) => {
    // 정리는 click이 아니라 hold로만 진행한다. pointerup 뒤 생성되는 click이
    // 다시 좌석 안내를 띄우지 않도록 여기서 소비한다.
    if (seatView(seatId)?.cleanupNeeded) {
      event.preventDefault();
      return;
    }
    activateSeat(seatId);
    render();
  });
  const cleanupProgress = document.createElement('div');
  cleanupProgress.className = 'customer-cleanup-progress';
  cleanupProgress.dataset.testid = `cleanup-progress-${seatId}`;
  cleanupProgress.dataset.active = 'false';
  cleanupProgress.hidden = true;
  cleanupProgress.setAttribute('role', 'progressbar');
  cleanupProgress.setAttribute('aria-label', `${index + 1}번 좌석 정리 진행`);
  cleanupProgress.setAttribute('aria-valuemin', '0');
  cleanupProgress.setAttribute('aria-valuemax', '100');
  cleanupProgress.setAttribute('aria-valuenow', '0');
  cleanupProgress.innerHTML = '<span class="customer-cleanup-progress__label">정리</span>';
  customerServeTargets.appendChild(button);
  customerServeTargets.appendChild(cleanupProgress);
  return [seatId, { button, cleanupProgress, index }];
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
    const { button, cleanupProgress, index } = serveTargetButtons.get(seatId);
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
    const progress = Math.max(0, Math.min(1, seat?.cleanupProgress ?? 0));
    const active = cleanupSeatId === seatId;
    cleanupProgress.hidden = !cleanupNeeded;
    cleanupProgress.dataset.active = String(active);
    cleanupProgress.style.setProperty('--cleanup-progress', String(progress));
    cleanupProgress.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    cleanupProgress.querySelector('.customer-cleanup-progress__label').textContent = '정리';
  }
  positionServeTargets();
}

function positionServeTargets() {
  if (customerServePanel.hidden) return;
  for (const [seatId, { button, cleanupProgress }] of serveTargetButtons) {
    const anchor = R.seatBubbleWorld[seatId];
    if (!anchor) continue;
    const point = R.projectToScreen(anchor);
    button.style.left = `${point.x}px`;
    button.style.top = `${point.y + 24}px`;
    const cleanupAnchor = R.seatCleanupWorld[seatId];
    if (cleanupAnchor) {
      const cleanupPoint = R.projectToScreen(cleanupAnchor);
      cleanupProgress.style.left = `${cleanupPoint.x}px`;
      cleanupProgress.style.top = `${cleanupPoint.y}px`;
    }
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
  firstOrderGuide.selectedCard(menuIdForLabel(selected.menu));
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
  drinkTower: '맥주 타워', glassRack: '빈잔 놓기',
  drinkLeverDrag: '레버',
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
drinkPanel.querySelector('.target-line').style.bottom = `${GLASS_PX}px`;

function updateDrinkPanel(activeScreen) {
  const show = activeScreen === 'SCR-SVC-DRINK';
  R.setObjectEnabled?.('drinkPlacedGlass', glassPlaced);
  R.setObjectEnabled?.('drinkBeerLiquid', glassPlaced);
  R.setObjectEnabled?.('drinkBeerVfx', glassPlaced);
  drinkPanel.hidden = !show;
  const s = pour.state();
  beerLiquid?.setState({
    beerFill: s.beerSec / DRINK.glassCapacity,
    foamFill: s.foamSec / DRINK.glassCapacity,
    overflow: s.phase === 'overflow',
  });
  beerCoreVfx?.setState({
    active: s.active,
    foamFill: s.foamSec / DRINK.glassCapacity,
    overflow: s.phase === 'overflow',
    finished: s.phase === 'ready' && s.beerOk && s.foamOk,
  });
  if (!show) return;
  const beerH = Math.min(1, s.beerSec / DRINK.glassCapacity) * GLASS_PX;
  const foamH = Math.min(1 - beerH / GLASS_PX, s.foamSec / DRINK.glassCapacity) * GLASS_PX;
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
    showHint('생맥주를 음료 픽업대에 올렸어요');
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

function extraKind(customerId) {
  if (customerId?.startsWith('D1-OFFICE')) return 'office';
  if (customerId?.startsWith('D1-SOLO')) return 'solo';
  return null;
}

function tsukiokaArtFor(seat, nowMs) {
  if (!seat) return runtimeAssets.TSUKIOKA_WAITING;
  if (seat.phase === 'eating' || seat.phase === 'done') {
    return resolveD1ReceivedEatingFrame(runtimeAssets, nowMs);
  }
  const order = businessView()?.orders.find((item) => item.orderId === seat.orderId);
  const partiallyServed = order?.lines.some((line) => line.served > 0)
    && order.lines.some((line) => line.remaining > 0);
  return partiallyServed
    ? runtimeAssets.TSUKIOKA_PARTIAL_BEER
    : runtimeAssets.TSUKIOKA_WAITING;
}

function seatHasServedMenu(view, seat, menuId) {
  const order = view?.orders.find((item) => item.orderId === seat?.orderId);
  return order?.lines.some((line) => line.menuId === menuId && line.served > 0) === true;
}

function updateTsukiokaArt(nowMs = performance.now(), resolvedArt = null) {
  const view = businessView();
  const seat = view?.seats.find((item) => item.customerId === 'REGULAR_TSUKIOKA');
  const visible = director.activeScreenId() === 'SCR-SVC-CUSTOMERS'
    && (departureCutsceneActive || (
      !!seat?.occupied
      && !seat.cleanupNeeded
      && !['empty', 'leaving', 'cleanup'].includes(seat.phase)
    ));
  R.setObjectVisible('custTsukioka', visible);
  if (!visible) return null;
  const art = resolvedArt ?? tsukiokaArtFor(seat, nowMs);
  R.setArtUrl('custTsukioka', art.url);
  const holdingBeer = art.id === runtimeAssets.TSUKIOKA_PARTIAL_BEER.id
    || art.frameRole === 'drink-frame';
  // actor 프레임은 매 rAF마다 바뀐다. 같은 프레임에서 테이블 잔도 함께 숨겨
  // 손과 테이블에 잔이 한 프레임이라도 중복되는 현상을 막는다.
  R.setSeatBeerVisible(seat.seatId, seatHasServedMenu(view, seat, 'beer') && !holdingBeer);
  const genericActor = R.seatActorMesh[seat.seatId];
  if (genericActor) genericActor.visible = false;
  return art;
}

function syncCustomers() {
  const view = businessView();
  const seats = view?.seats ?? [];
  if (cleanupSeatId && !seats.find((seat) => seat.seatId === cleanupSeatId)?.cleanupNeeded) {
    cleanupSeatId = null;
  }
  const onCustomers = director.activeScreenId() === 'SCR-SVC-CUSTOMERS';
  const nowMs = performance.now();
  const tsukiokaSeat = seats.find((item) => item.customerId === 'REGULAR_TSUKIOKA');
  R.setSeatLayoutMode(tsukiokaSeat ? 'tsukioka' : 'centered-guests');
  const tsukiokaArt = tsukiokaSeat ? tsukiokaArtFor(tsukiokaSeat, nowMs) : null;
  for (const seatId of SEAT_IDS) {
    const seat = seats.find((item) => item.seatId === seatId);
    const servedNegima = seatHasServedMenu(view, seat, 'negima');
    const servedBeer = seatHasServedMenu(view, seat, 'beer');
    const kind = extraKind(seat?.customerId);
    const officeArt = kind === 'office'
      ? resolveD1OfficeCustomerFrame(runtimeAssets.COMMUTER_CUSTOMER, {
        customerId: seat.customerId,
        phase: seat.phase,
        servedNegima,
        servedBeer,
        nowMs,
      })
      : null;
    const tsukiokaHoldingBeer = seat?.customerId === 'REGULAR_TSUKIOKA'
      && (tsukiokaArt?.id === runtimeAssets.TSUKIOKA_PARTIAL_BEER.id
        || tsukiokaArt?.frameRole === 'drink-frame');
    const officeHoldingBeer = isD1OfficeBeerFrame(officeArt);
    const customerPresent = !!seat?.occupied
      && !seat.cleanupNeeded
      && !['empty', 'leaving', 'cleanup'].includes(seat.phase);
    const dirtyTable = Boolean(seat?.cleanupNeeded || seat?.phase === 'leaving');
    R.setSeatPlateVisible(seatId, onCustomers && customerPresent && servedNegima);
    R.setSeatBeerVisible(seatId, onCustomers && customerPresent
      && servedBeer && !tsukiokaHoldingBeer && !officeHoldingBeer);
    R.setSeatEmptyDishesVisible(seatId, onCustomers && dirtyTable);
    R.setSeatCleanupOverlayVisible(seatId, onCustomers && cleanupSeatId === seatId);
    const target = R.objectMesh[`seatServe:${seatId}`];
    if (target) {
      target.visible = onCustomers && !!seat
        && (seat.canOrder || seatCanReceiveSelected(seat) || seat.cleanupNeeded);
    }
    const actor = R.seatActorMesh[seatId];
    if (actor) {
      if (kind === 'office') {
        R.setSeatActorTexture(seatId, officeArt?.url ?? runtimeAssets.COMMUTER_CUSTOMER.url);
      } else if (kind === 'solo') {
        R.setSeatActorTexture(seatId, runtimeAssets.SOLO_CUSTOMER.url);
      } else if (actor.material.map) {
        actor.material.map = null;
        actor.material.needsUpdate = true;
      }
      actor.scale.x = 1;
    }
    const bubble = document.querySelector(`[data-testid="bubble-${seatId}"]`);
    if (bubble) {
      bubble.dataset.serveEligible = String(seatCanReceiveSelected(seat));
      if (kind) {
        delete bubble.dataset.placeholder;
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
  updateTsukiokaArt(nowMs, tsukiokaArt);
}

function render() {
  const now = performance.now();
  for (const key of Object.keys(SCREEN_OF)) {
    R.setObjectVisible(key, shouldShow(key));
  }
  // 그릴 칸 익힘 색 폴백(셰이더 로드 전)
  const views = cook.slotViews(now);
  syncAssemblyVisual();
  renderGrillWaitingControl(views);
  renderGrillFinishedInventory();
  // 클릭 결과를 다음 rAF까지 미루지 않는다. 0.3초 뒤집기 잠금처럼 짧은 상태도
  // 입력과 같은 렌더에서 DOM에 반영돼야 저사양·소형 화면에서도 건너뛰지 않는다.
  updateGrillStatus(now);
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
  renderD3Torch();
  syncCustomers();
  renderServeTargets();
  for (const btn of document.querySelectorAll('.quick-nav button')) btn.classList.toggle('active', btn.dataset.screen === director.activeScreenId());
  el('navLeft').disabled = !director.canLeft();
  el('navRight').disabled = !director.canRight();
  businessRenderDue = false;
}

function syncAssemblyVisual() {
  const onAssembly = director.activeScreenId() === 'SCR-SVC-ASSEMBLY';
  const ready = rawNegimaRuntime.status === 'ready';
  const progress = cook.assemblyProgress();
  if (assemblyNegimaInstances.build) {
    assemblyNegimaInstances.build.setIngredientCount(progress.index);
    assemblyNegimaInstances.build.holder.visible = onAssembly && ready;
  }
  const waitingCount = cook.waitingCount();
  assemblyNegimaInstances.tray.forEach((instance, index) => {
    instance.holder.visible = onAssembly && ready && index < waitingCount;
  });
}

function assemblyInstanceGeometry(instance) {
  if (!instance) return null;
  instance.root.updateWorldMatrix(true, true);
  const screenPoint = (name) => {
    const node = instance.root.getObjectByName(name);
    if (!node) return null;
    return R.projectToScreen(node.getWorldPosition(new THREE.Vector3()));
  };
  return {
    handle: screenPoint('handle'),
    tip: screenPoint('tip'),
    slots: Array.from({ length: 5 }, (_, index) => (
      screenPoint(`slot-${String(index + 1).padStart(2, '0')}`)
    )),
  };
}

function renderGrillWaitingControl(slotViews) {
  const onGrill = director.activeScreenId() === 'SCR-SVC-GRILL';
  const onCustomers = director.activeScreenId() === 'SCR-SVC-CUSTOMERS';
  const waitingCount = cook.waitingCount();
  const hasEmptySlot = slotViews.some((slot) => slot.status === 'empty');
  grillInventory.hidden = !onGrill;
  // The prepared inventory is shared state, but selecting it is a customer-station action.
  // Keep the stock while hiding the service-counter art from every work station.
  dockShelf.classList.toggle('station-context-hidden', !onCustomers);
  dockShelf.setAttribute('aria-hidden', String(!onCustomers));
  grillWaitingNegima.disabled = !onGrill || waitingCount === 0 || !hasEmptySlot;
  grillWaitingNegima.dataset.waitingCount = String(waitingCount);
  grillWaitingNegima.dataset.hasEmptySlot = String(hasEmptySlot);
  grillWaitingNegimaCount.textContent = `× ${waitingCount}`;
  grillWaitingNegimaHint.textContent = waitingCount === 0
    ? '조립대에서 완성 꼬치를 옮겨주세요'
    : hasEmptySlot
      ? '클릭하여 첫 빈 칸에 한 개 올리기'
      : '빈 그릴 칸이 생기면 배치할 수 있습니다';
  grillWaitingNegima.setAttribute(
    'aria-label',
    waitingCount === 0
      ? '네기마. 대기 중인 꼬치 없음.'
      : hasEmptySlot
        ? `네기마. 대기 ${waitingCount}개. 다음 한 개를 첫 빈 그릴 칸에 올리기.`
        : `네기마. 대기 ${waitingCount}개. 빈 그릴 칸 없음.`,
  );
}

const GRILL_QUALITY_ORDER = Object.freeze(['Perfect', 'Good', 'OK', 'Fail']);
const GRILL_QUALITY_LABEL = Object.freeze({
  Perfect: '완벽',
  Good: '좋음',
  OK: '보통',
  Fail: '실패',
});

function renderGrillFinishedInventory() {
  const negimaItems = dock.items().filter((item) => item.menu === '네기마');
  grillFinishedInventoryCount.textContent = `총 ${negimaItems.length}개`;
  grillFinishedQualityList.innerHTML = '';

  if (negimaItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'grill-inventory-empty';
    empty.innerHTML = '<strong>완성된 꼬치가 없습니다</strong><span>다 구운 네기마를 그릴에서 꺼내면 여기에 품질별로 표시됩니다.</span>';
    grillFinishedQualityList.appendChild(empty);
    return;
  }

  const grouped = new Map();
  for (const item of negimaItems) grouped.set(item.label, (grouped.get(item.label) ?? 0) + 1);
  const labels = [...grouped.keys()].sort((a, b) => {
    const ai = GRILL_QUALITY_ORDER.indexOf(a);
    const bi = GRILL_QUALITY_ORDER.indexOf(b);
    return (ai < 0 ? GRILL_QUALITY_ORDER.length : ai) - (bi < 0 ? GRILL_QUALITY_ORDER.length : bi);
  });
  for (const label of labels) {
    const card = document.createElement('div');
    card.className = `grill-finished-quality grill-finished-quality--${label.toLowerCase()}`;
    card.dataset.quality = label;
    card.setAttribute('role', 'listitem');

    const marker = document.createElement('span');
    marker.className = 'grill-finished-quality-marker';
    marker.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('span');
    copy.className = 'grill-finished-quality-copy';
    const menu = document.createElement('strong');
    menu.textContent = '네기마';
    const quality = document.createElement('span');
    quality.textContent = GRILL_QUALITY_LABEL[label] ?? label;
    copy.append(menu, quality);

    const count = document.createElement('strong');
    count.className = 'grill-finished-quality-count';
    count.textContent = `× ${grouped.get(label)}`;
    card.append(marker, copy, count);
    grillFinishedQualityList.appendChild(card);
  }
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
      const icon = ORDER_ICON[menu] ? `<img src="${ORDER_ICON[menu]}" alt="">` : '';
      return `<span class="oi ${line.remaining === 0 ? 'done' : ''}" data-testid="order-${order.orderId}-${line.menuId}">`
        + `${icon}${menu} ${line.served}/${line.quantity}</span>`;
    }))
    .join('');
}

function guideText(view) {
  if (businessBootError) return `D1 시작 실패 · ${businessBootError.message ?? businessBootError.code}`;
  if (!view) return 'S0 저장을 확인하고 D1 영업을 준비하는 중입니다.';
  if (view.phase === 'closing-drain') {
    const risk = view.limits.riskProcessCount;
    return `23:30 마감. 남은 주문 ${view.closing.unfinishedOrderCount}건·좌석 정리 ${view.closing.cleanupSeatCount}건${risk ? `·그릴 위험 공정 ${risk}건` : ''}을 끝내세요.`;
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
  if (waiting) return '요리 서빙대나 음료 픽업대에서 완성품을 고른 뒤 일치하는 남은 주문이 있는 손님을 선택하세요.';
  const remainingSec = Math.max(0, Math.ceil((view.clock.targetMs - view.clock.elapsedMs) / 1000));
  const remaining = `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, '0')}`;
  return `23:30 자동 마감까지 ${remaining} · 다음 손님을 기다리며 조립·그릴·드링크를 준비할 수 있습니다.`;
}

function renderFirstOrderGuide() {
  for (const target of document.querySelectorAll('[data-guide-target="true"]')) {
    target.dataset.guideTarget = 'false';
  }
  const policy = DAY_GUIDE_POLICY[ACTIVE_DAY_ID];
  el('guideTitle').textContent = policy.title;
  if (policy.mode !== 'sequential') {
    el('guideCurrent').textContent = policy.mode === 'review' ? '복습형 · 선택 도움' : '신규 행동';
    el('guideNextAction').textContent = policy.mode === 'review'
      ? guideText(businessView())
      : (d3Grill.job(D3_TORCH_JOB_ID) ? '타레·토치 패널의 상태를 따라 마감하세요.' : '모모 꼬치 준비를 눌러 타레·토치 마감을 시작하세요.');
    el('guideSteps').replaceChildren(...policy.steps.map((label) => {
      const row = document.createElement('li');
      row.dataset.status = 'review';
      row.textContent = label;
      return row;
    }));
    return;
  }
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

  if (!current) return;
  if (director.activeScreenId() !== current.targetScreenId) {
    const nav = document.querySelector(`.quick-nav button[data-screen="${current.targetScreenId}"]`);
    if (nav) nav.dataset.guideTarget = 'true';
    return;
  }
  if (current.targetControlId === 'grillWaitTray') {
    if (!grillWaitingNegima.hidden) grillWaitingNegima.dataset.guideTarget = 'true';
  } else if (current.targetControlId === 'serve-target-seat-01') {
    const seat = businessView()?.seats.find((item) => item.customerId === 'REGULAR_TSUKIOKA');
    const orderLabel = seat
      ? document.querySelector(`[data-testid="bubble-${seat.seatId}"] .order-label`)
      : null;
    if (orderLabel) orderLabel.dataset.guideTarget = 'true';
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
  const activeDayFeatureOpen = businessSession?.ok === true
    && businessSession.completed !== true
    && view?.dayId?.toLowerCase() === ACTIVE_DAY_ID;
  momoPrep.hidden = !activeDayFeatureOpen || !['d2', 'd3'].includes(ACTIVE_DAY_ID);
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
  if (director.controlsLocked()) return;
  const key = hitTest(e);
  if (!key) return;
  const now = performance.now();
  if (key === 'drinkLeverDrag') {
    if (!glassPlaced) {
      reportGuideInvalid('빈 잔을 먼저 놓아야 레버를 사용할 수 있습니다.');
      showHint('빈 잔을 먼저 놓으세요');
      render();
      return;
    }
    activeDrinkLeverDrag = { pointerId: e.pointerId, startY: e.clientY, zone: null };
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    return;
  }
  if (key.startsWith('seatServe:')) {
    const seatId = key.slice('seatServe:'.length);
    const seat = seatView(seatId);
    if (seat?.cleanupNeeded) {
      beginCleanupHold(seatId);
      return;
    }
  }
  invokeLockedControl(key, now);
});
canvas.addEventListener('pointermove', updateDrinkLeverDrag);
function releaseCleanupHold() {
  if (!cleanupSeatId) return;
  const seatId = cleanupSeatId;
  cleanupSeatId = null;
  if (seatView(seatId)?.cleanupNeeded) {
    dispatchBusiness(D1_UI_INTENT.CANCEL_CLEANUP, { seatId });
    showHint('좌석 정리를 멈췄어요');
  }
  render();
}

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
  const drink = pour.state();
  if (drink.beerSec > 0 && drink.foamSec > 0) {
    firstOrderGuide.complete('beer.pour');
    persistFirstOrderRuntime();
  }
  releaseCleanupHold();
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
        showHint('네기마 완성 · 완성 꼬치를 눌러 오른쪽 트레이로 옮기세요');
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
      } else {
        firstOrderGuide.complete(r.slot === 0 ? 'grill.place.1' : 'grill.place.2');
        showHint(`${r.slot + 1}번 꼬치 앞면 조리 시작 · 다른 꼬치와 독립적으로 익습니다`);
      }
      persistFirstOrderRuntime();
      syncRiskCount(now);
      break;
    }
    case 'grillFinishedTray':
      showHint(dock.items().some((item) => item.menu === '네기마')
        ? '완성 네기마는 오른쪽 품질별 목록에서 확인할 수 있어요'
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
    showHint('완성 네기마가 오른쪽 품질별 목록에 추가됐어요');
  }
  else if (r.flipped) {
    if (!guideFlippedSlots.has(i)) {
      guideFlippedSlots.add(i);
      guideFlipCount += 1;
      firstOrderGuide.complete(`grill.flip.${guideFlipCount}`);
    }
    persistFirstOrderRuntime();
    showHint('꼬치를 뒤집는 중입니다');
  }
  else if (!r.ok && r.reason === 'not-ready') {
    const view = cook.slotViews(now)[i];
    const feel = view.doneness === 'perfect'
      ? '노릇하게 익었습니다'
      : view.doneness === 'over'
        ? '많이 익었습니다'
        : view.doneness === 'burnt'
          ? '타기 시작했습니다'
          : '아직 익는 중입니다';
    showHint(`${feel} · 꼬치의 색을 보고 판단하세요`);
  }
  syncRiskCount(now);
  render();
}

function grillNegimaStage(view) {
  if (!view?.cooking) return 'raw';
  if (view.doneness === 'under' && view.faceElapsedSec <= 1.2) return 'raw';
  if (view.doneness === 'perfect') return 'proper';
  if (view.doneness === 'over') return 'overcooked';
  if (view.doneness === 'burnt') return 'burnt';
  return 'cooking';
}

// 뒤집는 동안에는 단계 표시를 고정한다. 회전 중 판정이 잠깐 비조리로 보여 'raw'로 튀면
// 화면·회귀 모두에서 단계가 깜빡인다. 마지막으로 확정된 단계를 들고 있는다.
const rawNegimaStageBySlot = {};

function bindCookingMaterialToApprovedPlane(key) {
  const g = grillMats[key];
  const instance = rawNegimaInstances[key];
  if (!g || !instance?.applyCookingMaterial) return false;
  if (!instance.applyCookingMaterial(g.material)) return false;
  if (rawNegimaRuntime.grillRawTexture) g.setTexture(rawNegimaRuntime.grillRawTexture);
  // 셰이더 재질은 이제 승인 평면이 소유한다. pgSlot mesh와 공유하면 그쪽에 걸리는
  // colorWrite=false가 평면까지 꺼버린다. mesh는 raycast 전용 투명 재질로 되돌린다.
  const mesh = R.objectMesh[key];
  if (mesh && mesh.material === g.material) {
    mesh.material = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, colorWrite: false, depthWrite: false,
      // 뒤집힌 칸(rotation π)에서도 raycast가 닿아야 회수 클릭이 산다. FrontSide면 뒷면이라 놓친다.
      side: THREE.DoubleSide,
    });
  }
  return true;
}

function updateGrillVisual(now) {
  const views = cook.slotViews(now);
  for (const key of SLOT_KEYS) {
    const v = views[slotIndexOf(key)];
    const mesh = R.objectMesh[key];
    if (!mesh) continue;
    const g = grillMats[key];
    if (g) {
      g.setTexture(rawNegimaRuntime.grillRawTexture);
      g.setTime(now / 1000);
      for (const [param, value] of Object.entries(d1SecondFaceR3Params(v))) g.setParam(param, value);
      g.setDoneness(v && v.cooking ? elapsedSecToUniform(v.faceElapsedSec) : 0);
    }
    const visibleStage = grillNegimaStage(v);
    mesh.userData.grillBaseQuaternion ??= mesh.quaternion.clone();
    mesh.quaternion.copy(mesh.userData.grillBaseQuaternion).multiply(
      grillFlipQuaternion.setFromAxisAngle(GRILL_FLIP_AXIS, v?.visualRotationRad ?? 0),
    );
    const rawInstance = rawNegimaInstances[key];
    // 승인 원본(raw) 한 장을 계속 두고 GLSL이 색만 바꾼다. 단계마다 래스터를 갈아끼우면
    // 실루엣과 디테일이 통째로 바뀌어 사용자에게 "이미지가 교체된다"로 보인다.
    // 단계별 그을음·살코기 디테일은 셰이더가 재현한다(사용자 확정, 2026-08-10).
    const shaderOnApprovedPlane = rawInstance?.usesCookingMaterial?.() === true;
    const showApprovedSprite = (
      rawNegimaRuntime.status === 'ready'
      && v != null
      && v.status !== 'empty'
      && director.activeScreenId() === 'SCR-SVC-GRILL'
    );
    if (rawInstance) {
      rawInstance.holder.visible = showApprovedSprite;
      if (!v?.flipping) {
        rawNegimaStageBySlot[key] = visibleStage;
        if (shaderOnApprovedPlane) rawInstance.setCooking?.(v?.cooking === true);
        else rawInstance.setStage(visibleStage);
      }
      // The approved grill artwork is a front-facing 2D sprite. Rotating its zero-thickness
      // plane around Y makes the skewer collapse into a sheet of paper mid-flip. Keep the
      // artwork facing the camera; the cook state still switches contact faces normally.
      rawInstance.flipPivot.rotation.y = 0;
      if (!v?.flipping) {
        rawInstance.flipPivot.scale.x = v?.orientationFaceDown === 'back' ? -1 : 1;
      }
    }
    // public pgSlot은 visual과 raycast를 한 mesh가 맡으므로 visible=false로 숨기면 입력도 끊긴다.
    // mesh/raycast는 유지하고 color write만 막는다. 승인 평면이 셰이더를 소유한 뒤에는
    // mesh가 raycast 전용이라 항상 막아둔다.
    if (mesh.material) mesh.material.colorWrite = !showApprovedSprite;
  }
}


// 익힘 셰이더 재질을 칸마다 만들고 승인 원본 평면에 물린다.
for (const key of SLOT_KEYS) {
  createGrillMaterial().then((g) => {
    grillMats[key] = g;
    bindCookingMaterialToApprovedPlane(key);
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
    const consumed = ACTIVE_DAY_ID === 'd3'
      ? await loadD3BusinessDayDefinition({ url: D3_BUSINESS_DAY_DEFINITION_URL })
      : ACTIVE_DAY_ID === 'd2'
        ? await loadD2BusinessDayDefinition({ url: D2_BUSINESS_DAY_DEFINITION_URL })
        : await loadD1BusinessDayReleaseDefinition({ url: D1_BUSINESS_DAY_RELEASE_DEFINITION_URL });
    if (!consumed.ok) {
      businessBootError = consumed.error;
      businessRenderDue = true;
      render();
      return;
    }
    const resetDevelopment = resetFirstOrderRuntime;
    businessSession = await createD1BusinessDayBrowserSession({
      definition: consumed.definition,
      browserStorage: window.localStorage,
      resetDevelopment,
    });
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
  } else if (!departureCutsceneActive) {
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
      advanceBusinessRuntime(businessDeltaMs);
      businessDeltaMs = 0;
    }
  }
  lastBusinessFrameAt = now;
  updateGrillVisual(now);
  R.setCleanupOverlayFrame(Math.floor(now / 180));
  updateGrillStatus(now);
  pour.tick(now);
  beerLiquid?.setTime(now / 1000);
  beerCoreVfx?.setTime(now / 1000);
  updateDrinkPanel(active);
  updateLabels();
  customers.tick(active);
  positionServeTargets();
  updateTsukiokaArt(now);
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
Object.assign(d1GameDebug, {
  lifecycle: () => 'ready',
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
    const result = advanceBusinessRuntime(deltaMs, { showDepartureCutscene: false });
    businessRenderDue = true;
    render();
    return result;
  },
  businessAdvanceWithCutscene: (deltaMs) => {
    const result = advanceBusinessRuntime(deltaMs, { showDepartureCutscene: true });
    render();
    return result;
  },
  departureCutscene: () => ({
    active: departureCutsceneActive,
    seen: departureCutsceneSeen,
    sceneId: D1_TSUKIOKA_DEPARTURE_SCENE.sceneId,
  }),
  dismissDepartureCutscene: () => closeTsukiokaDepartureCutscene(),
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
    const started = beginCleanupHold(seatId);
    return { ok: started, applied: started };
  },
  businessPostAction: () => handlePostBusinessAction(),
  businessFinalize: () => businessPort?.finalize(),
  campaignState: () => businessSession?.bridge?.getState?.() ?? null,
  custPhase: () => legacyCustomerPhase(),
  order: () => legacyFirstOrder(),
  customerArt: () => legacyFirstOrder().생맥주.done > 0 ? 'partial-beer' : 'waiting',
  texturesReady: () => R.texturesReady(),
  rawNegimaRuntime: () => ({
    status: rawNegimaRuntime.status,
    exactLoadReady: rawNegimaRuntime.status === 'ready',
    diagnostics: rawNegimaRuntime.diagnostics,
    error: rawNegimaRuntime.error ? String(rawNegimaRuntime.error.message ?? rawNegimaRuntime.error) : null,
    readiness: {
      placeholderCount: rawNegimaReadiness.placeholderCount,
      unboundApprovedIds: rawNegimaReadiness.unboundApprovedIds,
      contractValid: rawNegimaReadiness.contractAudit.valid,
    },
    slots: SLOT_KEYS.map((key) => ({
      key,
      approvedRawVisible: rawNegimaInstances[key]?.holder.visible === true,
      // 승인 평면은 계속 떠 있고 재질만 바뀌므로, 단계는 평면 상태가 아니라 조리 판정에서 읽는다.
      approvedStage: rawNegimaStageBySlot[key]
        ?? grillNegimaStage(cook.slotViews(performance.now())[slotIndexOf(key)]),
      visibleSpriteStage: rawNegimaInstances[key]?.stage?.() ?? null,
      shaderCookingActive: rawNegimaInstances[key]?.cookingActive?.() === true,
      visualFlipRadians: rawNegimaInstances[key]?.flipPivot?.rotation?.y ?? null,
      visualMirrorX: rawNegimaInstances[key]?.flipPivot?.scale?.x ?? null,
      visualDoneness: grillMats[key]?.uniforms?.uDoneness?.value ?? null,
      proceduralFallbackVisible: (
        R.objectMesh[key]?.visible === true
        && R.objectMesh[key]?.material?.colorWrite !== false
      ),
      shaderColorVisible: (
        R.objectMesh[key]?.visible === true
        && R.objectMesh[key]?.material?.colorWrite !== false
      ),
      shaderUsesApprovedRaw: grillMats[key]?.uniforms?.uTex?.value === rawNegimaRuntime.grillRawTexture,
      // 굽는 셰이더가 승인 원본 평면 위에서 돈다 = 단계마다 그림을 갈아끼우지 않는다.
      shaderOnApprovedPlane: rawNegimaInstances[key]?.usesCookingMaterial?.() === true,
      interactionVisible: (
        R.interactionMesh[key]?.visible
        ?? R.objectMesh[key]?.visible
        ?? false
      ),
    })),
  }),
  assemblyArtRuntime: () => ({
    status: rawNegimaRuntime.status,
    build: {
      visible: assemblyNegimaInstances.build?.holder.visible === true,
      ingredientCount: assemblyNegimaInstances.build?.ingredientCount?.() ?? 0,
      ingredientRenderOrders: assemblyNegimaInstances.build?.ingredientRenderOrders?.() ?? [],
      geometry: assemblyInstanceGeometry(assemblyNegimaInstances.build),
    },
    tray: assemblyNegimaInstances.tray.map((instance) => ({
      visible: instance.holder.visible === true,
      ingredientCount: instance.ingredientCount(),
      geometry: assemblyInstanceGeometry(instance),
    })),
    waitingCount: cook.waitingCount(),
  }),
  dockItems: () => dock.items(),
  dockSelectedId: () => dock.selectedId(),
  dockAdd: (item) => { const id = dock.add(item); render(); return id; },
  dockSelect: (id) => dock.select(id),
  d3TorchView: () => d3Grill.job(D3_TORCH_JOB_ID),
  d3TorchStage: () => {
    const result = d3Grill.job(D3_TORCH_JOB_ID)
      ? { ok: true }
      : d3Grill.stageCookedItem({ id: D3_TORCH_JOB_ID, menuId: 'momo', seasoning: 'tare', bothFacesCooked: true });
    persistFirstOrderRuntime();
    render();
    return result;
  },
  d3TorchApplyTare: () => { const result = d3Grill.applyTare(D3_TORCH_JOB_ID); persistFirstOrderRuntime(); render(); return result; },
  d3TorchBegin: () => { const result = d3Grill.beginTorch(D3_TORCH_JOB_ID); persistFirstOrderRuntime(); render(); return result; },
  d3TorchSweep: (position, deltaMs) => { const result = d3Grill.sweepTorch(D3_TORCH_JOB_ID, { position, deltaMs }); persistFirstOrderRuntime(); render(); return result; },
  d3TorchFinish: () => { const result = d3Grill.finishTorch(D3_TORCH_JOB_ID); persistFirstOrderRuntime(); render(); return result; },
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
    slots: computeGrillSlots(D1_PUBLIC_GRILL_LAYOUT),
    initialPlacementSlots: D1_PUBLIC_GRILL_LAYOUT.initialPlacementSlots,
    finishedTray: D1_GRILL_FINISHED_TRAY,
  }),
  grillWaitingControl: () => ({
    hidden: grillInventory.hidden,
    disabled: grillWaitingNegima.disabled,
    waitingCount: grillWaitingNegima.dataset.waitingCount,
    hasEmptySlot: grillWaitingNegima.dataset.hasEmptySlot,
    ariaLabel: grillWaitingNegima.getAttribute('aria-label'),
    rect: grillWaitingNegima.getBoundingClientRect().toJSON(),
  }),
  grillFinishedInventory: () => ({
    hidden: grillInventory.hidden,
    total: dock.items().filter((item) => item.menu === '네기마').length,
    groups: [...grillFinishedQualityList.querySelectorAll('[data-quality]')].map((card) => ({
      quality: card.dataset.quality,
      text: card.textContent.replace(/\s+/g, ' ').trim(),
      rect: card.getBoundingClientRect().toJSON(),
    })),
  }),
  clickCustomer: () => {
    const seat = businessView()?.seats.find((item) => item.customerId === 'REGULAR_TSUKIOKA');
    if (seat) activateSeat(seat.seatId);
    render();
  },
  pourExact: (beerSec, foamSec) => { pour.reset(); pour.press('beer', 0); pour.release(beerSec * 1000); pour.press('foam', beerSec * 1000); pour.release((beerSec + foamSec) * 1000); return pour.state(); },
  drinkState: () => pour.state(),
  beerLiquidState: () => beerLiquid?.snapshot() ?? null,
  beerCoreVfxState: () => beerCoreVfx?.snapshot() ?? null,
  drinkFinish: () => finishDrink(),
  screenPosOf: (key) => {
    const m = R.interactionMesh[key] ?? R.objectMesh[key];
    if (!m || !m.visible) return null;
    const v = m.position.clone().project(R.camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  },
  renderer: R,
});
