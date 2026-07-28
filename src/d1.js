import {
  D1_PHASE, MENU,
  acceptOrder, addIngredient, advanceFromPreparedFood, beginFoodAssembly, beginGrill,
  beginServing, collectSkewer, completeReaction, confirmServing, createD1Session,
  enterCustomer, finishBeer, orderItemProgress, placeOnGrill, pourBeerFor, turnSkewer,
} from './state/d1/session.js';

const controls = document.querySelector('#controls');
const preparedList = document.querySelector('#prepared-list');
const orderItems = document.querySelector('#order-items');
const customerState = document.querySelector('#customer-state');
const guide = document.querySelector('#guide');
const stateOutput = document.querySelector('#state-output');
const customerArt = document.querySelector('#customer-art');
let state = createD1Session();
let nowMs = 0;

// public/assets/manifest.json의 승인 runtime URL만 소비한다. 수량·체크·상태 텍스트는 DOM 소유다.
const ASSET_URL = Object.freeze({
  negima: '/assets/core/ui/order-icon-negima-r1-b1.png',
  draftBeer: '/assets/core/ui/order-icon-draft-beer-r1-b1.png',
  waiting: '/assets/core/customer/d1-tsukioka-waiting-r2-b1.png',
  partialBeer: '/assets/core/customer/d1-tsukioka-partial-beer-waiting-r1-b1.png',
  eatingNegima: '/assets/core/customer/d1-tsukioka-received-eating-negima-r1-b1.png',
  eatingBeer: '/assets/core/customer/d1-tsukioka-received-eating-beer-r1-b1.png',
});

const labels = { entering:'손님이 입장 중입니다.', ordering:'주문을 고민하고 있습니다.', waiting:'주문을 기다리고 있습니다.', 'partially-served':'생맥주를 받았습니다. 네기마를 기다립니다.', reacting:'첫 주문을 맛보고 있습니다.', completed:'첫 주문이 완료되었습니다.' };
const guides = {
  [D1_PHASE.ENTERING]:'손님을 자리로 안내하세요.',
  [D1_PHASE.ORDERING]:'주문을 접수하세요.',
  [D1_PHASE.DRINK]:'레버 아래 영역으로 맥주를 먼저 따르세요.',
  [D1_PHASE.DRINK_SERVE]:'완성 생맥주를 손님에게 부분 제공하세요.',
  [D1_PHASE.ASSEMBLY]:'네기마 세 개를 닭·파 순서로 조립하세요.',
  [D1_PHASE.GRILL]:'빈 두 칸에 먼저 두 개를 올려 각 면을 따로 조리하세요.',
  [D1_PHASE.FOOD_SERVE]:'준비 목록의 네기마 세 개를 모두 제공하세요.',
  [D1_PHASE.REACTION]:'츠키오카의 첫 주문 반응을 확인하세요.',
  [D1_PHASE.COMPLETE]:'D1 첫 주문을 완료했습니다.',
};

function button(label, action, className = '') {
  const node = document.createElement('button');
  node.type = 'button'; node.textContent = label; node.className = className;
  node.addEventListener('click', () => { state = action(state); render(); });
  return node;
}
function section(title) { const node = document.createElement('section'); node.className = 'station-card'; const h = document.createElement('h3'); h.textContent = title; node.append(h); return node; }
function row(parent) { const node = document.createElement('div'); node.className = 'action-row'; parent.append(node); return node; }
function addText(parent, value, className = '') { const node = document.createElement('p'); node.className = className; node.textContent = value; parent.append(node); }

