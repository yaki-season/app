// 공용 준비 목록 (svc.preparedDock, UI-003 §332).
//
// 완성품을 담는 공유 선반. 조리(단일 job)와 서빙(선반→좌석)을 분리한다 — 여러 개를 미리 구워 쌓아뒀다
// 낼 수 있다. 특정 주문 ID를 표시하지 않고 메뉴·품질별 일반 카드로 보여준다(§332).
// 실제 주문↔완성품 자동 연결은 006/GPL-004의 몫이며, 이 모듈은 목록·선택·소비의 렌더 인터페이스다.

// 조리 결과 → 품질. gameState.clickOrderMat과 같은 규칙(GPL-001 §13): 한 면이라도 과다면 low.
export function qualityFromCook(frontResult, backResult) {
  return frontResult === 'over' || backResult === 'over' ? 'low' : 'good';
}

const LEGACY_MENU_ID = Object.freeze({
  '생맥주': 'beer',
  '네기마': 'negima',
  '모모': 'momo',
  '타레 모모': 'momo',
  '양배추 사라다': 'cabbage-salad',
  '사라다': 'cabbage-salad',
  '하이볼': 'highball',
});

function normalizePreparedItem(item) {
  const menuId = item?.menuId ?? LEGACY_MENU_ID[item?.menu] ?? null;
  const quality = item?.quality ?? item?.label ?? null;
  const qualityMode = item?.qualityMode ?? (quality == null ? 'none' : 'graded');
  return {
    ...item,
    menuId,
    menu: item?.menu ?? menuId ?? '준비 메뉴',
    quality,
    label: item?.label ?? quality ?? '',
    qualityMode,
    good: qualityMode === 'none' ? null : Boolean(item?.good),
    zone: preparedItemZone({ ...item, menuId }),
  };
}

export function preparedItemZone(item) {
  if (item?.zone === 'drink' || item?.zone === 'food') return item.zone;
  if (['beer', 'highball'].includes(item?.menuId)) return 'drink';
  return /맥주|술|사케|하이볼/.test(item?.menu ?? '') ? 'drink' : 'food';
}

export function createPreparedDock({ container }) {
  let items = [];
  let selectedId = null;
  let seq = 0;

  function render() {
    if (!container) return;
    container.innerHTML = '';

    const zones = Object.fromEntries([
      ['food', '요리 서빙대'],
      ['drink', '음료 픽업대'],
    ].map(([zoneId, label]) => {
      const zone = document.createElement('section');
      zone.className = `dock-zone dock-zone--${zoneId}`;
      zone.dataset.preparedZone = zoneId;
      zone.dataset.testid = `dock-zone-${zoneId}`;
      zone.setAttribute('aria-label', label);
      zone.innerHTML = `<strong class="dock-zone-label">${label}</strong><div class="dock-zone-items"></div><span class="dock-zone-empty">비어 있음</span>`;
      container.appendChild(zone);
      return [zoneId, zone];
    }));

    for (const it of items) {
      const zoneId = preparedItemZone(it);
      const zone = zones[zoneId];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `dock-card${it.id === selectedId ? ' selected' : ''}`;
      card.dataset.testid = `dock-item-${it.id}`;
      card.dataset.good = it.good == null ? '' : it.good ? '1' : '0';
      card.dataset.preparedZone = zoneId;
      card.dataset.menuId = it.menuId ?? '';
      const quality = it.qualityMode === 'none'
        ? ''
        : `<span class="dock-quality ${it.good ? 'q-good' : 'q-low'}">${it.label}</span>`;
      card.innerHTML = `<span class="dock-item-art dock-item-art--${zoneId}" aria-hidden="true"></span><span class="dock-menu">${it.menu}</span>${quality}`;
      card.addEventListener('click', () => select(it.id));
      zone.querySelector('.dock-zone-items').appendChild(card);
    }
    for (const zone of Object.values(zones)) {
      zone.classList.toggle('is-empty', !zone.querySelector('.dock-card'));
    }
    container.hidden = items.length === 0;
  }

  // item: { menuId, menu, quality, qualityMode, good, zone }.
  // menu/label만 가진 v1 호출과 저장 데이터도 normalizePreparedItem에서 이행한다.
  function add(item) {
    const it = normalizePreparedItem({ id: `p${++seq}`, ...item });
    items.push(it);
    if (!selectedId) selectedId = it.id;
    render();
    return it.id;
  }
  function select(id) {
    if (!items.some((i) => i.id === id)) return;
    selectedId = id;
    render();
  }
  function selected() {
    return items.find((i) => i.id === selectedId) || null;
  }
  function consumeSelected() {
    const it = selected();
    if (!it) return null;
    items = items.filter((i) => i.id !== it.id);
    selectedId = items.length ? items[0].id : null;
    render();
    return it;
  }
  function consumeMenu(menu, count = 1) {
    const removed = [];
    for (const item of [...items]) {
      if (removed.length >= count || item.menu !== menu) continue;
      removed.push(item);
      items = items.filter((candidate) => candidate.id !== item.id);
    }
    selectedId = items.some((item) => item.id === selectedId)
      ? selectedId
      : items[0]?.id ?? null;
    render();
    return removed;
  }
  function consumeMenuId(menuId, count = 1, seasoning = undefined) {
    const removed = [];
    for (const item of [...items]) {
      if (
        removed.length >= count
        || item.menuId !== menuId
        || (seasoning !== undefined && item.seasoning !== seasoning)
      ) continue;
      removed.push(item);
      items = items.filter((candidate) => candidate.id !== item.id);
    }
    selectedId = items.some((item) => item.id === selectedId)
      ? selectedId
      : items[0]?.id ?? null;
    render();
    return removed;
  }
  function clear() {
    items = [];
    selectedId = null;
    render();
  }
  function restore(saved) {
    if (saved?.stateVersion !== 1 || !Array.isArray(saved.items)) return { ok: false, reason: 'invalid-snapshot' };
    items = saved.items.map((item) => normalizePreparedItem(item));
    seq = Number.isInteger(saved.seq) ? saved.seq : items.length;
    selectedId = items.some((item) => item.id === saved.selectedId)
      ? saved.selectedId
      : items[0]?.id ?? null;
    render();
    return { ok: true };
  }

  return {
    add,
    select,
    selected,
    consumeSelected,
    consumeMenu,
    consumeMenuId,
    clear,
    snapshot: () => ({ stateVersion: 1, items: items.map((item) => ({ ...item })), selectedId, seq }),
    restore,
    items: () => items.map((i) => ({ ...i })),
    selectedId: () => selectedId,
    count: () => items.length,
    hasGood: () => items.some((i) => i.good),
  };
}
