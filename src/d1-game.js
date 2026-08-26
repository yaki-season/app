// D1 전체 영업 프로덕션 진입점. D1BusinessDayRuntime의 상태를 D1BusinessDayUiPort로만 소비해
// S0 종료→4주문 영업→마감 drain→숯불→정산 5단계→단일 저장 commit→D2 전환을 연결한다.
// 조리 모델은 영업 도메인과 독립이며 이 파일이 완성품·위험 공정 intent만 번역한다.

import * as THREE from 'three';
import { createProductionRenderer } from './render/productionRenderer.js';
import { createStationDirector } from './render/stationDirector.js';
import { createD1RawNegimaCompositor } from './render/d1RawNegimaCompositor.js';
import {
  D2_MOMO_RUNTIME_URLS,
  loadD2MomoSpriteRuntime,
} from './render/d2MomoSpriteRuntime.js';
import {
  D5_KAWA_RUNTIME_URLS,
  loadD5KawaSpriteRuntime,
} from './render/d5KawaSpriteRuntime.js';
import {
  COOK_SLOT_NEXT_ACTION,
  createD1CookStations,
} from './render/cookStations.js';
import { createDrinkPour, drinkVisualFill, DRINK } from './render/drinkStation.js';
import { drinkLeverZoneForDelta } from './render/drinkLeverDrag.js';
import { createBeerLiquidMaterial } from './render/beerLiquidMaterial.js';
import { createBeerCoreVfxMaterial } from './render/beerCoreVfxMaterial.js';
import { createGrillMaterial } from './render/grillMaterial.js';
import { elapsedSecToUniform } from './render/grillRenderer.js';
import { createGrillSmokeVfx } from './render/grillSmokeVfx.js';
import { d1SecondFaceR3Params } from './render/d1SecondFaceR3.js';
import { createPreparedDock } from './render/preparedDock.js';
import { D4_MENU_ART_URLS } from './assets/d4MenuArt.js';
import { createInstantServiceStation } from './application/stations/instantServiceStation.js';
import { HIGHBALL_DEFAULT_CONFIG, createHighballStation } from './application/stations/highballStation.js';
import { gameAudio, installGameAudio, setBgm, sfx, sfxOff, sfxOnce, loopOn, loopOff, loopRate } from './audio/gameAudio.js';
import { crowdAmbienceId, interiorAmbienceId } from './audio/audioCatalog.js';
import { createCustomerAdapter } from './render/customerAdapter.js';
import { seatHasServedMenu } from './render/seatServing.js';
import { settlementStepDetail } from './render/settlementSteps.js';
import { recipeBookEntries, shouldShowAssemblyTutorial } from './render/recipeBook.js';
import {
  d1OfficeActorOffsetX,
  d1OfficeCustomerVariant,
  isD1OfficeBeerFrame,
  resolveD1OfficeCustomerFrame,
} from './render/d1OfficeCustomerArt.js';
import {
  isD1SoloBeerFrame,
  resolveD1SoloCustomerFrame,
} from './render/d1SoloCustomerArt.js';
import {
  HIGHBALL_DAY_BEER_KEYS,
  HIGHBALL_DAY_BEER_SHIFT_X,
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
  D4_PUBLIC_GRILL_LAYOUT,
} from './config/d1GrillLayout.js';
import {
  D1_ASSEMBLY_BUILD_SLOT,
  D1_ASSEMBLY_TRAY_SLOTS,
} from './config/d1AssemblyLayout.js';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY, clearFirstOrderRuntime } from './d1/firstOrderRuntimeStorage.js';
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
import { S0D3CampaignBridge } from './scenario/s0-d3-campaign.js';
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
import {
  D4_BUSINESS_DAY_DEFINITION_URL,
  loadD4BusinessDayDefinition,
} from './application/ports/d4BusinessDayDefinition.js';
import {
  D5_BUSINESS_DAY_DEFINITION_URL,
  loadD5BusinessDayDefinition,
} from './application/ports/d5BusinessDayDefinition.js';

// 정적 진입점의 module graph가 평가된 직후부터 동일 객체를 유지한다. manifest fetch와 영업 세션
// 복구가 끝나기 전에도 reload/E2E consumer는 readiness를 안전하게 읽을 수 있고, 준비되지 않은
// 기능 호출은 명시적으로 false를 반환한다. 아래 최종 debug API는 이 객체에 원자적으로 덧붙인다.
const d1GameDebug = {
  lifecycle: () => 'booting',
  businessReady: () => false,
  texturesReady: () => false,
};
window.__d1GameDebug = d1GameDebug;

// 오디오는 파일이 없으면 조용히 무음으로 돈다. 결선이 게임 부팅을 막지 않는다.
installGameAudio(window);
// 현재 BGM은 상태별 곡이 따로 없어 한 곡을 계속 흘린다. 상태마다 다시 걸면 같은 파일이
// 매번 처음으로 되감겨 오히려 끊겨 들린다.
setBgm('BGM-SERVICE-QUIET');
loopOn('AMB-SHOP-INTERIOR');

const runtimeParams = new URLSearchParams(window.location.search);
const requestedDayId = runtimeParams.get('day');
const ACTIVE_DAY_ID = ['d2', 'd3', 'd4', 'd5'].includes(requestedDayId) ? requestedDayId : 'd1';
// unlockLabels는 정산 5단계에서 "오늘 뭘 얻었나"를 보여주는 용도다. 보상 자체는
// buildBusinessDayCampaignReward가 완료 시점에 계산하므로(그때는 이미 화면이 넘어간다)
// 읽을거리로 쓸 이름만 여기 둔다.
const DAY_META = Object.freeze({
  d1: { label: 'D1', nextLabel: 'D2', nextNodeLabel: '둘째 날 이야기', unlockLabels: ['모모 레시피'] },
  d2: { label: 'D2', nextLabel: 'D3', nextNodeLabel: '셋째 날 이야기', unlockLabels: [] },
  d3: { label: 'D3', nextLabel: 'D4', nextNodeLabel: '넷째 날 이야기', unlockLabels: ['양배추 사라다', '하이볼'] },
  d4: { label: 'D4', nextLabel: 'D5', nextNodeLabel: '다섯째 날 영업', unlockLabels: ['토리카와 레시피'] },
  d5: { label: 'D5', nextLabel: 'D5 완료', nextNodeLabel: '영업 완료', unlockLabels: [] },
});
const ACTIVE_DAY = DAY_META[ACTIVE_DAY_ID];
document.title = `YAKI SEASON — ${ACTIVE_DAY.label} 영업`;
const MENU_ID_BY_LABEL = Object.freeze({
  '생맥주': 'beer',
  '네기마': 'negima',
  '타레 네기마': 'negima',
  '모모': 'momo',
  '타레 모모': 'momo',
  '토리카와': 'kawa',
  '소금 토리카와': 'kawa',
  '타레 토리카와': 'kawa',
  '양배추 사라다': 'cabbage-salad',
  '사라다': 'cabbage-salad',
  '하이볼': 'highball',
});
const menuIdForLabel = (label) => MENU_ID_BY_LABEL[label] ?? null;
const MENU_META = Object.freeze({
  negima: { label: '네기마' },
  momo: { label: '모모' },
  kawa: { label: '토리카와' },
  'cabbage-salad': { label: '양배추 사라다' },
  highball: { label: '하이볼' },
});
const skewerLabel = (menuId, seasoning = 'none') => {
  const base = MENU_META[menuId]?.label ?? '꼬치';
  if (seasoning === 'tare') return `타레 ${base}`;
  if (menuId === 'kawa') return '소금 토리카와';
  return base;
};

const el = (id) => document.getElementById(id);
const canvas = el('scene');
const runtimeAssets = await loadD1RuntimeAssets();
const servedBeerCounterUrl = runtimeAssets.SERVING_PLATE.companions
  .find(({ role }) => role === 'served-beer')?.url;
document.getElementById('dockShelf')?.style.setProperty(
  '--dock-food-art',
  `url("${runtimeAssets.ORDER_NEGIMA.url}")`,
);
document.getElementById('dockShelf')?.style.setProperty(
  '--dock-drink-art',
  `url("${runtimeAssets.ORDER_DRAFT_BEER.url}")`,
);
document.getElementById('dockShelf')?.style.setProperty(
  '--dock-momo-art',
  `url("${D2_MOMO_RUNTIME_URLS.order}")`,
);
document.getElementById('dockShelf')?.style.setProperty(
  '--dock-kawa-art',
  `url("${D5_KAWA_RUNTIME_URLS.order}")`,
);
document.getElementById('dockShelf')?.style.setProperty(
  '--dock-cabbage-salad-art',
  `url("${D4_MENU_ART_URLS.cabbageSaladPlate}")`,
);
document.getElementById('dockShelf')?.style.setProperty(
  '--dock-highball-art',
  `url("${D4_MENU_ART_URLS.highballPickup}")`,
);
document.body.dataset.assetPlaceholderCount = String(runtimeAssets.readiness.placeholderCount);
document.body.dataset.runtimeAssetsReady = String(runtimeAssets.readiness.ready);
document.body.dataset.runtimeContractValid = String(runtimeAssets.readiness.contractAudit.valid);
const activeDayNumber = Number(ACTIVE_DAY_ID.slice(1));
const ACTIVE_SCREENS = SCREENS.filter((screen) => (
  !screen.introducedOn || activeDayNumber >= Number(screen.introducedOn.slice(1))
));
const ACTIVE_SCREEN_IDS = ACTIVE_SCREENS.map((screen) => screen.id);
const R = createProductionRenderer(canvas, { runtimeAssets });
// 하이볼이 열리는 날에는 맥주 세트를 왼쪽으로 비켜 두 작업대가 겹치지 않게 한다.
if (['d4', 'd5'].includes(ACTIVE_DAY_ID)) {
  R.setObjectOffsetX(HIGHBALL_DAY_BEER_KEYS, HIGHBALL_DAY_BEER_SHIFT_X);
}
R.warmTexture(D4_MENU_ART_URLS.cabbageSaladPlate);
for (const seatId of SEAT_IDS) R.setSeatSaladUrl(seatId, D4_MENU_ART_URLS.cabbageSaladPlate);
const director = createStationDirector({ screens: ACTIVE_SCREEN_IDS, initial: INITIAL_SCREEN, transitionMs: SCREEN_TRANSITION_MS });

// 새로고침은 진행 중 영업일을 복구한다(PM 001·002 "새로고침 복구" 완료 기준, 공개 S0→D1 인계).
// 깨끗한 시작이 필요하면 ?reset=1로 명시한다.
const resetFirstOrderRuntime = runtimeParams.get('reset') === '1';
const developmentStartDay = runtimeParams.get('devUnlock') === '1'
  && ['d2', 'd3', 'd4', 'd5'].includes(ACTIVE_DAY_ID)
  ? ACTIVE_DAY_ID
  : null;
