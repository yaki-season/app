import { RECIPE, COOK_THRESHOLDS_SEC, TAB_TRANSITION_MS } from './config/recipe.js';
import {
  STATUS,
  PROCESS,
  createInitialState,
  assetsLoaded,
  assetsFailed,
  retryLoad,
  clickIngredient,
  isAssemblyComplete,
  clickAssembledSkewer,
  placeOnGrill,
  faceElapsedMs,
  currentDoneness,
  clickGrillSkewer,
  tick,
  visibilityHidden,
  visibilityVisible,
  clickPlate,
  clickEmpty,
  clickOrderMat,
  clickTab,
  restart,
} from './state/gameState.js';
import { createGrillRenderer, createRasterGrillRenderer } from './render/grillRenderer.js';
import { NEGIMA_RASTER, allAssetUrls } from './config/assets.js';
import { classifyDoneness } from './config/recipe.js';
import { CUSTOMER_STATE, SATISFACTION } from './state/customer/customer.js';
import { createCustomerByIndex, CUSTOMER_TYPE_LABEL } from './state/customer/types.js';

const ASSET_URLS = {
  texture: '../art/skewer-negima-pixel.png',
  vert: './shaders/skewer.vert.glsl',
  frag: './shaders/skewer.frag.glsl',
};

const el = (id) => document.getElementById(id);

const ui = {
  orderStatusText: el('orderStatusText'),
  orderList: el('orderList'),
  screenAssembly: el('screen-assembly'),
  screenGrill: el('screen-grill'),
  screenCounter: el('screen-counter'),
  ingredientButtons: Array.from(document.querySelectorAll('.ingredient')),
  assembledSkewer: el('assembledSkewer'),
  assemblyHint: el('assemblyHint'),
  waitingSkewer: el('waitingSkewer'),
  grillSlot: el('grillSlot'),
  grillCanvas: el('grillCanvas'),
  grillFace: el('grillFace'),
  grillFeedback: el('grillFeedback'),
  grillSmoke: el('grillSmoke'),
  cookRingProgress: el('cookRingProgress'),
  deliverySlot: el('deliverySlot'),
  flyingIngredient: el('flyingIngredient'),
  counterPlate: el('counterPlate'),
  platedSkewerArt: el('platedSkewerArt'),
  orderMat: el('orderMat'),
  customer: document.querySelector('.customer'),
  patienceGauge: el('patienceGauge'),
  patienceFill: el('patienceFill'),
  loadingOverlay: el('loadingOverlay'),
  errorOverlay: el('errorOverlay'),
  errorMessage: el('errorMessage'),
  retryButton: el('retryButton'),
  resultOverlay: el('resultOverlay'),
  resultMessage: el('resultMessage'),
  restartButton: el('restartButton'),
  tabs: Array.from(document.querySelectorAll('.tab')),
};

// UI 참조 누락은 render() 한가운데서 예외로 터져 이후 화면 갱신을 통째로 막는다.
// 부팅 시점에 크게 실패시켜 원인을 바로 드러낸다.
const missingUi = Object.entries(ui)
  .filter(([, node]) => node == null || (Array.isArray(node) && node.length === 0))
  .map(([key]) => key);
if (missingUi.length > 0) {
  throw new Error(`UI 요소를 찾지 못했습니다: ${missingUi.join(', ')}`);
}

let state = createInitialState();
let grillRenderer = null;

// 손님 엔티티 (GPL-002). 요리사(state)와 분리된 자율 상태 머신.
// 유일한 접점은 서빙 하나뿐이다.
let customer = null;
let customerIndex = 0;

// 손님 스폰은 유형 4종을 순환한다 (혼술족 → 퇴근직장인 → 미식블로거 → 커플).
function spawnCustomer() {
  customer = createCustomerByIndex(customerIndex++);
}

// 한 손님이 모든 슬롯을 마쳤는가 (퇴장 중이거나 나갔음).
function isCustomerFinished() {
  return customer && (customer.state === CUSTOMER_STATE.LEAVING || customer.state === CUSTOMER_STATE.DONE);
}

// 다음 주문 슬롯을 위해 조리만 초기화한다. 손님은 유지된다.
function resetCookingForNextOrder() {
  piercingSlots.clear();
  lastDoneness = null;
  ui.flyingIngredient.hidden = true;
  ui.counterPlate.classList.remove('serving');
  state = restart(state);
}

