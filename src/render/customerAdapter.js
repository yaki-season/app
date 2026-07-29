// 손님 화면 렌더 어댑터 (SYS-002 v3 / UI-003 SCR-SVC-CUSTOMERS).
//
// 006/GPL-003의 손님·주문·좌석 데이터를 6석 화면의 렌더 상태로 투영한다. 이 모듈은 "어떻게 보이는가"만
// 담당하고, 손님 배정·대기 감소·정리 같은 운영 로직은 006이 소유한다. 텍스트·게이지는 DOM으로 낸다(§51).

import { SEAT_IDS, SEAT_ACTOR_MOOD } from '../config/screenLayout.js';

// 순수 매핑: 점유 목록 → 6석 렌더 상태. 006이 넣을 인터페이스.
// occupants: [{ seatId, mood, orderLabel, waitRatio }], opts.serveReady: 완성품을 낼 수 있는가.
export function buildSeatStates(occupants = [], { serveReady = false } = {}) {
  const bySeat = new Map(occupants.map((o) => [o.seatId, o]));
  return SEAT_IDS.map((seatId) => {
    const o = bySeat.get(seatId);
    if (!o) return { seatId, occupied: false, mood: 'waiting', orderLabel: '', waitRatio: 0, serveTarget: false };
    return {
      seatId,
      occupied: true,
      mood: o.mood || 'waiting',
      orderLabel: o.orderLabel || '',
      waitRatio: o.waitRatio != null ? o.waitRatio : 1,
      serveTarget: serveReady,
    };
  });
}

// DOM 말풍선·게이지 + 좌석 액터/serve 메시를 구동한다.
export function createCustomerAdapter({ renderer, container, customerScreenId = 'SCR-SVC-CUSTOMERS' }) {
  const bubbles = {}; // seatId → { el, label, fill }
  for (const seatId of SEAT_IDS) {
    const el = document.createElement('div');
    el.className = 'order-bubble';
    el.dataset.testid = `bubble-${seatId}`;
    el.hidden = true;
    el.innerHTML = `<span class="order-label"></span><div class="wait-gauge"><span class="wait-fill"></span></div>`;
    container.appendChild(el);
    bubbles[seatId] = { el, label: el.querySelector('.order-label'), fill: el.querySelector('.wait-fill') };
  }

  let states = buildSeatStates();

  function apply(nextStates) {
    states = nextStates;
    for (const s of states) {
      const actor = renderer.seatActorMesh[s.seatId];
      if (actor) {
        actor.visible = s.occupied;
        if (s.occupied) actor.material.color.setHex(SEAT_ACTOR_MOOD[s.mood] ?? SEAT_ACTOR_MOOD.waiting);
      }
      const serve = renderer.objectMesh[`seatServe:${s.seatId}`];
      if (serve) serve.visible = s.serveTarget;

      const b = bubbles[s.seatId];
      b.label.textContent = s.orderLabel;
      b.fill.style.width = `${Math.round(Math.max(0, Math.min(1, s.waitRatio)) * 100)}%`;
    }
  }

  // 매 프레임: 활성 화면이 손님 화면일 때만 점유 좌석 말풍선을 좌석 위에 배치한다.
  function tick(activeScreenId) {
    const show = activeScreenId === customerScreenId;
    for (const s of states) {
      const b = bubbles[s.seatId];
      if (!show || !s.occupied) { b.el.hidden = true; continue; }
      const p = renderer.projectToScreen(renderer.seatBubbleWorld[s.seatId]);
      b.el.style.left = `${p.x}px`;
      b.el.style.top = `${p.y}px`;
      b.el.hidden = false;
    }
  }

  return { apply, tick, getStates: () => states };
}