const developmentTestFlow = runtimeParams.get('testFlow');
if (resetFirstOrderRuntime) clearFirstOrderRuntime(window.localStorage);
function readFirstOrderRuntime() {
  try {
    const value = window.localStorage.getItem(FIRST_ORDER_RUNTIME_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : null;
    if (parsed?.stateVersion !== 1) return null;
    if (parsed.dayId) return parsed.dayId === ACTIVE_DAY_ID ? parsed : null;
    return ACTIVE_DAY_ID === 'd1' ? parsed : null;
  } catch {
    return null;
  }
}
const restoredFirstOrderRuntime = readFirstOrderRuntime();
// 그날 손님 구성을 뽑는 씨앗. 영업 중 새로고침해도 같은 손님이 앉아 있어야 하므로 한 번 뽑으면
// 그날 저장에 남긴다. D1은 튜토리얼이라 정의에 적힌 순서를 그대로 쓴다.
const daySeed = ACTIVE_DAY_ID === 'd1'
  ? null
  : (restoredFirstOrderRuntime?.daySeed ?? Math.floor(Math.random() * 0xffffffff) + 1);
async function resolveClaimedGrillSlotCount() {
  if (!['d4', 'd5'].includes(ACTIVE_DAY_ID)) return 2;
  try {
    // 업그레이드는 프리오픈 체크포인트에 먼저 저장된다. 영업 도메인을 부팅하기 전에 같은
    // 저장을 검증해 읽어야 세 번째 슬롯의 mesh·sprite·shader가 첫 프레임부터 함께 생긴다.
    const reader = new S0D3CampaignBridge({ browserStorage: window.localStorage });
    const loaded = await reader.loadOrStart();
    if (!loaded.ok) return 2;
    return reader.getState()?.progression?.claimedGrillSlots >= 3 ? 3 : 2;
  } catch {
    return 2;
  }
}
const configuredGrillSlotCount = await resolveClaimedGrillSlotCount();
const activeGrillLayout = configuredGrillSlotCount >= 3
  ? D4_PUBLIC_GRILL_LAYOUT
  : D1_PUBLIC_GRILL_LAYOUT;
const cook = createD1CookStations({ slots: configuredGrillSlotCount });
if (restoredFirstOrderRuntime?.cook) {
  cook.restore(restoredFirstOrderRuntime.cook, performance.now());
  cook.setSlots(configuredGrillSlotCount);
}
const SLOT_KEYS = GRILL_SLOT_KEYS.slice(0, cook.slotCount());
R.setGrillSlots(activeGrillLayout);
document.body.dataset.grillSlotCount = String(configuredGrillSlotCount);
const grillSmoke = createGrillSmokeVfx({
  scene: R.scene,
  slotMeshes: SLOT_KEYS.map((key) => R.objectMesh[key]),
});
let glassPlaced = restoredFirstOrderRuntime?.glassPlaced === true;
const grillMats = {};
const rawNegimaInstances = {};
const assemblyNegimaInstances = {
  build: null,
  tray: [],
};
const momoInstances = {
  grill: {},
  build: null,
  tray: [],
};
const kawaInstances = {
  grill: {},
  build: null,
  tray: [],
};
const momoRuntime = {
  status: ACTIVE_DAY_ID === 'd1' ? 'disabled' : 'loading',
  error: null,
};
const kawaRuntime = {
  status: ACTIVE_DAY_ID === 'd5' ? 'loading' : 'disabled',
  error: null,
};
document.body.dataset.d2MomoBindingStatus = momoRuntime.status;
document.body.dataset.d5KawaBindingStatus = kawaRuntime.status;
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

async function bootMomoRuntime() {
  if (ACTIVE_DAY_ID === 'd1') return;
  try {
    const runtime = await loadD2MomoSpriteRuntime();
    for (const key of SLOT_KEYS) {
      const slotMesh = R.objectMesh[key];
      if (!slotMesh) throw new Error(`모모 그릴 slot mesh 누락: ${key}`);
      const instance = runtime.createGrillInstance(
        slotMesh,
        D1_GRILL_FOOD_FOOTPRINT.sourceModelTransform,
      );
      momoInstances.grill[key] = instance;
      R.scene.add(instance.holder);
    }
    const buildMesh = R.objectMesh[D1_ASSEMBLY_BUILD_SLOT.key];
    if (!buildMesh) throw new Error('모모 조립 지그 mesh 누락');
    momoInstances.build = runtime.createAssemblyInstance(
      buildMesh,
      D1_ASSEMBLY_BUILD_SLOT.sourceModelTransform,
    );
    R.scene.add(momoInstances.build.holder);
    for (const [index, slot] of D1_ASSEMBLY_TRAY_SLOTS.entries()) {
      const trayMesh = R.objectMesh[slot.key];
      if (!trayMesh) throw new Error(`모모 조립 트레이 mesh 누락: ${slot.key}`);
      const instance = runtime.createTrayInstance(trayMesh, slot.sourceModelTransform);
      momoInstances.tray.push(instance);
      R.scene.add(instance.holder);
    }
    momoRuntime.status = runtime.status;
    document.body.dataset.d2MomoBindingStatus = momoRuntime.status;
    render();
  } catch (error) {
    momoRuntime.status = 'failed';
    momoRuntime.error = error;
    document.body.dataset.d2MomoBindingStatus = 'failed';
    console.error('D2 모모 후보 아트 로드 실패:', error);
  }
}
void bootMomoRuntime();

async function bootKawaRuntime() {
  if (ACTIVE_DAY_ID !== 'd5') return;
  try {
    const runtime = await loadD5KawaSpriteRuntime();
    for (const key of SLOT_KEYS) {
      const slotMesh = R.objectMesh[key];
      if (!slotMesh) throw new Error(`토리카와 그릴 slot mesh 누락: ${key}`);
      const instance = runtime.createGrillInstance(
        slotMesh,
        D1_GRILL_FOOD_FOOTPRINT.sourceModelTransform,
      );
      kawaInstances.grill[key] = instance;
      R.scene.add(instance.holder);
    }
    const buildMesh = R.objectMesh[D1_ASSEMBLY_BUILD_SLOT.key];
    if (!buildMesh) throw new Error('토리카와 조립 지그 mesh 누락');
    kawaInstances.build = runtime.createAssemblyInstance(
      buildMesh,
      D1_ASSEMBLY_BUILD_SLOT.sourceModelTransform,
    );
    R.scene.add(kawaInstances.build.holder);
    for (const slot of D1_ASSEMBLY_TRAY_SLOTS) {
      const trayMesh = R.objectMesh[slot.key];
      if (!trayMesh) throw new Error(`토리카와 조립 트레이 mesh 누락: ${slot.key}`);
      const instance = runtime.createTrayInstance(trayMesh, slot.sourceModelTransform);
      kawaInstances.tray.push(instance);
      R.scene.add(instance.holder);
    }
    kawaRuntime.status = runtime.status;
    document.body.dataset.d5KawaBindingStatus = kawaRuntime.status;
    render();
  } catch (error) {
    kawaRuntime.status = 'failed';
    kawaRuntime.error = error;
    document.body.dataset.d5KawaBindingStatus = 'failed';
    console.error('D5 토리카와 아트 로드 실패:', error);
  }
}
void bootKawaRuntime();
const grillStatusLayer = el('grillStatusLayer');
const grillInventory = el('grillInventory');
const grillWaitingNegima = el('grillWaitingNegima');
const grillWaitingNegimaHint = el('grillWaitingNegimaHint');
const grillWaitingNegimaCount = el('grillWaitingNegimaCount');
const grillWaitingMomo = el('grillWaitingMomo');
const grillWaitingMomoHint = el('grillWaitingMomoHint');
const grillWaitingMomoCount = el('grillWaitingMomoCount');
const grillWaitingKawa = el('grillWaitingKawa');
const grillWaitingKawaHint = el('grillWaitingKawaHint');
const grillWaitingKawaCount = el('grillWaitingKawaCount');
const grillWaitingActions = Object.freeze({
  negima: Object.freeze({ salt: el('grillWaitingNegimaSalt'), tare: el('grillWaitingNegimaTare') }),
  momo: Object.freeze({ salt: el('grillWaitingMomoSalt'), tare: el('grillWaitingMomoTare') }),
  kawa: Object.freeze({ salt: el('grillWaitingKawaSalt'), tare: el('grillWaitingKawaTare') }),
});
const grillWaitingActionCounts = Object.freeze({
  negima: Object.freeze({ salt: el('grillWaitingNegimaSaltCount'), tare: el('grillWaitingNegimaTareCount') }),
  momo: Object.freeze({ salt: el('grillWaitingMomoSaltCount'), tare: el('grillWaitingMomoTareCount') }),
  kawa: Object.freeze({ salt: el('grillWaitingKawaSaltCount'), tare: el('grillWaitingKawaTareCount') }),
});
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
for (const [menuId, actions] of Object.entries(grillWaitingActions)) {
  for (const [seasoning, button] of Object.entries(actions)) {
    button.addEventListener('click', () => invokeLockedControl(`grillWait:${menuId}:${seasoning}`));
  }
}
const dockShelf = el('dockShelf');
const dock = createPreparedDock({ container: dockShelf });
let instantStation = createInstantServiceStation();
let highballStation = createHighballStation({ snapshot: restoredFirstOrderRuntime?.highball });
// D4부터 두 음료 공정을 같은 장면에 상시 노출한다. 이전 graybox의 tab 상태는 읽지 않는다.
const drinkMode = ['d4', 'd5'].includes(ACTIVE_DAY_ID) ? 'combined' : 'beer';
const assemblyRecipePicker = el('assemblyRecipePicker');
for (const button of assemblyRecipePicker.querySelectorAll('[data-menu-id]')) {
  button.addEventListener('click', () => {
    const result = cook.selectRecipe(button.dataset.menuId);
    if (!result.ok) {
      showHint(result.reason === 'assembly-in-progress'
        ? '지금 조립 중인 꼬치를 먼저 완성하세요'
        : '아직 고를 수 없는 꼬치입니다');
      return;
    }
    persistFirstOrderRuntime();
    render();
  });
}
const assemblyTareCursor = el('assemblyTareCursor');
const assemblyTarePot = el('assemblyTarePot');
const assemblyTarePotArt = el('assemblyTarePotArt');
const ASSEMBLY_TARE_ZONE_COUNT = 10;
const ASSEMBLY_TARE_MIN_COVERAGE = 0.8;
const assemblyTarePaintedZones = new Set();
const assemblyTareKeyboardDirections = new Set();
let assemblyTareModeSelected = false;
let assemblyTarePointerId = null;
let assemblyTareLastZone = null;

function objectScreenPoint(key) {
  const point = new THREE.Vector3();
  R.objectMesh[key]?.getWorldPosition(point);
  return R.projectToScreen(point);
}

function assemblyTareTargetBounds() {
  const center = objectScreenPoint('jigSkewer');
  const halfWidth = Math.min(250, window.innerWidth * 0.2);
  return { left: center.x - halfWidth, right: center.x + halfWidth, top: center.y - 70, bottom: center.y + 70 };
}

function assemblyTareReady() {
  const progress = cook.assemblyProgress();
  return director.activeScreenId() === 'SCR-SVC-ASSEMBLY'
    && assemblyTareModeSelected
    && progress.complete
    && progress.seasoning === 'tare'
    && progress.tarePrepared !== true;
}

function updateAssemblyTareCoverage(coverage) {
  const normalized = Math.max(0, Math.min(1, Number(coverage) || 0));
  const percent = Math.round(normalized * 100);
  el('assemblyTareFill').style.width = `${percent}%`;
  const meter = el('assemblyTareFill').parentElement;
  meter.setAttribute('aria-valuenow', String(percent));
  meter.setAttribute('aria-valuetext', `타레 도포 ${percent}%`);
}

function paintAssemblyTareAt(clientX, clientY) {
  const bounds = assemblyTareTargetBounds();
  const insideTarget = clientX >= bounds.left && clientX <= bounds.right
    && clientY >= bounds.top && clientY <= bounds.bottom;
  if (!insideTarget) {
    assemblyTareLastZone = null;
    return;
  }
  const position = Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.right - bounds.left)));
  const zone = Math.min(ASSEMBLY_TARE_ZONE_COUNT - 1, Math.floor(position * ASSEMBLY_TARE_ZONE_COUNT));
  const from = assemblyTareLastZone == null ? zone : Math.min(zone, assemblyTareLastZone);
  const to = assemblyTareLastZone == null ? zone : Math.max(zone, assemblyTareLastZone);
  for (let index = from; index <= to; index += 1) assemblyTarePaintedZones.add(index);
  assemblyTareLastZone = zone;
  const coverage = assemblyTarePaintedZones.size / ASSEMBLY_TARE_ZONE_COUNT;
  assemblyTareCursor.dataset.coverage = String(coverage);
  updateAssemblyTareCoverage(coverage);
}

function commitAssemblyTareBrush(coverage) {
  const result = cook.brushAssemblyTare(coverage);
  if (!result.ok) {
    if (result.reason === 'insufficient-coverage') persistFirstOrderRuntime();
    showHint(result.reason === 'insufficient-coverage'
      ? '꼬치 전체에 닿도록 붓을 왼쪽 끝부터 오른쪽 끝까지 움직여 주세요'
      : '타레 소스통을 먼저 선택해 주세요');
    updateAssemblyTareCoverage(result.coverage ?? coverage);
    return false;
  }
  assemblyTareModeSelected = false;
  assemblyTareKeyboardDirections.clear();
  sfx('SFX-TARE-BRUSH');
  showHint('타레를 고르게 발랐어요 · 꼬치를 눌러 전달 트레이로 옮기세요');
  assemblyTarePaintedZones.clear();
  persistFirstOrderRuntime();
  render();
  return true;
}

function finishAssemblyTareBrush(event) {
  if (assemblyTarePointerId == null || (event.pointerId != null && event.pointerId !== assemblyTarePointerId)) return;
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
  assemblyTareCursor.classList.remove('is-brushing');
  const coverage = assemblyTarePaintedZones.size / ASSEMBLY_TARE_ZONE_COUNT;
  assemblyTarePointerId = null;
  assemblyTareLastZone = null;
  commitAssemblyTareBrush(coverage);
}

assemblyTarePot.addEventListener('click', () => {
  const progress = cook.assemblyProgress();
  if (!progress.complete) {
    showHint('꼬치를 먼저 끝까지 조립해 주세요');
    return;
  }
  if (progress.tarePrepared) {
    showHint('타레 도포가 끝났어요 · 꼬치를 눌러 전달 트레이로 옮기세요');
    return;
  }
  if (assemblyTareModeSelected) {
    const result = cook.selectAssemblySeasoning('salt');
    if (!result.ok) return;
    assemblyTareModeSelected = false;
    assemblyTarePaintedZones.clear();
    assemblyTareKeyboardDirections.clear();
    showHint('타레 붓을 내려놓았어요 · 꼬치를 누르면 소금 꼬치로 옮깁니다');
  } else {
    const result = progress.seasoning === 'tare'
      ? { ok: true }
      : cook.selectAssemblySeasoning('tare');
    if (!result.ok) return;
    assemblyTareModeSelected = true;
    assemblyTarePaintedZones.clear();
    assemblyTareKeyboardDirections.clear();
    updateAssemblyTareCoverage(0);
    showHint('타레 붓을 들었어요 · 조립한 꼬치 위를 한 번 좌우로 끝까지 칠하세요');
  }
  persistFirstOrderRuntime();
  render();
});

assemblyTarePot.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !assemblyTareReady()) return;
  event.preventDefault();
  assemblyTareKeyboardDirections.add(event.key);
  const offset = event.key === 'ArrowLeft' ? 0 : ASSEMBLY_TARE_ZONE_COUNT / 2;
  for (let index = 0; index < ASSEMBLY_TARE_ZONE_COUNT / 2; index += 1) {
    assemblyTarePaintedZones.add(offset + index);
  }
  const coverage = assemblyTarePaintedZones.size / ASSEMBLY_TARE_ZONE_COUNT;
  updateAssemblyTareCoverage(coverage);
  if (coverage >= ASSEMBLY_TARE_MIN_COVERAGE) commitAssemblyTareBrush(coverage);
  else showHint('반대 방향 화살표도 눌러 꼬치 전체를 칠하세요');
});

document.addEventListener('pointermove', (event) => {
  if (!assemblyTareReady()) return;
  assemblyTareCursor.style.left = `${event.clientX}px`;
  assemblyTareCursor.style.top = `${event.clientY}px`;
  if (event.pointerId === assemblyTarePointerId) paintAssemblyTareAt(event.clientX, event.clientY);
});
document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target !== canvas || !assemblyTareReady()) return;
  const bounds = assemblyTareTargetBounds();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  assemblyTarePointerId = event.pointerId;
  assemblyTarePaintedZones.clear();
  assemblyTareLastZone = null;
  assemblyTareCursor.classList.add('is-brushing');
  canvas.setPointerCapture?.(event.pointerId);
  paintAssemblyTareAt(event.clientX, event.clientY);
}, true);
document.addEventListener('pointerup', finishAssemblyTareBrush, true);
document.addEventListener('pointercancel', finishAssemblyTareBrush, true);
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
      dayId: ACTIVE_DAY_ID,
      cook: cook.snapshot(performance.now()),
      dock: dock.snapshot(),
      glassPlaced,
      highball: highballStation.snapshot(),
      drinkMode,
      daySeed,
    }));
  } catch {
    // 저장 공간 실패는 campaign 저장을 덮어쓰지 않으며 현재 세션 진행은 유지한다.
  }
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
  'binTorikawa',
  'jigSkewer',
  'grillWaitTray',
  ...SLOT_KEYS,
  'grillFinishedTray',
  'glassRack',
  'drinkLeverDrag',
]);

// ── D1BusinessDayUiPort 화면 소비 상태 ───────────────────────
const ORDER_ICON = {
  '생맥주': '/assets/core/ui/order-icon-draft-beer-r1-b1.png',
  '네기마': '/assets/core/ui/order-icon-negima-r1-b1.png',
  '모모': D2_MOMO_RUNTIME_URLS.order,
  '소금 모모': D2_MOMO_RUNTIME_URLS.order,
  '타레 모모': D2_MOMO_RUNTIME_URLS.order,
  '토리카와': D5_KAWA_RUNTIME_URLS.order,
  '소금 토리카와': D5_KAWA_RUNTIME_URLS.order,
  '타레 토리카와': D5_KAWA_RUNTIME_URLS.order,
};
const PHASE_LABEL = {
  open: '영업 중',
  'closing-drain': '마감 정리',
  'charcoal-down': '숯불',
  settlement: '정산',
  complete: '다음 날 준비',
};
const EXTRA_ASSET = {
  office: 'CH-EXTRA-COMMUTER-SERVICE',
  solo: 'CH-EXTRA-SOLO-SERVICE',
};
const EXTRA_ACTOR_FRAME = Object.freeze({
  officeFullBody: Object.freeze({ scale: 1, offsetY: 256 / 1080 }),
  officePortrait: Object.freeze({ scale: 1, offsetY: 256 / 1080 }),
  solo: Object.freeze({ scale: 1, offsetY: 256 / 1080 }),
  empty: Object.freeze({ scale: 1, offsetY: 0 }),
});