// 서빙 접점 (GPL-002 §상세요구사항 5). 요리사의 원면 결과를 손님에게 넘기고
// 판정은 손님이 소유한다.
function serveToCustomer(nowMs) {
  if (!customer) return;
  customer.onServed(
    {
      category: 'skewer',
      recipeMatched: true, // 조립이 완료돼야 서빙 가능하므로 항상 일치
      frontResult: state.frontResult,
      backResult: state.backResult,
    },
    nowMs,
  );
}

// UI-001 §상세요구사항 17 — 잠금은 "같은 대상"에만 건다.
// 전역 잠금으로 만들면 서로 다른 대상의 연속 클릭까지 삼켜 화면 전체 입력이 막힌다.
const lockedTargets = new Set();

// 적정 구간 진입을 한 번만 알리기 위한 직전 판정
let lastDoneness = null;

// 다시 시도 시 이전 로딩 요청을 무효화하기 위한 시도 번호
let bootAttempt = 0;

function withLock(key, fn, ms = 200) {
  return (...args) => {
    if (lockedTargets.has(key)) return;
    lockedTargets.add(key);
    try {
      fn(...args);
    } finally {
      setTimeout(() => lockedTargets.delete(key), ms);
    }
  };
}

// 관통 연출이 끝날 때까지 채움을 미룰 조립 칸. 상태는 이미 진행했지만 화면상
// 재료가 아직 날아가는 중이므로 칸을 비워 둔다 (UI-001 §7).
const piercingSlots = new Set();

const RING_CIRCUMFERENCE = 2 * Math.PI * 46;
const BURNT_SEC = COOK_THRESHOLDS_SEC.burnt;

// 재료가 재료통에서 꼬치로 날아가 관통하는 연출.
// 들림 → 짧게 이동 → 0.12~0.18초 멈춤 → 관통 (UI-001 §상세요구사항 7)
function animateIngredientToSlot(ingredientEl, slotIndex, ingredient) {
  const slotEl = document.querySelector(`[data-testid="assembly-slot-${slotIndex}"]`);
  if (!slotEl || typeof ingredientEl.animate !== 'function') return;

  const from = ingredientEl.querySelector('.ingredient-icon').getBoundingClientRect();
  const to = slotEl.getBoundingClientRect();

  const flyer = ui.flyingIngredient;
  flyer.className = `flying-ingredient ${ingredient}`;
  flyer.hidden = false;
  flyer.style.left = `${from.left}px`;
  flyer.style.top = `${from.top}px`;

  const dx = to.left + to.width / 2 - (from.left + 20);
  const dy = to.top + to.height / 2 - (from.top + 20);

  piercingSlots.add(slotIndex);
  renderAssembly();

  const anim = flyer.animate(
    [
      { transform: 'translate(0, 0) scale(1)', offset: 0 },
      { transform: 'translate(0, -18px) scale(1.12)', offset: 0.18 }, // 들림
      { transform: `translate(${dx}px, ${dy}px) scale(1.05)`, offset: 0.6 }, // 이동
      { transform: `translate(${dx}px, ${dy}px) scale(1.05)`, offset: 0.92 }, // 멈춤
      { transform: `translate(${dx}px, ${dy}px) scale(0.85)`, offset: 1 }, // 관통
    ],
    // 연속 클릭 속도를 따라가도록 짧게 잡는다. 연출이 뒤처지면 주문표는
    // '조립 완료'인데 칸이 비어 보이는 상태 불일치가 생긴다.
    // 멈춤 구간은 0.32 × 380ms = 122ms로 UI-001 §7의 0.12~0.18초를 지킨다.
    { duration: 380, easing: 'ease-out' },
  );

  anim.onfinish = () => {
    flyer.hidden = true;
    piercingSlots.delete(slotIndex);
    slotEl.classList.add('piercing');
    setTimeout(() => slotEl.classList.remove('piercing'), 200);
    renderAssembly();
  };
}

function flashMismatch(ingredientEl, slotEl) {
  ingredientEl?.classList.add('mismatch');
  slotEl?.classList.add('mismatch');
  setTimeout(() => {
    ingredientEl?.classList.remove('mismatch');
    slotEl?.classList.remove('mismatch');
  }, 300);
}

function showGrillFeedback(text) {
  ui.grillFeedback.textContent = text;
  ui.grillFeedback.hidden = false;
  setTimeout(() => {
    ui.grillFeedback.hidden = true;
  }, 900);
}

