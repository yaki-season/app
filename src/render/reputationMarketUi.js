// GPL-009: 실제 연결된 그릴 상품만 표시한다. 설치는 캠페인의 원자적 저장을 거친다.
export function renderReputationMarket({ content, actions, config, error, bridge, dayId, onStart, onRetry, isBusinessRunning = () => false }) {
  let busy = false;
  const make = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  function paint(feedback = '') {
    const state = bridge.getState();
    const claimed = state.progression.claimedGrillSlots;
    const reputation = state.economy.reputation;
    const running = isBusinessRunning();
    const upgrade = config ? bridge.getGrillSlotUpgradeState(config) : null;
    const market = make('section', 'reputation-market');
    market.dataset.testid = 'reputation-market';
    const header = make('header', 'market-header');
    header.append(make('p', 'day-prep-kicker', '골목 장비 마켓'), make('h2', '', '소문이 쌓이면, 불 앞의 자리가 넓어집니다.'),
      make('p', '', '해금해도 명성은 줄어들지 않습니다. 필요한 만큼만 확장하고 오늘의 영업을 준비하세요.'));
    const stats = make('p', 'market-stats', `명성 ${reputation} · 설치된 그릴 ${claimed}칸`);
    stats.dataset.testid = 'market-stats'; header.append(stats); market.append(header);
    const cards = make('div', 'market-grid');
    for (const tier of config?.tiers?.filter(t => t.slots > 2) ?? []) {
      const owned = claimed >= tier.slots;
      const next = upgrade.targetSlots === tier.slots;
      const ready = !running && !owned && next && upgrade.pending;
      const card = make('article', 'market-card');
      card.dataset.testid = `market-item-${tier.slots}`;
      card.dataset.state = owned ? 'installed' : ready ? 'available' : 'locked';
      const grate = make('div', 'market-grate'); grate.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < tier.slots; i++) grate.append(make('i', ''));
      card.append(grate, make('h3', '', `${tier.slots}칸 · ${tier.name}`), make('p', '', tier.description));
      const condition = owned ? '설치 완료' : running ? '영업을 마친 뒤 설치할 수 있습니다' : !next ? `앞 단계 설치 · 명성 ${tier.reputation} 필요`
        : ready ? '설치 가능 · 명성 차감 없음' : `명성 ${tier.reputation} 필요 · ${Math.max(0, tier.reputation - reputation)} 더 모으기`;
      card.append(make('p', 'market-condition', condition));
      const claim = make('button', 'market-claim', owned ? '설치됨' : `${tier.slots}칸 해금`);
      claim.dataset.testid = `market-claim-${tier.slots}`; claim.disabled = !ready || busy;
      claim.addEventListener('click', async () => {
        if (busy) return;
        if (isBusinessRunning()) { paint('진행 중인 영업에서는 설비를 바꾸지 않습니다.'); return; }
        busy = true; lock();
        let message;
        try {
          const result = await bridge.claimGrillSlots(config, tier.slots);
          message = !result.ok ? `저장하지 못했습니다. 확장은 적용되지 않았습니다. ${result.error?.message ?? ''}`
            : result.applied ? `${tier.slots}칸을 설치했습니다. 명성은 ${reputation} 그대로입니다.` : '해금 조건을 다시 확인해 주세요.';
        } catch { message = '저장하지 못했습니다. 다시 시도해 주세요.'; }
        finally { busy = false; }
        paint(message);
        (content.querySelector('.market-claim:not(:disabled)') ?? actions.querySelector('button'))?.focus();
      });
      card.append(claim); cards.append(card);
    }
    market.append(cards);
    const status = make('p', 'market-status', feedback || (running
      ? '진행 중인 영업이 있습니다. 같은 설비와 주문으로 재개합니다.'
      : error
      ? '상품 정보를 불러오지 못했습니다. 다시 불러오거나 현재 칸으로 영업할 수 있습니다.'
      : '설치는 다음 영업부터 유지됩니다. 영업 도중에는 그릴을 바꾸지 않습니다.'));
    status.setAttribute('role', 'status'); status.dataset.testid = 'market-status'; market.append(status);
    content.replaceChildren(market);
    const start = make('button', 'primary', `${claimed}칸으로 ${dayId} 영업 ${running ? '재개' : '시작'}`);
    start.dataset.testid = 'market-start-business'; start.disabled = busy;
    start.addEventListener('click', async () => {
      if (busy) return;
      busy = true; lock();
      try {
        const result = await onStart();
        if (!result?.ok) { busy = false; paint(`영업 시작을 저장하지 못했습니다. ${result?.error?.message ?? ''}`); }
      } catch { busy = false; paint('영업 시작을 저장하지 못했습니다. 다시 시도해 주세요.'); }
    });
    actions.replaceChildren(start);
    if (error) {
      const retry = make('button', '', '상품 다시 불러오기');
      retry.addEventListener('click', async () => { if (!busy) { busy = true; lock(); await onRetry(); } });
      actions.append(retry);
    }
  }
  function lock() {
    for (const scope of [content, actions]) for (const button of scope.querySelectorAll('button')) button.disabled = true;
  }
  paint();
}