function officeActorFrame(customerId) {
  const base = ['a', 'b'].includes(d1OfficeCustomerVariant(customerId))
    ? EXTRA_ACTOR_FRAME.officeFullBody
    : EXTRA_ACTOR_FRAME.officePortrait;
  // 캔버스 중앙에서 벗어나 그려진 승인 라스터(developer A/B)를 좌석 중심으로 되돌린다.
  return { ...base, offsetX: d1OfficeActorOffsetX(customerId) };
}
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
const runtimeSuspensionReasons = new Set();
let animationFrameId = null;
let suspensionStartedAt = null;
let suspendedVisualOffsetMs = 0;

// 연출 시계. 손님 식사 프레임처럼 "몇 번째 그림을 보여줄지"를 정하는 쪽은 전부 이걸 쓴다.
// rAF와 render()가 각자 performance.now()를 읽으면, 정지 구간만큼 어긋난 두 시계가 같은 초에
// 서로 다른 프레임을 골라 매 rAF 덮어써서 그림이 지지직거린다. 정지 중에는 멈춘 값을 준다.
function visualNowMs(now = performance.now()) {
  return (suspensionStartedAt ?? now) - suspendedVisualOffsetMs;
}

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
  setRuntimeSuspended('story-cutscene', true);
  render();
  el('departureCutsceneContinue').focus();
  return true;
}

function closeTsukiokaDepartureCutscene() {
  if (!departureCutsceneActive) return false;
  departureCutsceneActive = false;
  el('departureCutscene').hidden = true;
  delete document.body.dataset.departureCutscene;
  setRuntimeSuspended('story-cutscene', false);
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
  return Boolean(selected && canServeD1MenuToSeat(seat, selected));
}

function openServeQuantity(seatId) {
  const selected = dock.selected();
  if (!selected) {
    showHint('요리 서빙대나 음료 픽업대에서 낼 완성품을 고르세요');
    return;
  }
  const seat = seatView(seatId);
  if (!seatCanReceiveSelected(seat, selected)) {
    showHint(`선택한 ${selected.menu} 주문이 남은 손님을 고르세요`);
    return;
  }
  pendingServeSeatId = seatId;
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
    render();
    return;
  }
  const menuId = selected.menuId ?? menuIdForLabel(selected.menu);
  const matchingLine = seat.remainingItems.find((item) => (
    item.menuId === menuId
    && (item.seasoning === 'tare' ? selected.seasoning === 'tare' : selected.seasoning !== 'tare')
  ));
  const remaining = matchingLine?.remaining ?? 0;
  const available = dock.items().filter((item) => (
    item.menuId === menuId && item.seasoning === selected.seasoning
  )).length;
  const count = all ? Math.min(remaining, available) : Math.min(1, remaining, available);
  let applied = 0;
  let lastResult = null;
  for (let index = 0; index < count; index += 1) {
    const item = dock.items().find((candidate) => (
      candidate.menuId === menuId && candidate.seasoning === selected.seasoning
    ));
    if (!item) break;
    lastResult = dispatchBusiness(D1_UI_INTENT.SERVE_ITEM, {
      seatId: pendingServeSeatId,
      menuId: item.menuId,
      seasoning: item.seasoning ?? null,
      quality: item.quality,
    });
    if (!lastResult.ok || !lastResult.applied) break;
    dock.consumeMenuId(item.menuId, 1, item.seasoning);
    applied += 1;
  }
  persistFirstOrderRuntime();
  closeServeQuantity();
  showHint(lastResult?.completedOrder ? '최종 제공 완료 · 총 3항목' : `부분 제공 · ${applied}개 전달`);
  render();
}

function acceptGroupOrders(seat) {
  const view = businessView();
  const groupSeats = view?.seats.filter((candidate) => (
    candidate.occupied && candidate.groupId === seat.groupId
  )) ?? [];
  if (groupSeats.length < 2 || !groupSeats.every((candidate) => candidate.canOrder)) {
    showHint('동행이 주문을 고르는 중입니다');
    return false;
  }
  const uniqueOrderIds = [...new Set(groupSeats.map((candidate) => candidate.orderId).filter(Boolean))];
  if (view.limits.activeOrderCount + uniqueOrderIds.length > view.limits.maxActiveOrders) {
    showHint('현재 처리 중인 주문을 먼저 마무리하세요');
    return false;
  }
  const results = uniqueOrderIds.map((orderId) => dispatchBusiness(D1_UI_INTENT.ACCEPT_ORDER, {
    orderId,
  }));
  if (!results.every((result) => result.ok && result.applied)) return false;
  persistFirstOrderRuntime();
  showHint('그룹 주문 접수');
  return true;
}

function activateSeat(seatId) {
  const seat = seatView(seatId);
  if (!seat) return;
  if (seat.canOrder) {
    if (seat.groupId) {
      acceptGroupOrders(seat);
      return;
    }
    const result = dispatchBusiness(D1_UI_INTENT.ACCEPT_ORDER, { seatId });
    if (result.ok) {
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
  const menuLabel = MENU_META[slot.menuId]?.label ?? '꼬치';
  const seasonedLabel = `${slot.seasoning === 'tare' ? '타레' : '소금'} ${menuLabel}`;
  if (slot.status === 'staged') {
    return {
      face: `${seasonedLabel} · 저장 상태 복구 중`,
      icon: { symbol: '·', className: 'airborne' },
      action: '앞면 조리를 다시 시작합니다',
    };
  }
  if (slot.flipping) {
    return {
      face: `${seasonedLabel} · 뒤집는 중`,
      icon: { symbol: '↻', className: 'airborne' },
      action: '꼬치가 돌아가는 중입니다',
    };
  }
  if (slot.nextAction === COOK_SLOT_NEXT_ACTION.RETRIEVE) {
    return {
      face: `${seasonedLabel} · 양면 굽기 완료`,
      icon: { symbol: '✓', className: 'back' },
      action: '다 익었어요 · 꼬치를 눌러 꺼내세요',
    };
  }

  const flipped = slot.contactFace === 'back';
  const face = `${seasonedLabel} · ${flipped ? '뒤집은 면 굽는 중' : '첫 면 굽는 중'}`;
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
  views.forEach((slot, index) => {
    const ui = grillStatusEls[index];
    const active = slot.status !== 'empty';
    ui.card.hidden = !active;
    if (!active) return;
    const copy = grillStatusCopy(slot);
    ui.card.dataset.contactFace = slot.contactFace ?? 'none';
    ui.card.dataset.flipping = String(slot.flipping);
    ui.card.dataset.nextAction = slot.nextAction;
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
    ? `선택 완성품 · ${selected.menu}${selected.label ? ` · ${selected.label}` : ''}`
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
  drinkTower: '맥주 타워', glassRack: '빈 잔',
  drinkLeverDrag: '레버',
};
OBJECT_LABELS.binTorikawa = '닭껍질';
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
const beerHint = el('beerHint');
const GLASS_PX = 150;
drinkPanel.querySelector('.target-line').style.bottom = `${GLASS_PX}px`;
const beerPanel = el('beerPanel');
const highballPanel = el('highballPanel');
const highballGuide = el('highballGuide');
const highballWorktop = highballPanel.querySelector('.highball-worktop');
const highballVisual = el('highballVisual');
const highballLiquid = el('highballLiquid');
const highballHint = el('highballHint');
const highballOverflow = el('highballOverflow');
const highballBottleButtons = [...highballPanel.querySelectorAll('[data-liquid]')];
const highballGaugeWhiskey = highballGuide.querySelector('[data-testid="highball-gauge-whiskey"]');
const highballGaugeSoda = highballGuide.querySelector('[data-testid="highball-gauge-soda"]');
const highballReadout = el('highballReadout');
const highballStamp = el('highballStamp');
const HIGHBALL_ART_URLS = [
  '/assets/campaign/d4/prop-highball-workstation-base-draft-r8.png',
  '/assets/campaign/d4/prop-highball-glass-draft-r3.png',
  '/assets/campaign/d4/prop-highball-ice-fill-draft-r2.png',
  '/assets/campaign/d4/prop-highball-bottles-draft-r1.png',
];
const BEER_GLASS_DECK_ALPHA_BOTTOM = 796 / 941;
const HIGHBALL_WORKTOP_ALPHA_BOTTOM = 901 / 1024;

Promise.allSettled(HIGHBALL_ART_URLS.map((src) => {
  const image = new Image();
  image.decoding = 'sync';
  image.fetchPriority = 'high';
  image.src = src;
  return image.decode();
})).then(() => {
  highballPanel.classList.add('is-art-ready');
  render();
});

function beerGlassDeckBaselinePx() {
  return R.projectArtUvAtPreset?.(
    'drinkGlassDeck',
    0.5,
    BEER_GLASS_DECK_ALPHA_BOTTOM,
  )?.y ?? window.innerHeight * 0.71;
}

function alignHighballPanelToBeerGlassDeck() {
  // 기준선은 변형과 무관해야 한다. getBoundingClientRect는 transform까지 반영하므로
  // 레이아웃 높이(offsetHeight)만 읽는다.
  const worktopHeight = highballWorktop.offsetHeight;
  const top = beerGlassDeckBaselinePx()
    - (worktopHeight * HIGHBALL_WORKTOP_ALPHA_BOTTOM);
  highballPanel.style.setProperty('--highball-panel-top', `${top.toFixed(3)}px`);
}

function highballActionMessage(reason) {
  return {
    'glass-required': '빈 잔을 먼저 놓으세요',
    'ice-required': '얼음을 먼저 넣으세요',
    'both-liquids-required': '위스키와 탄산수를 모두 따라 주세요',
    'overflow-decision-required': '넘친 잔을 계속 쓸지 먼저 정하세요',
  }[reason] ?? '지금은 그 조작을 할 수 없어요';
}

// 납품 음원이 조작보다 길어도 단발음은 2초에서 끊는다. 생맥주 잔 덱과 같은 규칙이다.
const HIGHBALL_ONE_SHOT_SFX_SEC = 2;

// 하이볼 잔 덱도 생맥주 잔 덱과 같은 소리를 낸다. 같은 조작이므로 같은 소리여야 한다.
function playGlassDeckSfx() {
  sfx('SFX-DRINK-GLASS-SET', { maxSec: GLASS_RACK_SFX_SEC });
  sfx('SFX-DRINK-TRAY-TAP', { maxSec: GLASS_RACK_SFX_SEC });
}

// 완성된 잔을 눌러 픽업대로 보낸다.
el('highballPickup').addEventListener('click', () => {
  if (pickUpHighball()) playGlassDeckSfx();
});

el('highballGlass').addEventListener('click', () => {
  const result = highballStation.placeGlass();
  if (result.ok) playGlassDeckSfx();
  showHint(result.ok ? '오른쪽 보관대에서 하이볼 잔을 가져왔어요' : '이미 잔이 놓여 있어요');
  persistFirstOrderRuntime();
  render();
});
el('highballIce').addEventListener('click', () => {
  const result = highballStation.addIce();
  if (result.ok) {
    sfx('SFX-DRINK-ICE-SCOOP', { maxSec: HIGHBALL_ONE_SHOT_SFX_SEC });
    sfx('SFX-DRINK-ICE-SETTLE', { maxSec: HIGHBALL_ONE_SHOT_SFX_SEC });
  }
  showHint(result.ok ? '얼음을 채웠어요' : highballActionMessage(result.reason));
  persistFirstOrderRuntime();
  render();
});

function beginHighballPour(button, now = performance.now()) {
  const result = highballStation.press(button.dataset.liquid, now);
  if (!result.ok) {
    showHint(highballActionMessage(result.reason));
    return false;
  }
  button.classList.add('is-pouring');
  // 병을 누르고 있는 동안 물줄기가 이어진다. 탄산수 루프에는 기포음이 함께 구워져 있다.
  loopOn(button.dataset.liquid === 'whiskey' ? 'SFX-DRINK-WHISKEY-POUR' : 'SFX-DRINK-SODA-POUR');
  render();
  return true;
}

function stopHighballPourLoops() {
  loopOff('SFX-DRINK-WHISKEY-POUR');
  loopOff('SFX-DRINK-SODA-POUR');
}

function releaseHighballPour(now = performance.now()) {
  const released = highballStation.release(now);
  highballBottleButtons.forEach((button) => button.classList.remove('is-pouring'));
  stopHighballPourLoops();
  if (released) {
    sfx('SFX-DRINK-BOTTLE-SET', { maxSec: HIGHBALL_ONE_SHOT_SFX_SEC });
    persistFirstOrderRuntime();
  }
  return released;
}

for (const button of highballBottleButtons) {
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !beginHighballPour(button)) return;
    button.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  button.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || event.repeat) return;
    if (beginHighballPour(button)) event.preventDefault();
  });
  button.addEventListener('keyup', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    releaseHighballPour();
  });
}
window.addEventListener('pointerup', () => releaseHighballPour());
window.addEventListener('pointercancel', () => releaseHighballPour());

// 완성 잔을 집어 음료 픽업대에 올린다. 생맥주의 '완성'과 같은 자리다.
function pickUpHighball() {
  const result = highballStation.pickUp();
  if (!result.ok) return false;
  const quality = result.completed.quality;
  dock.add({
    menuId: 'highball',
    menu: '하이볼',
    quality,
    good: quality === 'Perfect' || quality === 'Good',
    zone: 'drink',
  });
  persistFirstOrderRuntime();
  showHint('하이볼을 음료 픽업대에 올렸어요');
  render();
  return true;
}

el('highballLemon').addEventListener('click', () => {
  const result = highballStation.addLemon();
  if (!result.ok) {
    showHint(highballActionMessage(result.reason));
    return;
  }
  sfx('SFX-DRINK-LEMON-DROP', { maxSec: HIGHBALL_ONE_SHOT_SFX_SEC });
  persistFirstOrderRuntime();
  showHint(`${result.completed.quality} 하이볼 완성 · 잔을 눌러 픽업대에 올리세요`);
  render();
});
highballOverflow.querySelector('[data-highball-act="serve-low"]').addEventListener('click', () => {
  highballStation.acceptOverflow();
  persistFirstOrderRuntime();
  showHint('낮은 품질로 계속합니다 · 레몬을 올려 마무리하세요');
  render();
});
highballOverflow.querySelector('[data-highball-act="discard"]').addEventListener('click', () => {
  highballStation.discard();
  persistFirstOrderRuntime();
  showHint('하이볼 잔을 폐기했어요');
  render();
});

