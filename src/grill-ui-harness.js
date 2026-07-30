import { D1_GRILL_SLOTS } from './config/d1GrillLayout.js';
import {
  GRILL_FINISHED_TRAY_APPROVED_INPUT,
  GRILL_FINISHED_TRAY_ART_FHD,
  GRILL_FINISHED_TRAY_RESERVED_FHD,
  GRILL_UI_AREAS_FHD,
  reportGrillUiNonIntrusion,
} from './config/grillUiLayout.js';

const receipts = [
  ['01', '네기마 ×3', '조리 중 1/3'],
  ['02', '네기마 ×2', '대기 0/2'],
  ['03', '네기마 ×1', '완료 1/1'],
  ['04', '네기마 ×3', '조리 중 2/3'],
  ['05', '네기마 ×2', '대기 1/2'],
  ['06', '네기마 ×1', '새 주문 0/1'],
];

const rail = document.querySelector('.receipt-rail');
for (const [seat, order, state] of receipts) {
  const card = document.createElement('li');
  card.className = 'receipt-card';
  card.dataset.testid = `grill-receipt-${seat}`;
  const number = document.createElement('strong');
  number.textContent = seat;
  const orderNode = document.createElement('span');
  orderNode.textContent = order;
  const stateNode = document.createElement('span');
  stateNode.className = 'state';
  stateNode.textContent = state;
  card.append(number, orderNode, stateNode);
  rail.append(card);
}

const interactionLayer = document.querySelector('#interaction-layer');
for (const slot of D1_GRILL_SLOTS) {
  const hit = document.createElement('div');
  hit.className = 'slot-hit';
  hit.dataset.testid = `slot-hit-${slot.index}`;
  hit.style.left = `${slot.hitRect.x * 100}%`;
  hit.style.top = `${slot.hitRect.y * 100}%`;
  hit.style.width = `${slot.hitRect.width * 100}%`;
  hit.style.height = `${slot.hitRect.height * 100}%`;
  const label = document.createElement('span');
  label.textContent = `slot ${slot.index + 1}`;
  hit.append(label);
  interactionLayer.append(hit);
}

function currentViewport() {
  const frame = document.querySelector('#frame').getBoundingClientRect();
  return { width: frame.width, height: frame.height };
}

window.__grillUiHarness = Object.freeze({
  sourceMasterId: 'CM-GRILL-STATION-QUEUED-SELECTION-R3',
  approvedInput: GRILL_FINISHED_TRAY_APPROVED_INPUT,
  sourceMode: 'development-placeholder-coordinate-parity',
  receiptCount: () => rail.children.length,
  layoutReport: () => reportGrillUiNonIntrusion(currentViewport()),
  contract: () => ({
    trayArtFhd: GRILL_FINISHED_TRAY_ART_FHD,
    reservedFhd: GRILL_FINISHED_TRAY_RESERVED_FHD,
    uiAreasFhd: GRILL_UI_AREAS_FHD,
  }),
});