// ── 렌더링 (상태 → DOM) ────────────────────────────────────────

function render() {
  const loading = state.status === STATUS.LOADING;
  ui.loadingOverlay.hidden = !loading || !!state.loadError;
  ui.errorOverlay.hidden = !state.loadError;
  if (state.loadError) ui.errorMessage.textContent = `필수 에셋을 불러오지 못했습니다: ${state.loadError}`;

  // 결과는 손님이 모든 슬롯을 마치고 퇴장할 때 보여준다. 다중 슬롯 손님은
  // 중간 서빙 뒤 재주문으로 이어지므로 그 시점에 결과를 띄우지 않는다.
  const resultVisible = state.status === STATUS.FAILED || isCustomerFinished();
  ui.resultOverlay.hidden = !resultVisible;
  if (resultVisible) {
    // 서빙 결과 문구는 손님 판정에서 온다. 요리사는 판정하지 않는다.
    const satisfaction = customer?.overallSatisfaction();
    ui.resultMessage.textContent =
      state.status === STATUS.FAILED
        ? '꼬치가 타버렸습니다. 다시 만들어 볼까요?'
        : satisfaction === SATISFACTION.GOOD
          ? '손님이 만족했습니다! 완벽한 굽기였어요.'
          : satisfaction === SATISFACTION.FAIL
            ? '주문과 다른 꼬치라 손님이 실망했습니다.'
            : '손님이 받았지만 살짝 과하게 익었다고 아쉬워합니다.';
  }

  const ready = !loading && !state.loadError;
  ui.screenAssembly.hidden = !(ready && state.process === PROCESS.ASSEMBLY);
  ui.screenGrill.hidden = !(ready && state.process === PROCESS.GRILL);
  ui.screenCounter.hidden = !(ready && state.process === PROCESS.COUNTER);

  renderOrderBar();
  renderAssembly();
  renderGrill(performance.now());
  renderCounter();
  renderTabs();
}

function renderOrderBar() {
  ui.orderList.innerHTML = '';
  RECIPE.forEach((ingredient, i) => {
    const li = document.createElement('li');
    li.textContent = ingredient === 'chicken' ? '닭' : '파'; // 스크린리더·폴백용, 시각적으로는 아이콘
    li.dataset.ingredient = ingredient;
    li.dataset.testid = `order-slot-${i}`;
    if (i < state.assemblyIndex) li.classList.add('done');
    else if (i === state.assemblyIndex && state.status === STATUS.ASSEMBLY) li.classList.add('next');
    ui.orderList.appendChild(li);
  });

  // 손님이 아직 주문하지 않았으면(입장·주문 중) 그 상태를 우선 안내한다 (GPL-002 상태 노출).
  const preOrder =
    customer &&
    (customer.state === CUSTOMER_STATE.ENTERING || customer.state === CUSTOMER_STATE.ORDERING) &&
    state.status === STATUS.ASSEMBLY;

  // 다중 슬롯 손님은 몇 번째 주문인지 함께 알린다
  const slotSuffix =
    customer && customer.orderSequence.length > 1
      ? ` (${customer.slotIndex + 1}/${customer.orderSequence.length})`
      : '';

  ui.orderStatusText.textContent = preOrder
    ? customer.state === CUSTOMER_STATE.ENTERING
      ? '손님이 들어옵니다…'
      : `${CUSTOMER_TYPE_LABEL[customer.type] ?? '손님'}이 네기마를 주문했습니다${slotSuffix}`
    : {
        [STATUS.LOADING]: '준비 중…',
        [STATUS.ASSEMBLY]: isAssemblyComplete(state) ? '조립 완료 — 꼬치를 그릴로 옮기세요' : '재료를 순서대로 클릭하세요',
        [STATUS.GRILL_FRONT]: '앞면을 굽는 중',
        [STATUS.GRILL_BACK]: '뒷면을 굽는 중',
        [STATUS.PLATED]: '접시에 담았습니다',
        [STATUS.SERVED]: '서빙 완료',
        [STATUS.FAILED]: '조리 실패',
      }[state.status] || '';

  // 인내심 게이지: 손님이 대기 중일 때 표시하되 감소하지 않는다 (골격).
  const showPatience = customer && customer.state === CUSTOMER_STATE.WAITING;
  ui.patienceGauge.hidden = !showPatience;
  if (showPatience) ui.patienceFill.style.width = '100%';
}