function updateHighballPanel(show) {
  const state = highballStation.view();
  highballPanel.hidden = !show;
  highballGuide.hidden = !show || !highballPanel.classList.contains('is-art-ready');
  if (!show) {
    highballGuide.classList.remove('is-overflow');
    return;
  }
  alignHighballPanelToBeerGlassDeck();
  const hasWhiskey = state.whiskeyUnits > 0.001;
  const hasSoda = state.sodaUnits > 0.001;
  const fillPercent = Math.min(85, state.fillRatio * 85);
  highballVisual.hidden = !state.glassPlaced;
  highballVisual.classList.toggle('has-ice', state.iceAdded);
  highballVisual.classList.toggle('has-whiskey', hasWhiskey);
  highballVisual.classList.toggle('has-soda', hasSoda);
  highballVisual.classList.toggle('is-mixed', hasWhiskey && hasSoda);
  highballVisual.classList.toggle('is-pouring-whiskey', state.activeLiquid === 'whiskey');
  highballVisual.classList.toggle('is-pouring-soda', state.activeLiquid === 'soda');
  highballVisual.classList.toggle('is-overflow', state.overflow);
  highballVisual.classList.toggle('is-overflow-accepted', state.overflowAccepted);
  // 레몬을 올려 완성한 잔에만 레몬 조각이 걸린다.
  highballVisual.classList.toggle('has-lemon', state.canPickUp === true);
  highballWorktop.classList.toggle('is-pouring-whiskey', state.activeLiquid === 'whiskey');
  highballWorktop.classList.toggle('is-pouring-soda', state.activeLiquid === 'soda');
  highballBottleButtons.forEach((button) => {
    button.classList.toggle('is-pouring', button.dataset.liquid === state.activeLiquid);
  });
  highballLiquid.style.height = `${fillPercent}%`;
  highballVisual.style.setProperty('--highball-fill', state.fillRatio.toFixed(4));
  highballVisual.style.setProperty(
    '--highball-whiskey-share',
    state.totalUnits > 0 ? (state.whiskeyUnits / state.totalUnits).toFixed(4) : '0',
  );
  highballVisual.style.setProperty(
    '--highball-soda-share',
    state.totalUnits > 0 ? (state.sodaUnits / state.totalUnits).toFixed(4) : '0',
  );
  highballVisual.setAttribute(
    'aria-label',
    `하이볼 잔 ${Math.round(state.fillRatio * 100)}% · 위스키 ${state.whiskeyUnits.toFixed(1)} · 탄산수 ${state.sodaUnits.toFixed(1)}`,
  );
  if (state.overflow || state.canPickUp) stopHighballPourLoops();
  highballOverflow.hidden = !state.overflow;
  highballGuide.classList.toggle('is-overflow', state.overflow);
  highballHint.hidden = state.overflow;
  // 완성 잔이 올라와 있으면 같은 자리가 '픽업대에 올리기' 버튼이 된다.
  const readyToPick = state.canPickUp === true;
  el('highballPickup').hidden = !readyToPick;
  el('highballGlass').disabled = state.glassPlaced;
  el('highballIce').disabled = readyToPick || !state.glassPlaced || state.iceAdded;
  el('highballLemon').disabled = !state.canAddLemon;
  updateHighballGauge(state);
  highballHint.textContent = readyToPick
    ? `${state.readyQuality} 하이볼 완성 · 잔을 눌러 픽업대에 올리세요`
    : state.activeLiquid === 'whiskey'
      ? '위스키 따르는 중'
      : state.activeLiquid === 'soda'
        ? '탄산수 따르는 중'
        : !state.glassPlaced
          ? '빈 잔을 가져오세요'
          : !state.iceAdded
            ? '얼음을 넣으세요'
            : state.canAddLemon
              ? '비율을 살피고 레몬으로 마무리하세요'
              : '위스키와 탄산수 병을 눌러 따르세요';
}

// 지금까지 따라진 양을 생맥주 잔 게이지와 같은 방식으로 보여준다.
// 넘침 기준(4.8 단위)을 잔 전체 높이로 삼아 위스키를 아래, 탄산수를 그 위에 쌓는다.
function updateHighballGauge(state) {
  const cap = HIGHBALL_DEFAULT_CONFIG.overflowThresholdUnits;
  const whiskeyPercent = Math.max(0, Math.min(100, (state.whiskeyUnits / cap) * 100));
  const sodaPercent = Math.max(0, Math.min(100 - whiskeyPercent, (state.sodaUnits / cap) * 100));
  highballGaugeWhiskey.style.height = `${whiskeyPercent.toFixed(2)}%`;
  highballGaugeSoda.style.height = `${sodaPercent.toFixed(2)}%`;
  highballGaugeSoda.style.bottom = `${whiskeyPercent.toFixed(2)}%`;
  highballReadout.textContent = `위스키 ${state.whiskeyUnits.toFixed(1)} · 탄산수 ${state.sodaUnits.toFixed(1)}`
    + `${state.whiskeyUnits > 0 ? ` · 비율 1:${(state.sodaUnits / state.whiskeyUnits).toFixed(1)}` : ''}`;
  const quality = state.overflow ? 'Fail' : state.readyQuality;
  highballStamp.hidden = !quality;
  if (quality) {
    highballStamp.textContent = state.overflow ? '넘침' : quality;
    highballStamp.className = `stamp q-${quality}`;
  }
}

// 화면 전환 중에는 하이볼 작업대를 잠깐 감춘다.
//
// 예전에는 도착 카메라로 투영한 위치·배율을 DOM 패널에 얹어 3D 장면을 따라 날아 들어오게 했다.
// 그런데 카메라가 수렴하는 300ms 동안 작업대가 눈에 띄게 움직여(들어올 때 x +178px·배율 1.10에서
// 제자리로) 매번 "위치가 바뀐다"로 읽혔다. 생맥주 안내·하이볼 안내가 이미 전환 중 페이드로
// 처리되므로 작업대도 같은 방식으로 맞춘다. 자리는 항상 고정이다.
function updateHighballSceneMotion(activeScreen) {
  const drinkScreen = 'SCR-SVC-DRINK';
  const entering = director.isTransitioning()
    && activeScreen === drinkScreen
    && director.fromScreenId() !== drinkScreen;
  highballPanel.classList.toggle('is-scene-moving', entering);
  drinkPanel.classList.toggle('is-scene-moving', entering);
  highballPanel.classList.remove('is-scene-leaving');
}

function beerGuideMessage(state, combined) {
  if (!combined) return '중립 레버를 아래로 드래그=맥주 · 위로 드래그=거품';
  if (!glassPlaced) return '빈 잔을 놓으세요';
  if (state.active === 'beer') return '맥주 따르는 중';
  if (state.active === 'foam') return '거품 올리는 중';
  if (state.phase === 'ready') return '비율이 맞았어요 · 완성하세요';
  return '레버로 비율을 맞추세요';
}

function updateDrinkPanel(activeScreen, now = performance.now()) {
  const onDrinkScreen = activeScreen === 'SCR-SVC-DRINK';
  const combined = ['d4', 'd5'].includes(ACTIVE_DAY_ID);
  drinkPanel.classList.toggle('is-d4', combined);
  R.setObjectEnabled?.('drinkStation', true);
  R.setObjectEnabled?.('drinkGlassDeck', true);
  R.setObjectEnabled?.('glassRack', true);
  R.setObjectEnabled?.('drinkLeverDrag', true);
  R.setObjectEnabled?.('drinkPlacedGlass', glassPlaced);
  R.setObjectEnabled?.('drinkBeerLiquid', glassPlaced);
  R.setObjectEnabled?.('drinkBeerVfx', glassPlaced);
  drinkPanel.hidden = !onDrinkScreen;
  beerPanel.hidden = combined && !onDrinkScreen;
  updateHighballPanel(onDrinkScreen && combined);
  if (combined) updateHighballSceneMotion(activeScreen);
  const s = pour.state();
  const visualFill = drinkVisualFill(s);
  beerHint.textContent = beerGuideMessage(s, combined);
  beerPanel.classList.toggle('is-overflow', s.phase === 'overflow');
  beerLiquid?.setState({
    beerFill: visualFill.beerFill,
    foamFill: visualFill.foamFill,
    overflow: s.phase === 'overflow',
  });
  beerCoreVfx?.setState({
    active: s.active,
    foamFill: visualFill.foamFill,
    overflow: s.phase === 'overflow',
    finished: s.phase === 'ready' && s.beerOk && s.foamOk,
  });
  if (!onDrinkScreen) return;
  const beerH = visualFill.beerFill * GLASS_PX;
  const foamH = visualFill.foamFill * GLASS_PX;
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
    dock.add({ menuId: 'beer', menu: '생맥주', quality: q, good: q === 'Perfect' || q === 'Good', zone: 'drink' });
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
    dock.add({ menuId: 'beer', menu: '생맥주', quality: q, good: false, zone: 'drink' });
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

const instantPanel = el('instantPanel');
const instantArtScene = el('instantArtScene');
const cabbageSaladPrepare = el('cabbageSaladPrepare');
const cabbageSaladProgress = el('cabbageSaladProgress');
const instantMessage = el('instantMessage');

function beginInstantPreparation(now = performance.now()) {
  if (!['d4', 'd5'].includes(ACTIVE_DAY_ID) || director.activeScreenId() !== 'SCR-SVC-INSTANT') return false;
  if (!instantStation.begin(now)) return false;
  instantMessage.textContent = '사라다 담는 중';
  cabbageSaladPrepare.classList.add('is-holding');
  render();
  return true;
}

function releaseInstantPreparation() {
  const completed = instantStation.release();
  cabbageSaladPrepare.classList.remove('is-holding');
  if (!completed) instantMessage.textContent = '접시에 담으려면 2.5초 동안 계속 누르세요';
  render();
  return completed;
}

function cancelInstantPreparation() {
  const changed = instantStation.cancel();
  cabbageSaladPrepare.classList.remove('is-holding');
  if (changed) instantMessage.textContent = '담기를 취소했습니다 · 처음부터 다시 누르세요';
  return changed;
}

cabbageSaladPrepare.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !beginInstantPreparation()) return;
  cabbageSaladPrepare.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
cabbageSaladPrepare.addEventListener('pointerup', releaseInstantPreparation);
cabbageSaladPrepare.addEventListener('pointercancel', releaseInstantPreparation);
cabbageSaladPrepare.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key) || event.repeat) return;
  if (beginInstantPreparation()) event.preventDefault();
});
cabbageSaladPrepare.addEventListener('keyup', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  releaseInstantPreparation();
});

function updateInstantPanel(activeScreen) {
  const show = ['d4', 'd5'].includes(ACTIVE_DAY_ID) && activeScreen === 'SCR-SVC-INSTANT';
  instantPanel.hidden = !show;
  instantArtScene.hidden = !show;
  const state = instantStation.view();
  cabbageSaladProgress.style.setProperty('--instant-progress', `${state.ratio * 360}deg`);
  cabbageSaladProgress.setAttribute('aria-valuenow', String(Math.round(state.ratio * 100)));
  cabbageSaladPrepare.classList.toggle('is-holding', state.phase === 'holding');
}

// ── 상태 → 장면·HUD ──────────────────────────────────────────
const slotIndexOf = (key) => SLOT_KEYS.indexOf(key);
function shouldShow(key) {
  const active = director.activeScreenId();
  if (SCREEN_OF[key] !== active) return false;
  if (key === 'binChicken' && cook.selectedMenuId() === 'kawa') return false;
  if (key === 'binTorikawa') return ACTIVE_DAY_ID === 'd5' && cook.selectedMenuId() === 'kawa';
  const si = slotIndexOf(key);
  if (si >= 0) return si < cook.slotCount() && cook.slotViews(performance.now())[si].status !== 'empty';
  return true;
}

function extraKind(customerId) {
  if (/^D[1-5]-(OFFICE|COMMUTER)/.test(customerId ?? '')) return 'office';
  if (/^D[1-5]-SOLO/.test(customerId ?? '')) return 'solo';
  return null;
}

function tsukiokaArtFor(seat, nowMs) {
  if (!seat) return runtimeAssets.TSUKIOKA_WAITING;
  const view = businessView();
  const servedBeer = seatHasServedMenu(view, seat, 'beer')
    || seatHasServedMenu(view, seat, 'highball');
  // 사라다는 꼬치가 아니다. 여기 섞으면 사라다만 받은 손님이 꼬치를 먹는 그림이 된다.
  // 사라다 접시는 카운터 위에 따로 그려지고, 사람은 대기 자세로 남는다.
  const servedSkewer = seatHasServedMenu(view, seat, 'negima')
    || seatHasServedMenu(view, seat, 'momo')
    || seatHasServedMenu(view, seat, 'kawa');
  if (seat.phase === 'eating' || seat.phase === 'done') {
    if (servedBeer && servedSkewer) return resolveD1ReceivedEatingFrame(runtimeAssets, nowMs);
    if (servedBeer) return runtimeAssets.TSUKIOKA_PARTIAL_BEER;
    if (servedSkewer) return runtimeAssets.TSUKIOKA_RECEIVED_EATING;
  }
  const order = view?.orders.find((item) => item.orderId === seat.orderId);
  const partiallyServed = order?.lines.some((line) => line.served > 0)
    && order.lines.some((line) => line.remaining > 0);
  if (partiallyServed && servedBeer) return runtimeAssets.TSUKIOKA_PARTIAL_BEER;
  if (partiallyServed && servedSkewer) return runtimeAssets.TSUKIOKA_RECEIVED_EATING;
  return runtimeAssets.TSUKIOKA_WAITING;
}