function renderOrder() {
  orderItems.replaceChildren();
  for (const [menuId, label] of [[MENU.DRAFT_BEER, '생맥주'], [MENU.NEGIMA, '네기마']]) {
    const progress = orderItemProgress(state, menuId);
    const li = document.createElement('li'); li.className = `order-item ${progress.remaining === 0 ? 'done' : ''}`;
    li.dataset.testid = `order-${menuId}`;
    const icon = progress.remaining === 0
      ? '✓'
      : `<img src="${menuId === MENU.DRAFT_BEER ? ASSET_URL.draftBeer : ASSET_URL.negima}" alt="">`;
    li.innerHTML = `<span class="order-icon" aria-hidden="true">${icon}</span><span>${label}</span><span class="order-count">x${progress.remaining}/${progress.total}</span>`;
    orderItems.append(li);
  }
}
function renderPrepared() {
  preparedList.replaceChildren();
  if (!state.prepared.length) { const empty = document.createElement('span'); empty.textContent = '준비된 완성품이 없습니다.'; preparedList.append(empty); return; }
  for (const card of state.prepared) {
    const node = button(`${card.menuId === MENU.DRAFT_BEER ? '생맥주' : '네기마'} x${card.quantity} · ${card.quality}`, (s) => beginServing(s, card.id));
    node.className = 'prepared-card'; node.dataset.testid = `prepared-${card.menuId}`; node.setAttribute('aria-label', `${card.menuId} ${card.quantity}개 제공 선택`);
    preparedList.append(node);
  }
}
function renderServingChoice() {
  if (!state.pendingService) return;
  const choice = document.createElement('div'); choice.className = 'service-choice'; choice.dataset.testid = 'service-choice';
  choice.append(button('1개만 제공', (s) => confirmServing(s, 'one')), button('다 주기', (s) => confirmServing(s, 'all'), 'action-primary'));
  controls.append(choice);
}
function renderControls() {
  controls.replaceChildren();
  if (state.phase === D1_PHASE.ENTERING) controls.append(button('손님 입장 완료', enterCustomer, 'action-primary'));
  if (state.phase === D1_PHASE.ORDERING) controls.append(button('D1 주문 접수', acceptOrder, 'action-primary'));
  if (state.phase === D1_PHASE.DRINK) {
    const card = section('생맥주 단일 레버');
    addText(card, `맥주 ${Math.round(state.beer.beerMs / 100) / 10}초 · 거품 ${Math.round(state.beer.foamMs / 100) / 10}초`, 'meter');
    const actions = row(card);
    actions.append(button('레버 아래: 맥주 3초', (s) => pourBeerFor(s, 'beer', 3000, nowMs)), button('레버 위: 거품 1초', (s) => pourBeerFor(s, 'foam', 1000, nowMs)));
    card.append(button('완성 잔을 준비 목록으로', finishBeer, 'action-primary'));
    controls.append(card);
  }
  if (state.phase === D1_PHASE.DRINK_SERVE && orderItemProgress(state, MENU.DRAFT_BEER).remaining === 0) controls.append(button('네기마 조립 시작', beginFoodAssembly, 'action-primary'));
  if (state.phase === D1_PHASE.ASSEMBLY) {
    const card = section('네기마 조립'); const grid = document.createElement('div'); grid.className = 'skewer-grid'; card.append(grid);
    for (const skewer of state.skewers) {
      const expected = ['닭', '파', '닭', '파', '닭'][skewer.assemblyIndex];
      const action = skewer.state === 'assembly' ? button(`${skewer.id} · ${expected} 넣기`, (s) => addIngredient(s, skewer.id, expected === '닭' ? 'chicken' : 'leek')) : document.createElement('span');
      if (skewer.state !== 'assembly') action.textContent = `${skewer.id} · 조립 완료`;
      grid.append(action);
    }
    card.append(button('조립한 3개를 그릴로', beginGrill, 'action-primary')); controls.append(card);
  }
  if (state.phase === D1_PHASE.GRILL) {
    const card = section('2칸 그릴'); const grid = document.createElement('div'); grid.className = 'grill-grid'; card.append(grid);
    for (const skewer of state.skewers) {
      if (skewer.state === 'queue') {
        const slot = state.grillSlots.findIndex((value) => value === null);
        if (slot >= 0) grid.append(button(`${skewer.id} → ${slot + 1}번 칸`, (s) => placeOnGrill(s, skewer.id, slot, nowMs)));
      } else if (skewer.state === 'grilling' && skewer.side === 'front') grid.append(button(`${skewer.id} 앞면 뒤집기`, (s) => {
        nowMs = Math.max(nowMs, skewer.sideStartedAtMs + 8000);
        return turnSkewer(s, skewer.id, skewer.sideStartedAtMs + 8000);
      }));
      else if (skewer.state === 'grilling') grid.append(button(`${skewer.id} 뒷면 회수`, (s) => {
        nowMs = Math.max(nowMs, skewer.sideStartedAtMs + 8000);
        return collectSkewer(s, skewer.id, skewer.sideStartedAtMs + 8000);
      }));
    }
    if (state.skewers.every((skewer) => skewer.state === 'prepared' || skewer.state === 'discarded')) card.append(button('네기마 제공으로 이동', advanceFromPreparedFood, 'action-primary'));
    controls.append(card);
  }
  if (state.phase === D1_PHASE.REACTION) controls.append(button('손님 반응 확인', completeReaction, 'action-primary'));
  if (state.phase === D1_PHASE.COMPLETE) addText(controls, `주문 만족도 ${state.orderSatisfaction}점 · ${state.customer.reaction}`);
  renderServingChoice();
}
function render() {
  renderOrder(); renderPrepared(); renderControls();
  customerState.textContent = labels[state.customer.state] || state.customer.state;
  guide.textContent = guides[state.phase];
  stateOutput.value = JSON.stringify(state);
  const customerAsset = state.customer.state === 'partially-served'
    ? ASSET_URL.partialBeer
    : state.phase === D1_PHASE.REACTION
      ? ASSET_URL.eatingNegima
      : state.phase === D1_PHASE.COMPLETE
        ? ASSET_URL.eatingBeer
      : ASSET_URL.waiting;
  if (customerArt.getAttribute('src') !== customerAsset) customerArt.setAttribute('src', customerAsset);
}
render();
window.__d1Debug = { getState: () => state, now: () => nowMs };