function renderAssembly() {
  const slots = [0, 1, 2, 3, 4].map((i) => document.querySelector(`[data-testid="assembly-slot-${i}"]`));
  slots.forEach((slotEl, i) => {
    slotEl.classList.remove('filled-chicken', 'filled-leek');
    // 아직 재료가 날아가는 중인 칸은 비워 둔다
    if (i < state.assemblyIndex && !piercingSlots.has(i)) slotEl.classList.add(`filled-${RECIPE[i]}`);
  });

  const complete = isAssemblyComplete(state);
  ui.assembledSkewer.disabled = !complete;
  ui.assembledSkewer.classList.toggle('assembled', complete);
  ui.deliverySlot.classList.toggle('ready', complete);
  ui.assemblyHint.textContent = complete
    ? '완성된 꼬치를 클릭해 그릴로 옮기세요.'
    : `다음 재료: ${RECIPE[state.assemblyIndex] === 'chicken' ? '닭다리살' : '대파'}`;
}

function renderGrill(nowMs) {
  const onGrill = state.status === STATUS.GRILL_FRONT || state.status === STATUS.GRILL_BACK;
  // 대기 꼬치는 그릴에 아직 배치되지 않은 조립 완료 상태에서만 보인다.
  ui.waitingSkewer.hidden = !(state.process === PROCESS.GRILL && state.status === STATUS.ASSEMBLY && isAssemblyComplete(state));
  ui.grillSlot.hidden = state.process !== PROCESS.GRILL;
  // 꼬치가 올라가 있는 동안만 숯불이 살아난 화로를 쓴다
  ui.grillSlot.classList.toggle('hot', onGrill);

  if (onGrill) {
    const elapsedSec = faceElapsedMs(state, nowMs) / 1000;
    const doneness = currentDoneness(state, nowMs);

    ui.grillFace.hidden = false;
    ui.grillFace.textContent = `${state.status === STATUS.GRILL_FRONT ? '앞면' : '뒷면'} · ${
      { under: '덜 익음', perfect: '적정', over: '과다', burnt: '탄 상태' }[doneness]
    }`;
    ui.grillFace.className = `face-badge doneness-${doneness}`;

    // 색 외의 신호 1: 진행 링의 채워진 각도 (UI-001 §11)
    const progress = Math.min(elapsedSec / BURNT_SEC, 1);
    ui.cookRingProgress.style.strokeDasharray = `${progress * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
    ui.cookRingProgress.setAttribute('class', `cook-ring-progress doneness-${doneness}`);

    // 색 외의 신호 2: 연기 세기
    ui.grillSmoke.style.opacity = { under: 0.15, perfect: 0.5, over: 0.85, burnt: 1 }[doneness];

    // 적정 구간 진입 순간의 짧은 윤기 (UI-001 §12)
    if (doneness === 'perfect' && lastDoneness !== 'perfect') {
      ui.grillSlot.classList.add('perfect-enter');
      setTimeout(() => ui.grillSlot.classList.remove('perfect-enter'), 500);
    }
    lastDoneness = doneness;

    if (grillRenderer) grillRenderer.render(nowMs, elapsedSec);
  } else {
    ui.grillFace.hidden = true;
    ui.grillSmoke.style.opacity = 0;
    ui.cookRingProgress.style.strokeDasharray = `0 ${RING_CIRCUMFERENCE}`;
    lastDoneness = null;
    if (grillRenderer) grillRenderer.render(nowMs, null);
  }
}

function renderCounter() {
  const hasPlate = state.status === STATUS.PLATED;
  ui.counterPlate.hidden = !(state.process === PROCESS.COUNTER && hasPlate);
  ui.counterPlate.classList.toggle('selected', state.plateSelected);
  // 접시를 선택하면 손님 주문 매트를 목적지로 강조한다 (UI-001 §14)
  ui.orderMat.classList.toggle('highlight', state.plateSelected);

  // 접시 위 꼬치는 실제 굽기 결과를 반영한다 (ART-001 §적용요구사항 2)
  const plateState = state.frontResult === 'over' || state.backResult === 'over' ? 'over' : 'perfect';
  ui.platedSkewerArt.style.backgroundImage = `url("${NEGIMA_RASTER[plateState]}")`;

  // 손님 반응: 손님 엔티티의 mood를 그대로 반영한다 (판정 소유는 손님).
  // 서빙을 받아 먹는 중이거나 퇴장할 때 반응을 보이고, 그 외에는 대기 표정이다.
  const showMood =
    customer?.mood && (customer.state === CUSTOMER_STATE.EATING || isCustomerFinished());
  ui.customer.className = `customer ${showMood ? customer.mood : 'idle'}`;
}

function renderTabs() {
  ui.tabs.forEach((btn) => {
    const process = btn.dataset.process;
    btn.classList.toggle('active', state.process === process);
    const reachable =
      process === PROCESS.ASSEMBLY ||
      state.completedProcesses.includes(process) ||
      (process === PROCESS.GRILL && state.process === PROCESS.GRILL) ||
      (process === PROCESS.COUNTER && state.status === STATUS.PLATED);
    btn.disabled = !reachable || state.status === STATUS.LOADING;
  });
}

// ── 입력 ───────────────────────────────────────────────────────

ui.ingredientButtons.forEach((btn) => {
  btn.addEventListener(
    'click',
    withLock(`ingredient-${btn.dataset.ingredient}`, (e) => {
      const ingredient = e.currentTarget.dataset.ingredient;
      const prevIndex = state.assemblyIndex;
      state = clickIngredient(state, ingredient, performance.now());

      if (state.assemblyIndex === prevIndex) {
        // 잘못된 재료 — 재료통과 주문표의 올바른 다음 칸을 서로 다르게 강조 (UI-001 §8).
        // render()가 주문표 DOM을 다시 만들므로 강조는 반드시 그 뒤에 붙여야 한다.
        render();
        const slotEl = document.querySelector(`[data-testid="order-slot-${prevIndex}"]`);
        flashMismatch(e.currentTarget, slotEl);
        return;
      }

      render();
      animateIngredientToSlot(e.currentTarget, prevIndex, ingredient);
    }, 160),
  );
});

ui.assembledSkewer.addEventListener(
  'click',
  withLock(
    'assembled-skewer',
    () => {
      if (!isAssemblyComplete(state)) return;
      // 전달 위치로 보내는 연출을 먼저 보여주고 그릴 화면으로 자동 전환한다 (UI-001 §화면구조 4)
      ui.deliverySlot.classList.add('ready');
      setTimeout(() => {
        state = clickAssembledSkewer(state);
        render();
      }, TAB_TRANSITION_MS);
    },
    TAB_TRANSITION_MS + 100,
  ),
);

ui.waitingSkewer.addEventListener(
  'click',
  withLock('waiting-skewer', () => {
    state = placeOnGrill(state, performance.now());
    render();
  }),
);

ui.grillCanvas.addEventListener(
  'click',
  withLock('grill-canvas', () => {
    const before = state.status;
    const doneness = currentDoneness(state, performance.now());
    state = clickGrillSkewer(state, performance.now());
    if (state.status === before && doneness === 'under') {
      showGrillFeedback('아직 덜 익었어요 — 조금 더 굽기');
    }
    render();
    if (state.status === STATUS.PLATED) {
      setTimeout(() => {
        state = clickTab(state, PROCESS.COUNTER);
        render();
      }, 450);
    }
  }),
);

ui.counterPlate.addEventListener(
  'click',
  withLock('counter-plate', () => {
    state = clickPlate(state);
    render();
  }),
);

ui.orderMat.addEventListener(
  'click',
  withLock(
    'order-mat',
    () => {
      if (state.status !== STATUS.PLATED || !state.plateSelected) return;
      // 접시가 카운터를 가로질러 이동한 뒤 손님 반응을 표시한다 (UI-001 §15)
      ui.counterPlate.classList.add('serving');
      setTimeout(() => {
        ui.counterPlate.classList.remove('serving');
        state = clickOrderMat(state);
        serveToCustomer(performance.now()); // 손님이 판정 (GPL-002 §5)
        render();
      }, TAB_TRANSITION_MS);
    },
    TAB_TRANSITION_MS + 100,
  ),
);

ui.screenCounter.addEventListener('click', (e) => {
  if (e.target === ui.screenCounter) {
    state = clickEmpty(state);
    render();
  }
});

ui.retryButton.addEventListener('click', () => {
  state = retryLoad(state);
  render();
  boot();
});

ui.restartButton.addEventListener(
  'click',
  withLock('restart-button', () => {
    // 일회성 애니메이션 잠금도 함께 초기값으로 되돌린다 (SYS-001 §상세요구사항 7).
    // lockedTargets는 여기서 비우지 않는다 — 자기 자신의 잠금까지 풀려 재시작이 두 번 실행된다.
    resetCookingForNextOrder();
    spawnCustomer(); // 손님 상태·슬롯·mood·판정 초기화 (GPL-002 §13)
    render();
  }),
);

ui.tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    state = clickTab(state, btn.dataset.process);
    render();
  });
});

document.addEventListener('visibilitychange', () => {
  const now = performance.now();
  state = document.hidden ? visibilityHidden(state, now) : visibilityVisible(state, now);
  // 손님의 시간 구동 전이도 함께 정지·재개한다 (SYS-001 백그라운드 처리와 정합)
  if (customer) {
    if (document.hidden) customer.pause(now);
    else customer.resume(now);
  }
  render();
});

// 창 밖 마우스업/포커스 이탈 시 잠금을 풀어 마지막 유효 상태로 복구한다 (UI-001 §데스크톱 화면 요구사항).
// 상태 자체는 클릭 시점에만 변하므로 되돌릴 진행 상태는 없다.
window.addEventListener('blur', () => {
  lockedTargets.clear();
});

// ── 메인 루프 ─────────────────────────────────────────────────

function loop(nowMs) {
  const prevStatus = state.status;
  const prevCustomerState = customer?.state;
  const prevSlot = customer?.slotIndex;

  state = tick(state, nowMs);
  if (customer) customer.update(nowMs); // 손님은 시간 구동 (GPL-002 §3)

  // 재주문: 손님이 다음 슬롯으로 넘어가면 조리만 초기화해 다음 꼬치를 굽게 한다.
  // 손님은 유지되므로 누적 판정·팁이 이어진다.
  if (customer && customer.slotIndex !== prevSlot && customer.slotIndex > 0) {
    resetCookingForNextOrder();
  }

  const changed =
    state.status !== prevStatus ||
    customer?.state !== prevCustomerState ||
    customer?.slotIndex !== prevSlot;
  if (changed) render();
  else if (state.status === STATUS.GRILL_FRONT || state.status === STATUS.GRILL_BACK) renderGrill(nowMs);

  requestAnimationFrame(loop);
}

// ── 부팅 ─────────────────────────────────────────────────────

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error(`에셋 로드 실패: ${url}`));
    img.src = url;
  });
}

async function boot() {
  // 늦게 도착한 이전 시도의 응답이 새 세션을 덮어쓰지 않게 한다 (SYS-001 §예외조건)
  const attempt = ++bootAttempt;

  try {
    // 필수 에셋을 모두 받은 뒤에만 입력을 활성화한다 (SYS-001 §상세요구사항 8)
    await Promise.all(allAssetUrls().map(preloadImage));

    try {
      grillRenderer = await createGrillRenderer(ui.grillCanvas, {
        textureUrl: ASSET_URLS.texture,
        vertUrl: ASSET_URLS.vert,
        fragUrl: ASSET_URLS.frag,
      });
    } catch (glErr) {
      // WebGL2를 못 쓰면 빈 캔버스 대신 상태별 래스터로 그린다 (ART-001 §예외조건 3)
      console.warn('WebGL2 경로 실패, 래스터 대체 렌더러를 사용합니다:', glErr.message);
      grillRenderer = await createRasterGrillRenderer(ui.grillCanvas, NEGIMA_RASTER, classifyDoneness);
    }

    if (attempt !== bootAttempt) return;
    state = assetsLoaded(state);
    spawnCustomer(); // 에셋 로딩 완료 후 손님 입장
  } catch (err) {
    console.error(err);
    if (attempt !== bootAttempt) return;
    state = assetsFailed(state, err.message);
  }
  render();
}

requestAnimationFrame(loop);
boot();

// 개발 모드 상태 관찰 지점 (SYS-001 §상세요구사항 10) — UI에는 노출하지 않는다.
window.__yakiDebug = {
  getState: () => state,
  getCustomer: () => customer,
};
if (new URLSearchParams(location.search).has('debug')) {
  setInterval(() => {
    console.debug('[yaki]', state.process, state.status, {
      front: state.frontResult,
      back: state.backResult,
      elapsedMs: faceElapsedMs(state, performance.now()),
    });
  }, 1000);
}