function updateTsukiokaArt(nowMs = visualNowMs(), resolvedArt = null) {
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
  // 교대로 뜨는 짝 프레임(먹기 ↔ 마시기)을 미리 받아 둔다.
  for (const companion of art.companions ?? []) R.warmTexture(companion.url);
  const holdingBeer = art.id === runtimeAssets.TSUKIOKA_PARTIAL_BEER.id
    || art.frameRole === 'drink-frame';
  // actor 프레임은 매 rAF마다 바뀐다. 같은 프레임에서 테이블 잔도 함께 숨겨
  // 손과 테이블에 잔이 한 프레임이라도 중복되는 현상을 막는다.
  R.setSeatBeerVisible(seat.seatId, (
    seatHasServedMenu(view, seat, 'beer') || seatHasServedMenu(view, seat, 'highball')
  ) && !holdingBeer);
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
  // 퇴장 컷신은 첫 손님 한 사람만 담는 장면이다. 그동안은 다음 손님을 그리지 않는다.
  // 첫 손님 아트는 화면 가운데를 통째로 쓰기 때문에, 같이 그리면 서로 겹친다.
  const onCustomers = director.activeScreenId() === 'SCR-SVC-CUSTOMERS'
    && !departureCutsceneActive;
  const nowMs = visualNowMs();
  const tsukiokaSeat = seats.find((item) => item.customerId === 'REGULAR_TSUKIOKA');
  // 좌석 배치는 두 가지 제약을 동시에 지켜야 한다.
  //
  // 1) 첫 손님이 오기 전부터 'tsukioka' 배치여야 한다. 그 사람의 그림은 좌석 좌표가 아니라 화면
  //    전체를 쓰는 전용 구도라, 배치가 어긋나면 몸은 저기 있는데 말풍선·접시·잔만 다른 자리에
  //    놓인다. 개점 순간엔 아직 아무도 없어 "츠키오카 자리가 없다"로 보이므로 등장 여부가
  //    아니라 '아직 다녀가지 않았다'로 판단한다.
  // 2) 바꾸는 순간 여섯 자리 좌표가 전부 다시 잡히므로, 앉아 있는 손님이 있으면 바꾸지 않는다.
  //    바꾸면 그 손님들이 그 자리에서 순간이동한다.
  if (tsukiokaSeat) tsukiokaSeatedBefore = true;
  const desiredSeatLayout = (tsukiokaSeat || !tsukiokaSeatedBefore)
    ? 'tsukioka'
    : 'centered-guests';
  if (seats.every((seat) => !seat.occupied)) R.setSeatLayoutMode(desiredSeatLayout);
  const tsukiokaArt = tsukiokaSeat ? tsukiokaArtFor(tsukiokaSeat, nowMs) : null;
  for (const seatId of SEAT_IDS) {
    const seat = seats.find((item) => item.seatId === seatId);
    const servedNegima = seatHasServedMenu(view, seat, 'negima');
    const servedMomo = seatHasServedMenu(view, seat, 'momo');
    const servedKawa = seatHasServedMenu(view, seat, 'kawa');
    const servedSalad = seatHasServedMenu(view, seat, 'cabbage-salad');
    const servedGrilledFood = servedNegima || servedMomo || servedKawa;
    // 손님 자세는 구운 꼬치를 받았을 때만 먹는 그림으로 바뀐다. 사라다는 접시만 놓인다.
    const servedSkewer = servedGrilledFood;
    const servedHighball = seatHasServedMenu(view, seat, 'highball');
    const servedBeer = seatHasServedMenu(view, seat, 'beer') || servedHighball;
    const kind = extraKind(seat?.customerId);
    const officeArt = kind === 'office'
      ? resolveD1OfficeCustomerFrame(runtimeAssets.COMMUTER_CUSTOMER, {
        customerId: seat.customerId,
        phase: seat.phase,
        servedNegima: servedSkewer,
        servedBeer,
        nowMs,
      })
      : null;
    const soloArt = kind === 'solo'
      ? resolveD1SoloCustomerFrame(runtimeAssets.SOLO_CUSTOMER, {
        servedSkewer,
        servedBeer,
        nowMs,
      })
      : null;
    const tsukiokaHoldingBeer = seat?.customerId === 'REGULAR_TSUKIOKA'
      && (tsukiokaArt?.id === runtimeAssets.TSUKIOKA_PARTIAL_BEER.id
        || tsukiokaArt?.frameRole === 'drink-frame');
    const officeHoldingBeer = isD1OfficeBeerFrame(officeArt);
    const soloHoldingBeer = isD1SoloBeerFrame(soloArt);
    const customerPresent = !!seat?.occupied
      && !seat.cleanupNeeded
      && !['empty', 'leaving', 'cleanup'].includes(seat.phase);
    const dirtyTable = Boolean(seat?.cleanupNeeded || seat?.phase === 'leaving');
    R.setSeatPlateUrl(
      seatId,
      servedKawa && !servedNegima
        ? D5_KAWA_RUNTIME_URLS.servedPlate
        : servedMomo && !servedNegima
          ? D2_MOMO_RUNTIME_URLS.servedPlate
        : '/assets/core/customer/pr-served-negima-plate-r2-b1.png',
    );
    R.setSeatFoodLayout(seatId, { grilled: servedGrilledFood, salad: servedSalad });
    R.setSeatPlateVisible(seatId, onCustomers && customerPresent && servedGrilledFood);
    R.setSeatSaladVisible(seatId, onCustomers && customerPresent && servedSalad);
    R.setSeatBeerUrl(
      seatId,
      servedHighball ? D4_MENU_ART_URLS.servedHighball : servedBeerCounterUrl,
    );
    R.setSeatBeerVisible(seatId, onCustomers && customerPresent
      && servedBeer && !tsukiokaHoldingBeer && !officeHoldingBeer && !soloHoldingBeer);
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
        for (const companion of officeArt?.companions ?? []) R.warmTexture(companion.url);
        R.setSeatActorTexture(seatId, officeArt?.url ?? runtimeAssets.COMMUTER_CUSTOMER.url);
        R.setSeatActorFrame(seatId, officeActorFrame(seat.customerId));
      } else if (kind === 'solo') {
        for (const companion of soloArt?.companions ?? []) R.warmTexture(companion.url);
        R.setSeatActorTexture(seatId, soloArt?.url ?? runtimeAssets.SOLO_CUSTOMER.url);
        R.setSeatActorFrame(seatId, EXTRA_ACTOR_FRAME.solo);
      } else if (actor.material.map) {
        actor.material.map = null;
        actor.material.needsUpdate = true;
        R.setSeatActorFrame(seatId, EXTRA_ACTOR_FRAME.empty);
      }
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
  updateDrinkPanel(director.activeScreenId());
  updateInstantPanel(director.activeScreenId());
  syncCustomers();
  renderServeTargets();
  for (const btn of document.querySelectorAll('.quick-nav button')) btn.classList.toggle('active', btn.dataset.screen === director.activeScreenId());
  el('navLeft').disabled = !director.canLeft();
  el('navRight').disabled = !director.canRight();
  businessRenderDue = false;
}

const ASSEMBLY_TARE_TINT = new THREE.Color(0x5e281a);

function setAssemblyTareTint(instance, amount, { ingredientsOnly = false } = {}) {
  const normalized = Math.max(0, Math.min(1, Number(amount) || 0));
  if (typeof instance?.setTare === 'function') {
    instance.setTare(normalized);
    return;
  }
  instance?.root?.traverse((node) => {
    if (!node.isMesh) return;
    if (ingredientsOnly) {
      let parent = node;
      let ingredient = false;
      while (parent && parent !== instance.root) {
        if (/^(chicken|green-onion)-\d{2}$/.test(parent.name)) {
          ingredient = true;
          break;
        }
        parent = parent.parent;
      }
      if (!ingredient) return;
    }
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (!material?.color) continue;
      material.userData.assemblyTareBaseColor ??= material.color.clone();
      material.color.copy(material.userData.assemblyTareBaseColor).lerp(
        ASSEMBLY_TARE_TINT,
        normalized * 0.22,
      );
    }
  });
}

