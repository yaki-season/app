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

function groupedPhase(members) {
  if (members.some((member) => member.phase === 'thinking')) return 'thinking';
  if (members.some((member) => member.phase === 'ordering')) return 'ordering';
  if (members.some((member) => member.phase === 'waiting')) return 'waiting';
  if (members.some((member) => member.phase === 'eating')) return 'eating';
  if (members.some((member) => member.phase === 'done')) return 'done';
  if (members.some((member) => member.phase === 'leaving')) return 'leaving';
  if (members.some((member) => member.phase === 'cleanup')) return 'cleanup';
  return members[0]?.phase ?? 'empty';
}

function groupedOrderLabel(members) {
  const uniqueOrders = new Map();
  for (const member of members) {
    const orderKey = member.orderId ?? `seat:${member.seatId}`;
    if (!uniqueOrders.has(orderKey)) uniqueOrders.set(orderKey, member);
  }
  const itemTotals = new Map();
  for (const member of uniqueOrders.values()) {
    for (const item of member.remainingItems ?? []) {
      const key = `${item.menuId}:${item.seasoning ?? 'none'}`;
      const current = itemTotals.get(key) ?? { ...item, remaining: 0 };
      current.remaining += item.remaining;
      itemTotals.set(key, current);
    }
  }
  const merged = [...itemTotals.values()]
    .filter((item) => item.remaining > 0)
    .map((item) => `${item.menuLabel}${item.remaining > 1 ? ` ×${item.remaining}` : ''}`);
  if (merged.length > 0) return merged.join(' · ');
  return [...new Set([...uniqueOrders.values()].map((member) => member.orderLabel).filter(Boolean))]
    .join(' · ');
}

// 좌석 단위 상태를 주문서 단위로 바꾼다. 개인 손님은 좌석당 한 장을 유지하고,
// 그룹은 orderId를 중복 제거한 뒤 한 장으로 합쳐 두 손님 사이에 배치할 수 있게 한다.
export function buildOrderBubblePresentations(states = []) {
  const presentations = [];
  const handledGroupIds = new Set();
  for (const state of states) {
    if (!state.groupId) {
      presentations.push({ ...state, memberSeatIds: [state.seatId] });
      continue;
    }
    if (handledGroupIds.has(state.groupId)) continue;
    handledGroupIds.add(state.groupId);
    const members = states.filter((candidate) => candidate.groupId === state.groupId);
    presentations.push({
      ...state,
      occupied: members.some((member) => member.occupied),
      phase: groupedPhase(members),
      mood: members.some((member) => member.mood === 'retry') ? 'retry' : state.mood,
      orderLabel: groupedOrderLabel(members),
      waitRatio: Math.min(...members.map((member) => member.waitRatio ?? 1)),
      urgent: members.some((member) => member.urgent),
      canOrder: members.every((member) => member.canOrder),
      memberSeatIds: members.map((member) => member.seatId),
    });
  }
  return presentations;
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
    bubbles[seatId] = { el, label: el.querySelector('.order-label'), gauge: el.querySelector('.wait-gauge'), fill: el.querySelector('.wait-fill') };
  }

  let states = buildSeatStates();
  let bubblePresentations = buildOrderBubblePresentations(states);

  // 말풍선 내용·게이지를 phase별로 정한다. phase가 없으면(증분 2 스타일) 단순 주문 표시로 처리.
  function bubbleFor(s) {
    const phase = s.phase || (s.occupied ? 'waiting' : 'empty');
    const groupPrefix = s.groupId ? '그룹 주문 · ' : '';
    switch (phase) {
      case 'thinking': return { text: '…', ratio: null, tone: 'think' };
      case 'ordering': return { text: `${s.groupId ? '그룹 주문' : '주문서'} · ${s.orderLabel}`, ratio: s.waitRatio, tone: 'order' };
      case 'waiting': return { text: `${groupPrefix}${s.orderLabel}`, ratio: s.waitRatio, tone: 'wait' };
      case 'eating': return { text: '식사 중', ratio: null, tone: 'eat' };
      case 'done': return { text: '완료 (동행 대기)', ratio: null, tone: 'eat' };
      case 'leaving': return { text: s.mood === 'retry' ? '화남!' : '고맙습니다', ratio: null, tone: 'leave' };
      case 'cleanup': return { text: '정리', ratio: s.cleanupProgress || 0, tone: 'cleanup' };
      default: return { text: s.orderLabel || '', ratio: s.waitRatio, tone: 'wait' };
    }
  }

  function apply(nextStates, { actorsVisible = true } = {}) {
    states = nextStates;
    bubblePresentations = buildOrderBubblePresentations(states);
    for (const s of states) {
      const customerPresent = s.occupied
        && !s.cleanupNeeded
        && !['empty', 'leaving', 'cleanup'].includes(s.phase);
      const actor = renderer.seatActorMesh[s.seatId];
      if (actor) {
        // 손님 화면에서만 좌석 손님을 보인다(다른 화면 카메라에 걸쳐 보이지 않도록).
        actor.visible = customerPresent && actorsVisible;
        // 아트 텍스처가 있으면 색 틴트를 하지 않는다(기분은 말풍선·게이지로 표시). 더미면 기분 색.
        if (customerPresent && !actor.material.map) actor.material.color.setHex(SEAT_ACTOR_MOOD[s.mood] ?? SEAT_ACTOR_MOOD.waiting);
      }
      // 좌석 조작 메시(seatServe) 가시성은 호출측(game.js syncCustomers)이 phase로 정한다.

    }
    for (const s of bubblePresentations) {
      const b = bubbles[s.seatId];
      const info = bubbleFor(s);
      b.label.textContent = info.text;
      b.el.dataset.tone = info.tone;
      if (info.ratio == null) {
        b.gauge.hidden = true;
        b.el.dataset.urgent = '0';
      } else {
        b.gauge.hidden = false;
        b.fill.style.width = `${Math.round(Math.max(0, Math.min(1, info.ratio)) * 100)}%`;
        // 인내심 임박(긴급): 게이지·말풍선에 경고 표시.
        b.el.dataset.urgent = s.urgent ? '1' : '0';
      }
    }
  }

  // 매 프레임: 활성 화면이 손님 화면일 때만 점유 좌석 말풍선을 좌석 위에 배치한다.
  function tick(activeScreenId) {
    const show = activeScreenId === customerScreenId;
    for (const { el } of Object.values(bubbles)) el.hidden = true;
    if (!show) return;
    for (const s of bubblePresentations) {
      const b = bubbles[s.seatId];
      if (!s.occupied || ['empty', 'leaving', 'cleanup'].includes(s.phase)) continue;
      const points = s.memberSeatIds
        .map((seatId) => renderer.seatBubbleWorld[seatId])
        .filter(Boolean)
        .map((anchor) => renderer.projectToScreen(anchor));
      if (points.length === 0) continue;
      const p = points.reduce((sum, point) => ({
        x: sum.x + point.x,
        y: sum.y + point.y,
      }), { x: 0, y: 0 });
      p.x /= points.length;
      p.y /= points.length;
      b.el.style.left = `${p.x}px`;
      b.el.style.top = `${p.y}px`;
      b.el.hidden = false;
    }
  }

  return { apply, tick, getStates: () => states };
}