function syncAssemblyVisual() {
  const onAssembly = director.activeScreenId() === 'SCR-SVC-ASSEMBLY';
  const selectedMenuId = cook.selectedMenuId();
  // learnedMenuIds()는 Set을 돌려준다. includes는 Set에 없다.
  const torikawaUnlocked = cook.learnedMenuIds().has('kawa');
  R.setArtAsset('workbench', torikawaUnlocked
    ? COOKING_ART.torikawaAssemblyStation
    : COOKING_ART.assemblyStation);
  const negimaReady = rawNegimaRuntime.status === 'ready';
  const momoReady = momoRuntime.status === 'approved';
  const kawaReady = kawaRuntime.status === 'approved';
  const progress = cook.assemblyProgress();
  const assembledTare = progress.complete && progress.tarePrepared;
  if (assemblyNegimaInstances.build) {
    // 네기마 조립 compositor가 가진 온전한 3D 대나무 꼬치를 모든 꼬치 메뉴의 공통
    // 베이스로 유지한다. 모모·토리카와 단계 PNG는 재료만 얹고 자체 막대는 그리지 않는다.
    const usesCommonSkewerBase = ['negima', 'momo', 'kawa'].includes(selectedMenuId);
    assemblyNegimaInstances.build.setIngredientCount(
      selectedMenuId === 'negima' ? progress.index : 0,
    );
    assemblyNegimaInstances.build.holder.visible = onAssembly && negimaReady && usesCommonSkewerBase;
    setAssemblyTareTint(
      assemblyNegimaInstances.build,
      selectedMenuId === 'negima' && assembledTare ? 1 : 0,
      { ingredientsOnly: true },
    );
  }
  if (momoInstances.build) {
    momoInstances.build.setIngredientCount(progress.index);
    momoInstances.build.holder.visible = onAssembly && momoReady && selectedMenuId === 'momo';
    setAssemblyTareTint(momoInstances.build, selectedMenuId === 'momo' && assembledTare ? 1 : 0);
  }
  if (kawaInstances.build) {
    kawaInstances.build.setIngredientCount(progress.index);
    kawaInstances.build.holder.visible = onAssembly && kawaReady && selectedMenuId === 'kawa';
    setAssemblyTareTint(kawaInstances.build, selectedMenuId === 'kawa' && assembledTare ? 1 : 0);
  }
  const waitingItems = cook.waitingItems();
  const waitingProducts = cook.waitingProducts();
  assemblyNegimaInstances.tray.forEach((instance, index) => {
    instance.holder.visible = onAssembly && negimaReady && waitingItems[index] === 'negima';
    setAssemblyTareTint(instance, waitingProducts[index]?.seasoning === 'tare' ? 1 : 0);
  });
  momoInstances.tray.forEach((instance, index) => {
    instance.holder.visible = onAssembly && momoReady && waitingItems[index] === 'momo';
    setAssemblyTareTint(instance, waitingProducts[index]?.seasoning === 'tare' ? 1 : 0);
  });
  kawaInstances.tray.forEach((instance, index) => {
    instance.holder.visible = onAssembly && kawaReady && waitingItems[index] === 'kawa';
    setAssemblyTareTint(instance, waitingProducts[index]?.seasoning === 'tare' ? 1 : 0);
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
  const waitingByMenu = Object.fromEntries(['negima', 'momo', 'kawa'].map((menuId) => [menuId, {
    salt: cook.waitingCount(menuId, 'salt'),
    tare: cook.waitingCount(menuId, 'tare'),
  }]));
  const hasEmptySlot = slotViews.some((slot) => slot.status === 'empty');
  const tareUnlocked = ['d3', 'd4', 'd5'].includes(ACTIVE_DAY_ID);
  grillInventory.hidden = !onGrill;
  // The prepared inventory is shared state, but selecting it is a customer-station action.
  // Keep the stock while hiding the service-counter art from every work station.
  dockShelf.classList.toggle('station-context-hidden', !onCustomers);
  dockShelf.setAttribute('aria-hidden', String(!onCustomers));
  const syncCard = (menuId, card, countEl, hintEl) => {
    const counts = waitingByMenu[menuId];
    const count = counts.salt + counts.tare;
    const label = MENU_META[menuId]?.label ?? '꼬치';
    card.hidden = menuId === 'kawa'
      ? ACTIVE_DAY_ID !== 'd5'
      : menuId === 'momo' && ACTIVE_DAY_ID === 'd1';
    const disabled = !onGrill || count === 0 || !hasEmptySlot;
    card.classList.toggle('is-disabled', disabled);
    card.dataset.waitingCount = String(count);
    card.dataset.hasEmptySlot = String(hasEmptySlot);
    countEl.textContent = `× ${count}`;
    hintEl.textContent = count === 0
      ? `조립대에서 ${label}를 완성해 주세요`
      : hasEmptySlot
        ? tareUnlocked ? `소금 ${counts.salt} · 타레 ${counts.tare}` : `소금 ${counts.salt}`
        : '빈 그릴 칸이 생기면 배치할 수 있습니다';
    for (const [seasoning, button] of Object.entries(grillWaitingActions[menuId])) {
      const seasoningCount = counts[seasoning];
      button.hidden = seasoning === 'tare' && !tareUnlocked;
      button.disabled = disabled || seasoningCount === 0;
      button.dataset.waitingCount = String(seasoningCount);
      grillWaitingActionCounts[menuId][seasoning].textContent = `× ${seasoningCount}`;
      const seasoningLabel = seasoning === 'tare' ? '타레' : '소금';
      button.setAttribute('aria-label', seasoningCount === 0
        ? `${seasoningLabel} ${label}. 대기 중인 꼬치 없음.`
        : hasEmptySlot
          ? `${seasoningLabel} ${label}. 대기 ${seasoningCount}개. 첫 빈 그릴 칸에 올리기.`
          : `${seasoningLabel} ${label}. 대기 ${seasoningCount}개. 빈 그릴 칸 없음.`);
    }
  };
  syncCard('negima', grillWaitingNegima, grillWaitingNegimaCount, grillWaitingNegimaHint);
  syncCard('momo', grillWaitingMomo, grillWaitingMomoCount, grillWaitingMomoHint);
  syncCard('kawa', grillWaitingKawa, grillWaitingKawaCount, grillWaitingKawaHint);
}

const GRILL_QUALITY_ORDER = Object.freeze(['Perfect', 'Good', 'OK', 'Fail']);
const GRILL_QUALITY_LABEL = Object.freeze({
  Perfect: '완벽',
  Good: '좋음',
  OK: '보통',
  Fail: '실패',
});

function renderGrillFinishedInventory() {
  const skewerItems = dock.items().filter((item) => ['negima', 'momo', 'kawa'].includes(item.menuId));
  grillFinishedInventoryCount.textContent = `총 ${skewerItems.length}개`;
  grillFinishedQualityList.innerHTML = '';

  if (skewerItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'grill-inventory-empty';
    empty.innerHTML = '<strong>완성된 꼬치가 없습니다</strong><span>다 구운 꼬치를 그릴에서 꺼내면 여기에 종류와 품질별로 표시됩니다.</span>';
    grillFinishedQualityList.appendChild(empty);
    return;
  }

  const grouped = new Map();
  for (const item of skewerItems) {
    const key = `${item.menu}\u0000${item.label}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  const labels = [...grouped.keys()].sort((a, b) => {
    const [aMenu, aQuality] = a.split('\u0000');
    const [bMenu, bQuality] = b.split('\u0000');
    if (aMenu !== bMenu) return aMenu.localeCompare(bMenu, 'ko');
    const ai = GRILL_QUALITY_ORDER.indexOf(aQuality);
    const bi = GRILL_QUALITY_ORDER.indexOf(bQuality);
    return (ai < 0 ? GRILL_QUALITY_ORDER.length : ai) - (bi < 0 ? GRILL_QUALITY_ORDER.length : bi);
  });
  for (const key of labels) {
    const [menuLabel, label] = key.split('\u0000');
    const card = document.createElement('div');
    card.className = `grill-finished-quality grill-finished-quality--${label.toLowerCase()}`;
    card.dataset.quality = label;
    card.dataset.menu = menuLabel;
    card.setAttribute('role', 'listitem');

    const marker = document.createElement('span');
    marker.className = 'grill-finished-quality-marker';
    marker.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('span');
    copy.className = 'grill-finished-quality-copy';
    const menu = document.createElement('strong');
    menu.textContent = menuLabel;
    const quality = document.createElement('span');
    quality.textContent = GRILL_QUALITY_LABEL[label] ?? label;
    copy.append(menu, quality);

    const count = document.createElement('strong');
    count.className = 'grill-finished-quality-count';
    count.textContent = `× ${grouped.get(key)}`;
    card.append(marker, copy, count);
    grillFinishedQualityList.appendChild(card);
  }
}

function renderReceipts() {
  const ol = el('receipts');
  ol.innerHTML = '';
  const idx = cook.assemblyIndex();
  // 단계 안내는 처음 만드는 메뉴에만. 익힌 뒤에는 비법노트에서 찾아본다.
  const selectedMenuId = cook.selectedMenuId();
  const tutorial = selectedMenuId !== 'kawa'
    && shouldShowAssemblyTutorial(selectedMenuId, cook.learnedMenuIds());
  ol.dataset.tutorial = String(tutorial);
  if (tutorial) {
    cook.currentRecipe().forEach((ing, i) => {
      const li = document.createElement('li');
      li.textContent = ing === 'chicken' ? '닭' : ing === 'foldedChickenSkin' ? '닭껍질' : '파';
      li.dataset.testid = `order-slot-${i}`;
      if (i < idx) li.classList.add('done');
      else if (i === idx) li.classList.add('next');
      ol.appendChild(li);
    });
  }
  if (selectedMenuId === 'kawa') {
    const progress = document.createElement('li');
    progress.textContent = `토리카와 ${idx}/5`;
    progress.dataset.testid = 'kawa-assembly-progress';
    progress.style.width = 'auto';
    progress.style.padding = '0 8px';
    ol.appendChild(progress);
  }
  const w = document.createElement('li');
  const waiting = cook.waitingProducts().map((item) => skewerLabel(item.menuId, item.seasoning));
  const waitingCounts = new Map();
  for (const label of waiting) waitingCounts.set(label, (waitingCounts.get(label) ?? 0) + 1);
  w.textContent = waiting.length
    ? [...waitingCounts].map(([label, count]) => `${label} ${count}`).join(' · ')
    : '대기 0';
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

let previousOccupiedSeatCount = null;
// 첫 손님이 이미 다녀갔는지. 좌석 배치를 언제 손님용으로 되돌릴지 정한다.
let tsukiokaSeatedBefore = false;

function syncCustomerAmbience(view) {
  const occupied = view?.seats?.filter((seat) => seat.occupied).length ?? 0;
  // 한 명까지는 대화 없는 조용한 가게다. 두 명부터만 좌석 수에 맞는 군중음을 한 단계씩 켠다.
  const nextCrowd = crowdAmbienceId(occupied);
  for (const id of ['AMB-CROWD-L1', 'AMB-CROWD-L2']) {
    if (id === nextCrowd) loopOn(id);
    else loopOff(id);
  }
  // 빈 가게는 조용해야 한다(interiorAmbienceId 주석 참고).
  const nextInterior = interiorAmbienceId(occupied);
  if (nextInterior) loopOn(nextInterior);
  else loopOff('AMB-SHOP-INTERIOR');
  if (previousOccupiedSeatCount !== null && occupied !== previousOccupiedSeatCount) {
    sfx(occupied > previousOccupiedSeatCount ? 'AMB-DOOR-OPEN' : 'AMB-DOOR-CLOSE');
  }
  previousOccupiedSeatCount = occupied;
}

function renderAssemblyTareControl(activeDayFeatureOpen) {
  const progress = cook.assemblyProgress();
  const unlocked = activeDayFeatureOpen
    && ['d3', 'd4', 'd5'].includes(ACTIVE_DAY_ID)
    && director.activeScreenId() === 'SCR-SVC-ASSEMBLY';
  const panel = el('assemblyTarePanel');
  panel.hidden = !unlocked;
  if (!unlocked) {
    assemblyTareModeSelected = false;
    assemblyTarePointerId = null;
    assemblyTareLastZone = null;
    assemblyTarePaintedZones.clear();
    assemblyTareKeyboardDirections.clear();
    assemblyTareCursor.classList.remove('is-brushing');
    assemblyTareCursor.hidden = true;
    document.body.classList.remove('assembly-tare-cursor-ready');
    return;
  }

  if (!progress.complete || progress.tarePrepared) assemblyTareModeSelected = false;
  const ready = progress.complete && !progress.tarePrepared;
  assemblyTarePot.disabled = !ready;
  assemblyTarePot.setAttribute('aria-pressed', String(assemblyTareModeSelected));
  assemblyTarePotArt.src = assemblyTareModeSelected
    ? '/assets/campaign/d3/prop-tare-sauce-pot-open-r2-b1.png'
    : '/assets/campaign/d3/prop-tare-sauce-pot-r2-b1.png';
  assemblyTareCursor.hidden = !assemblyTareReady();
  document.body.classList.toggle('assembly-tare-cursor-ready', assemblyTareReady());

  const status = el('assemblyTareProgress');
  if (!progress.complete) status.textContent = '꼬치를 먼저 조립하세요';
  else if (progress.tarePrepared) status.textContent = '타레 도포 완료 · 꼬치를 눌러 이동';
  else if (assemblyTareModeSelected) status.textContent = '꼬치 위를 한 번 좌우로 칠하세요';
  else status.textContent = '소금으로 옮기거나 타레를 선택하세요';
  if (assemblyTarePointerId == null) {
    updateAssemblyTareCoverage(progress.tarePrepared ? 1 : (progress.tareCoverage ?? 0));
  }
}

function renderBusiness() {
  const view = businessView();
  syncCustomerAmbience(view);
  const activeDayFeatureOpen = businessSession?.ok === true
    && businessSession.completed !== true
    && view?.dayId?.toLowerCase() === ACTIVE_DAY_ID;
  const recipePickerOpen = activeDayFeatureOpen
    && ['d2', 'd3', 'd4', 'd5'].includes(ACTIVE_DAY_ID)
    && director.activeScreenId() === 'SCR-SVC-ASSEMBLY';
  assemblyRecipePicker.hidden = !recipePickerOpen;
  for (const button of assemblyRecipePicker.querySelectorAll('[data-menu-id]')) {
    button.hidden = (button.dataset.d3Only === 'true' && !['d3', 'd4', 'd5'].includes(ACTIVE_DAY_ID))
      || (button.dataset.d5Only === 'true' && ACTIVE_DAY_ID !== 'd5');
    const selected = button.dataset.menuId === cook.selectedMenuId();
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = !selected && (cook.assemblyIndex() > 0 || cook.assemblyComplete());
  }
  renderAssemblyTareControl(activeDayFeatureOpen);
  el('businessClock').textContent = view?.clock?.label ?? '--:--';
  const manuallyPaused = runtimeSuspensionReasons.has('manual-pause');
  el('businessPhase').textContent = manuallyPaused
    ? '일시정지'
    : (PHASE_LABEL[view?.phase] ?? (businessBootError ? '오류' : '준비'));
  el('businessPhase').setAttribute('aria-pressed', String(manuallyPaused));
  el('runtimePausePanel').hidden = !manuallyPaused;
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
    el('postBusinessTitle').textContent = `${ACTIVE_DAY.label} 정산 · 5단계`;
    el('postBusinessSummary').textContent = summary
      ? `방문 ${summary.customers.visited} · 완료 주문 ${summary.orders.completed}\n매출 ${summary.economy.revenue} + 팁 ${summary.economy.tip} = ${summary.economy.total}`
      : '';
    const revealed = new Set(view.settlement.revealedSteps);
    for (const stepId of view.settlement.steps) {
      const detail = settlementStepDetail(stepId, summary, {
        nextDayLabel: ACTIVE_DAY.nextLabel,
        unlockLabels: ACTIVE_DAY.unlockLabels,
      });
      const row = document.createElement('li');
      row.dataset.testid = `settlement-step-${stepId}`;
      row.classList.toggle('revealed', revealed.has(stepId));
      const title = document.createElement('p');
      title.className = 'settlement-step-title';
      title.textContent = detail.label;
      row.appendChild(title);
      // 아직 확인하지 않은 단계는 제목만 둔다. 눌러서 하나씩 여는 흐름이 정산의 절차다.
      if (revealed.has(stepId)) {
        for (const line of detail.lines) {
          const body = document.createElement('p');
          body.className = 'settlement-step-line';
          body.textContent = line;
          row.appendChild(body);
        }
      }
      steps.appendChild(row);
    }
    action.textContent = view.settlement.ready
      ? (finalizing ? '저장 중…' : `${ACTIVE_DAY.label} 보상 저장 · ${ACTIVE_DAY.nextLabel} 전환`)
      : `다음 결과 확인 (${view.settlement.revealedSteps.length + 1}/5)`;
    action.disabled = finalizing;
  }

  const completed = view?.phase === 'complete' || businessSession?.completed;
  el('resultOverlay').hidden = !completed;
  if (completed) {
    const campaign = businessSession?.bridge?.getState?.();
    el('resultMessage').textContent = `${ACTIVE_DAY.label} 완료 · 보상 ${campaign?.economy?.balance ?? 44} · 명성 ${campaign?.economy?.reputation ?? 12} · ${ACTIVE_DAY.nextLabel} 저장 완료`;
    el('continueButton').textContent = `${ACTIVE_DAY.nextLabel}로 계속`;
    el('continueButton').href = ACTIVE_DAY_ID === 'd5'
      ? './public-shell.html'
      : `./s0-d3.html?post=${ACTIVE_DAY_ID}`;
  }
}

// ── 비법노트 ────────────────────────────────────────────────
function renderRecipeBook() {
  const container = el('recipeBookEntries');
  container.replaceChildren();
  const menuIds = ACTIVE_DAY_ID === 'd5'
    ? ['negima', 'momo', 'kawa', 'beer', 'cabbage-salad', 'highball']
    : ACTIVE_DAY_ID === 'd4'
      ? ['negima', 'momo', 'beer', 'cabbage-salad', 'highball']
    : ['negima', 'momo', 'beer'];
  for (const entry of recipeBookEntries({
    menuIds,
    tareAvailable: ['d3', 'd4', 'd5'].includes(ACTIVE_DAY_ID),
  })) {
    const article = document.createElement('article');
    article.className = 'recipe-book-entry';
    article.dataset.testid = `recipe-book-${entry.menuId}`;
    const title = document.createElement('p');
    title.className = 'recipe-book-entry-title';
    title.textContent = entry.label;
    article.appendChild(title);
    for (const line of entry.lines) {
      const body = document.createElement('p');
      body.className = 'recipe-book-line';
      body.textContent = line;
      article.appendChild(body);
    }
    container.appendChild(article);
  }
}

function setRecipeBookOpen(open) {
  const panel = el('recipeBook');
  const toggle = el('recipeBookToggle');
  if (open) renderRecipeBook();
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
}

el('recipeBookToggle').addEventListener('click', () => {
  setRecipeBookOpen(el('recipeBook').hidden);
});
el('recipeBookClose').addEventListener('click', () => setRecipeBookOpen(false));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !el('recipeBook').hidden) setRecipeBookOpen(false);
});

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
  const zone = drinkLeverZoneForDelta(
    e.clientY - activeDrinkLeverDrag.startY,
    undefined,
    activeDrinkLeverDrag.zone,
  );
  setDrinkLeverDragZone(zone, performance.now());
}

canvas.addEventListener('pointerdown', (e) => {
  if (director.controlsLocked()) return;
  const key = hitTest(e);
  if (!key) return;
  const now = performance.now();
  if (key === 'drinkLeverDrag') {
    if (!glassPlaced) {
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
  persistFirstOrderRuntime();
  releaseCleanupHold();
}
window.addEventListener('pointerup', releasePointers);
window.addEventListener('pointercancel', releasePointers);

function runtimeIsSuspended() {
  return runtimeSuspensionReasons.size > 0;
}

function scheduleLoop() {
  if (runtimeIsSuspended() || animationFrameId !== null) return;
  animationFrameId = requestAnimationFrame(loop);
}

function setRuntimeSuspended(reason, suspended) {
  const wasSuspended = runtimeIsSuspended();
  if (suspended) runtimeSuspensionReasons.add(reason);
  else runtimeSuspensionReasons.delete(reason);
  const isSuspended = runtimeIsSuspended();
  if (wasSuspended === isSuspended) return false;

  const now = performance.now();
  if (isSuspended) {
    cancelInstantPreparation();
    releaseHighballPour(now);
    releasePointers();
    cook.pause(now);
    pour.pause(now);
    grillSmoke.pause(now);
    director.pause(now);
    R.pause?.(now);
    dispatchBusiness(D1_UI_INTENT.PAUSE);
    businessDeltaMs = 0;
    lastBusinessFrameAt = null;
    suspensionStartedAt = now;
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    document.body.dataset.runtimePaused = 'true';
    persistFirstOrderRuntime();
    render();
    return true;
  }

  cook.resume(now);
  pour.resume(now);
  grillSmoke.resume(now);
  director.resume(now);
  R.resume?.(now);
  if (suspensionStartedAt !== null) {
    suspendedVisualOffsetMs += Math.max(0, now - suspensionStartedAt);
  }
  suspensionStartedAt = null;
  dispatchBusiness(D1_UI_INTENT.RESUME);
  businessDeltaMs = 0;
  lastBusinessFrameAt = now;
  delete document.body.dataset.runtimePaused;
  render();
  scheduleLoop();
  return true;
}

function blockSuspendedInput(event) {
  if (!runtimeIsSuspended()) return;
  if (event.target?.closest?.('#departureCutsceneContinue, #runtimePauseResume')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
window.addEventListener('pointerdown', blockSuspendedInput, true);
window.addEventListener('click', blockSuspendedInput, true);
window.addEventListener('keydown', blockSuspendedInput, true);
el('businessPhase').addEventListener('click', () => setRuntimeSuspended('manual-pause', true));
el('runtimePauseResume').addEventListener('click', () => {
  setRuntimeSuspended('manual-pause', false);
  el('businessPhase').focus();
});

const GLASS_RACK_SFX_SEC = 2;

function handle(key, now) {
  const si = slotIndexOf(key);
  if (si >= 0) { clickGrillSlot(si, now); return; }
  if (key.startsWith('grillWait:')) {
    const [, menuId, seasoning] = key.split(':');
    const r = cook.placeToGrill(now, menuId, seasoning);
    const label = skewerLabel(menuId, seasoning);
    if (!r.ok) {
      const noWaiting = ['no-waiting', 'no-menu-waiting', 'no-seasoning-waiting'].includes(r.reason);
      showHint(noWaiting ? `대기 중인 ${label}가 없어요` : '빈 그릴 칸이 없어요');
    } else {
      sfx('SFX-GRILL-PLACE-METAL');
      sfx('SFX-GRILL-PLACE-SIZZLE', { maxSec: GRILL_CUE_SEC });
      showHint(`${r.slot + 1}번에 ${label}를 올렸어요 · 앞면부터 익습니다`);
    }
    persistFirstOrderRuntime();
    syncRiskCount(now);
    render();
    return;
  }
  switch (key) {
    case 'glassRack':
      // 납품 음원이 연출보다 길어 잔 하나 놓는 데 계속 울린다. 2초에서 끊는다.
      sfx('SFX-DRINK-GLASS-SET', { maxSec: GLASS_RACK_SFX_SEC });
      sfx('SFX-DRINK-TRAY-TAP', { maxSec: GLASS_RACK_SFX_SEC });
      glassPlaced = true;
      persistFirstOrderRuntime();
      showHint('빈 잔을 노즐 아래에 놓았어요');
      break;
    case 'binChicken':
    case 'binTorikawa':
    case 'binLeek': {
      const ingredient = key === 'binTorikawa'
        ? 'foldedChickenSkin'
        : key === 'binChicken' ? 'chicken' : 'leek';
      const r = cook.clickIngredient(ingredient);
      if (!r.ok) {
        sfx('SFX-ASM-REJECT');
        showHint(r.reason === 'transfer-required' ? '완성 꼬치를 먼저 옮기세요' : '순서가 달라요');
      } else {
        sfx('SFX-ASM-PIERCE');
        if (r.completed) {
          sfx('SFX-ASM-COMPLETE');
          persistFirstOrderRuntime();
          showHint(['d3', 'd4', 'd5'].includes(ACTIVE_DAY_ID)
            ? `${skewerLabel(r.menuId)} 조립 완료 · 소금은 꼬치를 눌러 이동, 타레는 오른쪽 소스통을 선택하세요`
            : `${skewerLabel(r.menuId)} 완성 · 꼬치를 눌러 오른쪽 트레이로 옮기세요`);
        }
      }
      break;
    }
    case 'jigSkewer': {
      const r = cook.transferAssembly();
      if (!r.ok) {
        showHint(r.reason === 'tare-brush-required'
          ? '타레 붓으로 꼬치 전체를 한 번 좌우로 칠해 주세요'
          : '아직 완성된 꼬치가 없어요');
      } else {
        assemblyTareModeSelected = false;
        assemblyTarePaintedZones.clear();
        assemblyTareKeyboardDirections.clear();
        persistFirstOrderRuntime();
        showHint(`${skewerLabel(r.menuId, r.seasoning)} · 전달 트레이 이동 완료`);
      }
      break;
    }
    case 'grillFinishedTray':
      showHint(dock.items().some((item) => ['네기마', '모모'].includes(item.menu))
        ? '완성 꼬치는 오른쪽 종류·품질별 목록에서 확인할 수 있어요'
        : '완료된 꼬치가 아직 없어요');
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
    const menuId = r.menuId ?? 'negima';
    const label = skewerLabel(menuId, r.seasoning);
    sfx('SFX-GRILL-RETRIEVE');
    sfx(r.quality?.good ? 'SFX-JUDGE-PERFECT' : 'SFX-JUDGE-FAIL');
    dock.add({ menuId, menu: label, seasoning: r.seasoning ?? null, quality: r.quality.grade, good: r.quality.good, zone: 'food' });
    persistFirstOrderRuntime();
    showHint(`완성 ${label}가 오른쪽 종류·품질별 목록에 추가됐어요`);
  }
  else if (r.flipped) {
    sfx('SFX-GRILL-FLIP');
    grillSmoke.burst(i, now);
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
const momoStageBySlot = {};
const kawaStageBySlot = {};

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

let drinkLeverAudioZone = null;
let previousDrinkPhase = null;

// 채움 피치. 예전엔 0.8~2.0배(한 옥타브 넘게)를 매 프레임 그대로 꽂아 톱질하듯 들렸다.
// 두어 반음 폭으로 좁히고 glide로 이어 붙인다.
const FILL_PITCH_GAIN = 0.55;
const FILL_PITCH_GLIDE_SEC = 0.08;
const fillPitchRate = (beerFill) => 0.94 + Math.min(1, Math.max(0, beerFill)) * 0.22;

// 45초짜리 공명 파일을 끝까지 울리면 잔을 회수한 뒤에도 계속 운다. 신호로 들릴 만큼만 쓴다.
const GLASS_RESONANCE_SEC = 2.5;

// 레버 소리는 입력 경로가 아니라 pour 상태에서 끌어온다. 드래그·클릭·포인터 취소가 각각
// 다른 경로로 끝나기 때문에 입력마다 걸면 흐름음이 남아 돈다.
function updateDrinkAudio(state) {
  const next = state.active ?? null;
  // 입력 종료를 한 프레임 놓치거나 HMR 뒤 로컬 상태가 초기화돼도 흐름음이 남지 않게
  // 현재 pour 상태를 매 프레임 오디오의 최종 기준으로 삼는다.
  if (next !== 'beer') {
    loopOff('SFX-DRINK-BEER-FLOW');
    loopOff('SFX-DRINK-FILL-PITCH');
  }
  if (next !== 'foam') loopOff('SFX-DRINK-FOAM-FLOW');
  if (next !== drinkLeverAudioZone) {
    if (drinkLeverAudioZone === 'beer') {
      loopOff('SFX-DRINK-BEER-FLOW');
      loopOff('SFX-DRINK-FILL-PITCH');
      sfx('SFX-DRINK-BEER-LEVER-OFF');
    } else if (drinkLeverAudioZone === 'foam') {
      loopOff('SFX-DRINK-FOAM-FLOW');
      sfx('SFX-DRINK-BEER-LEVER-OFF');
    }
    if (next === 'beer') {
      sfx('SFX-DRINK-BEER-LEVER-ON');
      loopOn('SFX-DRINK-BEER-FLOW');
      const beerFill = Math.min(1, state.beerSec / DRINK.glassCapacity);
      loopOn('SFX-DRINK-FILL-PITCH', { gain: FILL_PITCH_GAIN, rate: fillPitchRate(beerFill) });
    } else if (next === 'foam') {
      sfx('SFX-DRINK-BEER-LEVER-ON');
      loopOn('SFX-DRINK-FOAM-FLOW');
    }
    drinkLeverAudioZone = next;
  }

  // 잔을 비우고 새로 시작하면 70%·넘침·완성이 다시 울어야 한다.
  if (state.phase === 'idle') gameAudio()?.resetOnce('SFX-DRINK-');
  // 잔이 손을 떠나는 순간(완성·폐기·초기화) 잔에 붙은 소리도 같이 끊는다.
  if (state.phase !== previousDrinkPhase) {
    if (state.phase === 'idle') sfxOff('SFX-DRINK-GLASS-RESONANCE');
    previousDrinkPhase = state.phase;
  }

  const fill = Math.min(1, state.totalSec / DRINK.glassCapacity);
  // 차오를수록 조금 높아진다. 파일이 아니라 여기서 만든다.
  if (next === 'beer') {
    const beerFill = Math.min(1, state.beerSec / DRINK.glassCapacity);
    loopRate('SFX-DRINK-FILL-PITCH', fillPitchRate(beerFill), { glideSec: FILL_PITCH_GLIDE_SEC });
  }
  if (fill >= 0.7) sfxOnce('SFX-DRINK-GLASS-RESONANCE', 'fill70', { maxSec: GLASS_RESONANCE_SEC });
  if (state.phase === 'overflow') sfxOnce('SFX-DRINK-OVERFLOW', 'overflow');
  if (state.phase === 'done') sfxOnce('SFX-DRINK-COMPLETE', 'done');
}

const GRILL_COOK_LOOP = 'SFX-GRILL-COOK-LOOP';
const GRILL_CRACKLES = ['SFX-GRILL-CRACKLE-A', 'SFX-GRILL-CRACKLE-B', 'SFX-GRILL-CRACKLE-C'];
// 상태 진입 신호. 납품 파일이 22초·2분이라 그대로 두면 꼬치를 회수한 뒤에도 계속 운다.
// 신호는 짧게 자르고, 그릴이 비면 남은 꼬리도 끊는다.
const GRILL_STATE_CUES = ['SFX-GRILL-PROPER-ENTER', 'SFX-GRILL-BURNT', 'SFX-GRILL-PLACE-SIZZLE'];
const GRILL_CUE_SEC = 2.5;
let grillCookLoopActive = false;
let nextGrillCrackleAt = null;
const previousGrillDoneness = Array(GRILL_SLOT_KEYS.length).fill(null);

function updateGrillStateCues(views) {
  views.forEach((view, index) => {
    const next = view?.cooking ? view.doneness : null;
    const previous = previousGrillDoneness[index];
    if (next !== previous) {
      if (next === 'perfect') sfx('SFX-GRILL-PROPER-ENTER', { maxSec: GRILL_CUE_SEC });
      if (next === 'burnt') sfx('SFX-GRILL-BURNT', { maxSec: GRILL_CUE_SEC });
      previousGrillDoneness[index] = next;
    }
  });
}

// 기본 지글거림은 하나만 유지한다. 가장 많이 익은 칸을 기준으로 타닥 단발음의
// 간격을 줄여, 여러 슬롯이 있어도 루프가 뭉개지지 않으면서 익힘 진행을 들려준다.
function updateGrillCookAudio(views, now) {
  let peak = -1;
  for (const v of views) {
    if (!v?.cooking) continue;
    peak = Math.max(peak, elapsedSecToUniform(v.faceElapsedSec));
  }
  if (peak < 0) {
    // 비어 있는 동안 매 프레임 끊지 않는다. 막 울린 배치음이 취소될 수 있다.
    if (grillCookLoopActive) {
      loopOff(GRILL_COOK_LOOP);
      loopOff('AMB-CHARCOAL-BED');
      for (const id of [...GRILL_CRACKLES, ...GRILL_STATE_CUES]) sfxOff(id);
    }
    grillCookLoopActive = false;
    nextGrillCrackleAt = null;
    return;
  }
  if (!grillCookLoopActive) {
    loopOn('AMB-CHARCOAL-BED', { gain: 0.55 });
    loopOn(GRILL_COOK_LOOP);
    grillCookLoopActive = true;
  }
  const progress = Math.max(0, Math.min(1, peak));
  const minInterval = 3000 - progress * 2500;
  const maxInterval = 6000 - progress * 4500;
  if (nextGrillCrackleAt === null) {
    nextGrillCrackleAt = now + minInterval + Math.random() * (maxInterval - minInterval);
    return;
  }
  if (now < nextGrillCrackleAt) return;
  const id = GRILL_CRACKLES[Math.floor(Math.random() * GRILL_CRACKLES.length)];
  sfx(id, {
    gain: 0.65 + progress * 0.3 + Math.random() * 0.05,
    rate: 0.94 + Math.random() * 0.12,
  });
  nextGrillCrackleAt = now + minInterval + Math.random() * (maxInterval - minInterval);
}

function updateGrillVisual(now, views = cook.slotViews(now)) {
  updateGrillCookAudio(views, now);
  updateGrillStateCues(views);
  for (const key of SLOT_KEYS) {
    const slotView = views[slotIndexOf(key)];
    const v = slotView;
    const mesh = R.objectMesh[key];
    if (!mesh) continue;
    const g = grillMats[key];
    if (g) {
      g.setTexture(rawNegimaRuntime.grillRawTexture);
      g.setTime(now / 1000);
      for (const [param, value] of Object.entries(d1SecondFaceR3Params(v))) g.setParam(param, value);
      g.setDoneness(v && v.cooking ? elapsedSecToUniform(v.faceElapsedSec) : 0);
      // 글레이즈(연출)와 양념 구분색(게임 상태)은 서로 다른 uniform이 갖는다.
      g.setTare(v?.tarePrepared ? 0.34 : 0);
      g.setTareSeasoned(v?.tarePrepared === true);
    }
    const visibleStage = grillNegimaStage(v);
    const skewerVisibleStage = visibleStage;
    mesh.userData.grillBaseQuaternion ??= mesh.quaternion.clone();
    mesh.quaternion.copy(mesh.userData.grillBaseQuaternion).multiply(
      grillFlipQuaternion.setFromAxisAngle(GRILL_FLIP_AXIS, v?.visualRotationRad ?? 0),
    );
    const rawInstance = rawNegimaInstances[key];
    const momoInstance = momoInstances.grill[key];
    const kawaInstance = kawaInstances.grill[key];
    const menuId = v?.menuId ?? 'negima';
    // 네기마는 승인 원본(raw) 한 장에 GLSL 조리색을 적용한다. 모모와 토리카와는
    // 메뉴별 단계 래스터를 선택해 적정·과다·탄 상태의 국소 디테일을 보존한다.
    const shaderOnApprovedPlane = rawInstance?.usesCookingMaterial?.() === true;
    const showApprovedSprite = (
      rawNegimaRuntime.status === 'ready'
      && v != null
      && v.status !== 'empty'
      && menuId === 'negima'
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
    const showMomoSprite = (
      momoRuntime.status === 'approved'
      && v != null
      && v.status !== 'empty'
      && menuId === 'momo'
      && director.activeScreenId() === 'SCR-SVC-GRILL'
    );
    if (momoInstance) {
      momoInstance.holder.visible = showMomoSprite;
      if (!v?.flipping) {
        momoStageBySlot[key] = skewerVisibleStage;
        momoInstance.setStage(skewerVisibleStage);
        momoInstance.setTare(v?.tarePrepared ? 1 : 0);
        momoInstance.flipPivot.scale.x = v?.orientationFaceDown === 'back' ? -1 : 1;
      }
      momoInstance.flipPivot.rotation.y = 0;
    }
    const showKawaSprite = (
      kawaRuntime.status === 'approved'
      && v != null
      && v.status !== 'empty'
      && menuId === 'kawa'
      && director.activeScreenId() === 'SCR-SVC-GRILL'
    );
    if (kawaInstance) {
      kawaInstance.holder.visible = showKawaSprite;
      if (!v?.flipping) {
        kawaStageBySlot[key] = skewerVisibleStage;
        kawaInstance.setStage(skewerVisibleStage);
        kawaInstance.setTare(v?.tarePrepared ? 1 : 0);
        kawaInstance.flipPivot.scale.x = v?.orientationFaceDown === 'back' ? -1 : 1;
      }
      kawaInstance.flipPivot.rotation.y = 0;
    }
    // public pgSlot은 visual과 raycast를 한 mesh가 맡으므로 visible=false로 숨기면 입력도 끊긴다.
    // mesh/raycast는 유지하고 color write만 막는다. 승인 평면이 셰이더를 소유한 뒤에는
    // mesh가 raycast 전용이라 항상 막아둔다.
    if (mesh.material) {
      mesh.material.colorWrite = !(showApprovedSprite || showMomoSprite || showKawaSprite);
    }
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
  for (const s of ACTIVE_SCREENS) {
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
  if (e.defaultPrevented) return;
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
    showHint(result.duplicate
      ? `이미 저장된 ${ACTIVE_DAY.label} 보상입니다.`
      : `${ACTIVE_DAY.label} 저장 완료 · ${ACTIVE_DAY.nextLabel}로 전환했습니다.`);
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
    const consumed = ACTIVE_DAY_ID === 'd5'
      ? await loadD5BusinessDayDefinition({ url: D5_BUSINESS_DAY_DEFINITION_URL })
      : ACTIVE_DAY_ID === 'd4'
      ? await loadD4BusinessDayDefinition({ url: D4_BUSINESS_DAY_DEFINITION_URL })
      : ACTIVE_DAY_ID === 'd3'
      ? await loadD3BusinessDayDefinition({ url: D3_BUSINESS_DAY_DEFINITION_URL, seed: daySeed })
      : ACTIVE_DAY_ID === 'd2'
        ? await loadD2BusinessDayDefinition({ url: D2_BUSINESS_DAY_DEFINITION_URL, seed: daySeed })
        : await loadD1BusinessDayReleaseDefinition({ url: D1_BUSINESS_DAY_RELEASE_DEFINITION_URL });
    if (!consumed.ok) {
      businessBootError = consumed.error;
      businessRenderDue = true;
      render();
      return;
    }
    if (['d4', 'd5'].includes(ACTIVE_DAY_ID)) {
      const instantDefinition = consumed.definition.stationProcesses?.instant
        ?.items?.['cabbage-salad'];
      const highballDefinition = consumed.definition.stationProcesses?.drink
        ?.workSurfaces?.highball;
      instantStation = createInstantServiceStation({
        holdMs: instantDefinition?.prepareHoldMs,
      });
      highballStation = createHighballStation({
        config: highballDefinition,
        snapshot: restoredFirstOrderRuntime?.highball,
      });
    }
    if (ACTIVE_DAY_ID === 'd5') {
      const kawaThresholds = consumed.definition.stationProcesses?.grill
        ?.items?.kawa?.faceThresholdsSec;
      cook.setMenuThresholds('kawa', kawaThresholds);
    }
    const resetDevelopment = resetFirstOrderRuntime;
    businessSession = await createD1BusinessDayBrowserSession({
      definition: consumed.definition,
      browserStorage: window.localStorage,
      resetDevelopment,
      developmentStartDay,
    });
    if (!businessSession.ok) {
      businessBootError = businessSession.error;
    } else {
      businessPort = businessSession.port;
      reportedRiskCount = businessView()?.limits.riskProcessCount ?? 0;
      if (runtimeIsSuspended()) dispatchBusiness(D1_UI_INTENT.PAUSE);
      else lastBusinessFrameAt = performance.now();
    }
  } catch (error) {
    businessBootError = error;
  }
  businessRenderDue = true;
  render();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persistFirstOrderRuntime();
  setRuntimeSuspended('document-hidden', document.hidden);
});
window.addEventListener('blur', () => setRuntimeSuspended('window-blur', true));
window.addEventListener('focus', () => setRuntimeSuspended('window-blur', false));

// ── 루프 ─────────────────────────────────────────────────────
let lastActive = director.activeScreenId();
let lastWaiting = -1;
let businessDeltaMs = 0;
function loop(now) {
  animationFrameId = null;
  if (runtimeIsSuspended()) return;
  const discarded = cook.tickBurn(now);
  if (discarded.length) {
    showHint('양면이 탄 꼬치를 폐기했어요');
    syncRiskCount(now);
    render();
  }
  director.tick(now);
  const active = director.activeScreenId();
  if (active !== lastActive) {
    cancelInstantPreparation();
    releaseHighballPour(now);
    R.goToScreen(active, now, SCREEN_TRANSITION_MS);
    lastActive = active;
    render();
  }
  if (cook.waitingCount() !== lastWaiting) { lastWaiting = cook.waitingCount(); render(); }
  if (businessPort && lastBusinessFrameAt !== null) {
    businessDeltaMs += Math.max(0, Math.min(1_000, now - lastBusinessFrameAt));
    if (businessDeltaMs >= 100) {
      advanceBusinessRuntime(businessDeltaMs);
      businessDeltaMs = 0;
    }
  }
  lastBusinessFrameAt = now;
  const grillViews = cook.slotViews(now);
  updateGrillVisual(now, grillViews);
  grillSmoke.update(now, grillViews, {
    visible: active === 'SCR-SVC-GRILL',
  });
  const visualNow = visualNowMs(now);
  R.setCleanupOverlayFrame(Math.floor(visualNow / 180));
  updateGrillStatus(now);
  pour.tick(now);
  const highballTick = highballStation.tick(now);
  if (highballTick.overflowed) {
    persistFirstOrderRuntime();
    showHint('잔이 넘쳤어요 · 낮은 품질로 계속하거나 폐기하세요');
  }
  const instantTick = instantStation.tick(now);
  if (instantTick.completed) {
    dock.add({
      menuId: 'cabbage-salad',
      menu: '양배추 사라다',
      quality: null,
      qualityMode: 'none',
      good: null,
      zone: 'food',
    });
    instantMessage.textContent = '사라다 한 접시를 준비 목록에 올렸어요';
    persistFirstOrderRuntime();
    showHint('양배추 사라다 한 접시 완성');
  }
  updateDrinkAudio(pour.state());
  beerLiquid?.setTime(visualNow / 1000);
  beerCoreVfx?.setTime(visualNow / 1000);
  updateDrinkPanel(active, now);
  updateInstantPanel(active);
  updateLabels();
  customers.tick(active);
  positionServeTargets();
  updateTsukiokaArt(visualNow);
  if (businessRenderDue) render();
  R.renderFrame(now);
  scheduleLoop();
}
R.goToScreen(INITIAL_SCREEN, 0, 0);
render();
scheduleLoop();
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
  runtimeSuspension: () => ({
    paused: runtimeIsSuspended(),
    reasons: [...runtimeSuspensionReasons].sort(),
    frameScheduled: animationFrameId !== null,
    cookPaused: cook.isPaused(),
    drinkPaused: pour.state().paused,
    smokePaused: grillSmoke.snapshot().paused,
    renderPaused: R.isPaused?.() === true,
  }),
  rendererStats: () => R.performanceStats(),
  setRuntimeSuspended: (reason, suspended) => setRuntimeSuspended(reason, suspended),
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
  tsukiokaVisual: () => {
    const seat = businessView()?.seats.find((item) => item.customerId === 'REGULAR_TSUKIOKA');
    const art = tsukiokaArtFor(seat, visualNowMs());
    const plate = seat ? R.seatBaseMesh[seat.seatId] : null;
    const beer = seat ? R.seatBeerMesh[seat.seatId] : null;
    return {
      seatId: seat?.seatId ?? null,
      artId: art?.id ?? null,
      frameRole: art?.frameRole ?? null,
      plateVisible: plate?.visible === true,
      plateTextureUrl: plate?.material?.map?.image?.currentSrc ?? plate?.material?.map?.image?.src ?? null,
      beerVisible: beer?.visible === true,
    };
  },
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
  momoRuntime: () => ({
    status: momoRuntime.status,
    error: momoRuntime.error ? String(momoRuntime.error.message ?? momoRuntime.error) : null,
    slots: SLOT_KEYS.map((key) => ({
      key,
      visible: momoInstances.grill[key]?.holder.visible === true,
      stage: momoInstances.grill[key]?.stage?.() ?? null,
      approvedStage: momoStageBySlot[key]
        ?? grillNegimaStage(cook.slotViews(performance.now())[slotIndexOf(key)]),
      visualMirrorX: momoInstances.grill[key]?.flipPivot?.scale?.x ?? null,
    })),
  }),
  kawaRuntime: () => ({
    status: kawaRuntime.status,
    error: kawaRuntime.error ? String(kawaRuntime.error.message ?? kawaRuntime.error) : null,
    slots: SLOT_KEYS.map((key) => ({
      key,
      visible: kawaInstances.grill[key]?.holder.visible === true,
      stage: kawaInstances.grill[key]?.stage?.() ?? null,
      approvedStage: kawaStageBySlot[key]
        ?? grillNegimaStage(cook.slotViews(performance.now())[slotIndexOf(key)]),
      visualMirrorX: kawaInstances.grill[key]?.flipPivot?.scale?.x ?? null,
    })),
  }),
  assemblyArtRuntime: () => ({
    status: rawNegimaRuntime.status,
    selectedMenuId: cook.selectedMenuId(),
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
    momo: {
      status: momoRuntime.status,
      build: {
        visible: momoInstances.build?.holder.visible === true,
        ingredientCount: momoInstances.build?.ingredientCount?.() ?? 0,
        geometry: assemblyInstanceGeometry(momoInstances.build),
      },
      tray: momoInstances.tray.map((instance) => ({
        visible: instance.holder.visible === true,
        ingredientCount: instance.ingredientCount(),
        geometry: assemblyInstanceGeometry(instance),
      })),
    },
    kawa: {
      status: kawaRuntime.status,
      build: {
        visible: kawaInstances.build?.holder.visible === true,
        ingredientCount: kawaInstances.build?.ingredientCount?.() ?? 0,
        geometry: assemblyInstanceGeometry(kawaInstances.build),
      },
      tray: kawaInstances.tray.map((instance) => ({
        visible: instance.holder.visible === true,
        ingredientCount: instance.ingredientCount(),
        geometry: assemblyInstanceGeometry(instance),
      })),
    },
    waitingCount: cook.waitingCount(),
    waitingItems: cook.waitingItems(),
  }),
  dockItems: () => dock.items(),
  dockSelectedId: () => dock.selectedId(),
  dockAdd: (item) => { const id = dock.add(item); render(); return id; },
  dockSelect: (id) => dock.select(id),
  cookSelectRecipe: (menuId) => { const result = cook.selectRecipe(menuId); render(); return result; },
  cookClickIngredient: (ingredientId) => { const result = cook.clickIngredient(ingredientId); render(); return result; },
  cookSelectAssemblySeasoning: (seasoning) => { const result = cook.selectAssemblySeasoning(seasoning); render(); return result; },
  cookBrushAssemblyTare: (coverage = 1) => { const result = cook.brushAssemblyTare(coverage); render(); return result; },
  cookAssemblyProgress: () => cook.assemblyProgress(),
  assemblyTareTargetBounds,
  cookFillAssembly: (menuId, seasoning = 'salt') => {
    const result = cook.debugFillAssembly(menuId, seasoning);
    render();
    return result;
  },
  cookAssemblyIndex: () => cook.assemblyIndex(),
  cookWaiting: () => cook.waitingCount(),
  cookSlots: () => cook.slotViews(performance.now()),
  grillSmoke: () => grillSmoke.snapshot(),
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
  audioState: () => gameAudio()?.state() ?? null,
  cookPlace: (menuId = null, seasoning = 'salt') => {
    const now = performance.now();
    const result = cook.placeToGrill(now, menuId, seasoning);
    syncRiskCount(now);
    render();
    return result;
  },
  cookClickSlot: (i) => clickGrillSlot(i, performance.now()),
  cookElapse: (sec) => {
    cook.debugElapse(sec);
    const now = performance.now();
    const views = cook.slotViews(now);
    updateGrillVisual(now, views);
    updateGrillStatus(now);
    render();
    return views;
  },
  cookTransferAssembly: () => {
    const result = cook.transferAssembly();
    if (result.ok) persistFirstOrderRuntime();
    render();
    return result;
  },
  cookWaitingProducts: () => cook.waitingProducts(),
  grillContract: () => ({
    contractId: activeGrillLayout.contractId,
    slots: computeGrillSlots(activeGrillLayout),
    initialPlacementSlots: activeGrillLayout.initialPlacementSlots,
    finishedTray: D1_GRILL_FINISHED_TRAY,
  }),
  grillWaitingControl: () => ({
    hidden: grillInventory.hidden,
    disabled: grillWaitingActions.negima.salt.disabled,
    waitingCount: grillWaitingNegima.dataset.waitingCount,
    hasEmptySlot: grillWaitingNegima.dataset.hasEmptySlot,
    ariaLabel: grillWaitingActions.negima.salt.getAttribute('aria-label'),
    saltWaitingCount: grillWaitingActions.negima.salt.dataset.waitingCount,
    tare: {
      hidden: grillWaitingActions.negima.tare.hidden,
      disabled: grillWaitingActions.negima.tare.disabled,
      ariaLabel: grillWaitingActions.negima.tare.getAttribute('aria-label'),
      waitingCount: grillWaitingActions.negima.tare.dataset.waitingCount,
    },
    rect: grillWaitingNegima.getBoundingClientRect().toJSON(),
    momo: {
      hidden: grillWaitingMomo.hidden,
      disabled: grillWaitingActions.momo.salt.disabled,
      waitingCount: grillWaitingMomo.dataset.waitingCount,
      hasEmptySlot: grillWaitingMomo.dataset.hasEmptySlot,
      ariaLabel: grillWaitingActions.momo.salt.getAttribute('aria-label'),
      saltWaitingCount: grillWaitingActions.momo.salt.dataset.waitingCount,
      tare: {
        hidden: grillWaitingActions.momo.tare.hidden,
        disabled: grillWaitingActions.momo.tare.disabled,
        ariaLabel: grillWaitingActions.momo.tare.getAttribute('aria-label'),
        waitingCount: grillWaitingActions.momo.tare.dataset.waitingCount,
      },
      rect: grillWaitingMomo.getBoundingClientRect().toJSON(),
    },
  }),
  grillFinishedInventory: () => ({
    hidden: grillInventory.hidden,
    total: dock.items().filter((item) => ['negima', 'momo', 'kawa'].includes(item.menuId)).length,
    groups: [...grillFinishedQualityList.querySelectorAll('[data-quality]')].map((card) => ({
      menu: card.dataset.menu,
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
