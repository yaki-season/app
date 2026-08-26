// DAT-001 콘텐츠 교차 검증 규칙 (순수 JS, Ajv 불필요).
// 브라우저 런타임과 Node 테스트가 함께 쓴다. 스키마 검증(Ajv)은 validate.js가 별도로 한다.

// bundle: { processes, recipes, customers, days, upgrades, staff, scenarios } — 각각 레코드 배열
export function checkContentRules(bundle) {
  const errors = [];
  const hasCollection = (kind) => Object.prototype.hasOwnProperty.call(bundle, kind);
  const inRange = (value, range) => (
    Number.isInteger(value)
    && range
    && Number.isInteger(range.min)
    && Number.isInteger(range.max)
    && range.min <= value
    && value <= range.max
  );

  // 모든 컬렉션의 식별자 유일성 (DAT-001 §공통 2) + id 집합 수집
  const idSets = {};
  for (const [kind, records] of Object.entries(bundle)) {
    const ids = new Set();
    for (const r of records || []) {
      if (!r || typeof r.id !== 'string') {
        errors.push(`[${kind}] 식별자 없는 레코드`);
        continue;
      }
      if (ids.has(r.id)) errors.push(`[${kind}] 중복 식별자: ${r.id}`);
      ids.add(r.id);
    }
    idSets[kind] = ids;
  }

  const has = (kind, id) => (idSets[kind] ? idSets[kind].has(id) : false);

  // 참조 무결성 (DAT-001 §공통 4)
  for (const r of bundle.recipes || []) {
    if (r.processId && !has('processes', r.processId)) {
      errors.push(`[recipe:${r.id}] 미정의 공정 참조: ${r.processId}`);
    }
    if (r.category === 'skewer') {
      const policy = r.seasoningPolicy;
      const options = policy?.options || [];
      if (
        policy?.selectionStage !== 'assembly'
        || options.length !== 2
        || !options.includes('salt')
        || !options.includes('tare')
        || policy?.saltTransferMode !== 'direct'
        || policy?.inventoryPartition !== 'menu-and-seasoning'
        || policy?.tareApplication?.station !== 'assembly'
        || policy?.tareApplication?.afterAssemblyCompleted !== true
        || policy?.tareApplication?.brushPasses !== 1
        || policy?.tareApplication?.minimumCoverage !== 0.8
        || policy?.tareApplication?.torchEnabled !== false
      ) {
        errors.push(`[recipe:${r.id}] 조립 완료 뒤 소금은 바로 전달하고 타레는 조립대에서 1회 붓질한 뒤 메뉴·양념별 재고로 분리하며 토치를 사용하지 않아야 함`);
      }
    }
  }
  for (const d of bundle.days || []) {
    for (const t of d.customerPool || []) {
      if (!has('customers', t)) errors.push(`[day:${d.id}] 미정의 손님 유형 참조: ${t}`);
    }
    if (hasCollection('menus')) {
      for (const menuId of d.availableMenuIds || []) {
        if (!has('menus', menuId)) errors.push(`[day:${d.id}] 미정의 메뉴 참조: ${menuId}`);
      }
    }
  }
  for (const u of bundle.upgrades || []) {
    if (u.requiresUpgradeId && !has('upgrades', u.requiresUpgradeId)) {
      errors.push(`[upgrade:${u.id}] 미정의 선행 업그레이드 참조: ${u.requiresUpgradeId}`);
    }
  }
  // 시나리오 날짜 체인이 끊기지 않아야 한다 (DAT-001 §15)
  for (const s of bundle.scenarios || []) {
    if (s.prevDay != null && !has('scenarios', s.prevDay)) {
      errors.push(`[scenario:${s.id}] 끊긴 이전 날짜 참조: ${s.prevDay}`);
    }
    if (s.nextDay != null && !has('scenarios', s.nextDay)) {
      errors.push(`[scenario:${s.id}] 끊긴 다음 날짜 참조: ${s.nextDay}`);
    }
    if (s.prevDay != null) {
      const previous = (bundle.scenarios || []).find((candidate) => candidate.id === s.prevDay);
      if (previous && previous.nextDay !== s.id) {
        errors.push(`[scenario:${s.id}] 이전 날짜의 다음 참조가 맞지 않음: ${s.prevDay} -> ${previous.nextDay}`);
      }
    }
    if (s.nextDay != null) {
      const next = (bundle.scenarios || []).find((candidate) => candidate.id === s.nextDay);
      if (next && next.prevDay !== s.id) {
        errors.push(`[scenario:${s.id}] 다음 날짜의 이전 참조가 맞지 않음: ${s.nextDay} <- ${next.prevDay}`);
      }
    }
    if (s.dayDataId && hasCollection('days') && !has('days', s.dayDataId)) {
      errors.push(`[scenario:${s.id}] 미정의 영업일 참조: ${s.dayDataId}`);
    }
    if (s.kind === 'preview') {
      if (
        s.readOnly !== true
        || s.nextDay !== null
        || (s.gameplayCommandIds || []).length > 0
        || (s.economyCommandIds || []).length > 0
        || s.reward !== null
      ) {
        errors.push(`[scenario:${s.id}] preview는 읽기 전용이며 gameplay·경제 command·reward를 가질 수 없음`);
      }
    }
  }

  const earlyChain = ['s0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd5-complete'];
  if (earlyChain.every((id) => has('scenarios', id))) {
    earlyChain.forEach((id, index) => {
      const record = (bundle.scenarios || []).find((scenario) => scenario.id === id);
      const expectedPrev = earlyChain[index - 1] ?? null;
      const expectedNext = earlyChain[index + 1] ?? null;
      if (record.prevDay !== expectedPrev || record.nextDay !== expectedNext) {
        errors.push(`[scenario:${id}] 초기 캠페인 chain 위반`);
      }
    });
  }

  if (hasCollection('campaignCharacters')) {
    const fixedIds = (bundle.campaignCharacters || [])
      .filter((character) => character.fixed)
      .map((character) => character.id)
      .sort();
    const expected = ['CHAR-AKI', 'CHAR-TSUKIOKA'];
    if (fixedIds.length !== expected.length || fixedIds.some((id, index) => id !== expected[index])) {
      errors.push('[campaignCharacters] S0~D4 고정 인물은 CHAR-AKI·CHAR-TSUKIOKA만 허용됨');
    }
    for (const character of bundle.campaignCharacters || []) {
      if (
        character.customerTypeId != null
        && hasCollection('customers')
        && !has('customers', character.customerTypeId)
      ) {
        errors.push(`[campaignCharacter:${character.id}] 미정의 손님 유형 참조: ${character.customerTypeId}`);
      }
    }
  }

  if (hasCollection('menus') && hasCollection('scenarios')) {
    for (const menu of bundle.menus || []) {
      if (!has('scenarios', menu.introducedOn)) {
        errors.push(`[menu:${menu.id}] 미정의 도입 날짜 참조: ${menu.introducedOn}`);
      }
    }
  }

  if (hasCollection('orders')) {
    const orderById = new Map((bundle.orders || []).map((order) => [order.id, order]));
    for (const order of bundle.orders || []) {
      const day = (bundle.days || []).find((candidate) => candidate.id === order.dayId);
      if (!day) {
        errors.push(`[order:${order.id}] 미정의 영업일 참조: ${order.dayId}`);
        continue;
      }
      if (!day.segments?.some((segment) => segment.id === order.arrivalSegmentId)) {
        errors.push(`[order:${order.id}] 미정의 시간대 참조: ${order.arrivalSegmentId}`);
      }
      if (order.source?.kind === 'fixed-character' && !has('campaignCharacters', order.source.characterId)) {
        errors.push(`[order:${order.id}] 미정의 고정 인물 참조: ${order.source.characterId}`);
      }
      if (order.source?.kind === 'extra-type' && !has('customers', order.source.customerTypeId)) {
        errors.push(`[order:${order.id}] 미정의 엑스트라 유형 참조: ${order.source.customerTypeId}`);
      }
      for (const item of order.items || []) {
        const menu = (bundle.menus || []).find((candidate) => candidate.id === item.menuId);
        if (!menu) {
          errors.push(`[order:${order.id}] 미정의 메뉴 참조: ${item.menuId}`);
          continue;
        }
        if (!day.availableMenuIds?.includes(item.menuId)) {
          errors.push(`[order:${order.id}] ${order.dayId}에 비활성 메뉴 사용: ${item.menuId}`);
        }
        if (!menu.seasoningOptions?.includes(item.seasoning)) {
          errors.push(`[order:${order.id}] 메뉴가 지원하지 않는 seasoning: ${item.menuId}/${item.seasoning}`);
        }
        if (item.seasoning === 'tare' && ['d1', 'd2'].includes(order.dayId)) {
          errors.push(`[order:${order.id}] tare 주문은 d3 이전에 사용할 수 없음`);
        }
      }
      for (const requiredId of order.requiresOrderCompletionIds || []) {
        const required = orderById.get(requiredId);
        if (!required) errors.push(`[order:${order.id}] 미정의 선행 주문 참조: ${requiredId}`);
        else if (required.dayId !== order.dayId) {
          errors.push(`[order:${order.id}] 다른 날짜 선행 주문 참조: ${requiredId}`);
        }
      }
    }
  }

  for (const day of bundle.days || []) {
    if (
      day.arrivalPolicy?.maxAllSeatsEmptyWaitSec !== 13
      || day.arrivalPolicy?.autoCloseAfterFinalCustomer !== true
    ) {
      errors.push(`[day:${day.id}] 모든 영업일은 빈 가게 13초 이내 입장·마지막 손님 자동 마감 정책이 필요함`);
    }
    for (const [field, range] of Object.entries(day.totals || {})) {
      if (range.min > range.max) {
        errors.push(`[day:${day.id}] totals.${field} 최소값이 최대값보다 큼`);
      }
    }
    const segments = day.segments || [];
    if (segments.length > 0) {
      if (segments[0].startMinute !== day.businessWindow?.startMinute) {
        errors.push(`[day:${day.id}] 첫 시간대가 영업 시작 시각과 맞지 않음`);
      }
      if (segments.at(-1).endMinute !== day.businessWindow?.endMinute) {
        errors.push(`[day:${day.id}] 마지막 시간대가 영업 종료 시각과 맞지 않음`);
      }
      segments.forEach((segment, index) => {
        if (segment.startMinute >= segment.endMinute) {
          errors.push(`[day:${day.id}] 시간대 범위 역전: ${segment.id}`);
        }
        if (index > 0 && segments[index - 1].endMinute !== segment.startMinute) {
          errors.push(`[day:${day.id}] 시간대 chain 단절: ${segments[index - 1].id} -> ${segment.id}`);
        }
        for (const [field, range] of Object.entries({
          customerCount: segment.customerCount,
          orderCount: segment.orderCount,
          itemCount: segment.itemCount,
        })) {
          if (range?.min > range?.max) {
            errors.push(`[day:${day.id}] ${segment.id}.${field} 최소값이 최대값보다 큼`);
          }
        }
        if (segment.maxActiveOrders > day.maxActiveOrders) {
          errors.push(`[day:${day.id}] ${segment.id} 활성 주문 상한이 날짜 상한을 초과함`);
        }
        if (segment.maxRiskProcesses > day.maxRiskProcesses) {
          errors.push(`[day:${day.id}] ${segment.id} 위험 공정 상한이 날짜 상한을 초과함`);
        }
      });
    }

    if (hasCollection('orders')) {
      const planned = (bundle.orders || []).filter((order) => order.dayId === day.id);
      const plannedIds = planned.map((order) => order.id);
      for (const orderId of day.plannedOrderIds || []) {
        if (!plannedIds.includes(orderId)) errors.push(`[day:${day.id}] 미정의 계획 주문 참조: ${orderId}`);
      }
      for (const order of planned) {
        if (!day.plannedOrderIds?.includes(order.id)) {
          errors.push(`[day:${day.id}] 계획 목록에 없는 주문: ${order.id}`);
        }
      }

      const totals = {
        customers: planned.reduce((sum, order) => sum + order.customerCount, 0),
        orders: planned.length,
        items: planned.reduce(
          (sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + item.quantity, 0),
          0,
        ),
      };
      for (const [field, value] of Object.entries(totals)) {
        if (!inRange(value, day.totals?.[field])) {
          errors.push(`[day:${day.id}] 계획 ${field} 합계가 날짜 범위를 벗어남: ${value}`);
        }
      }
      if (day.customerCount !== totals.customers) {
        errors.push(`[day:${day.id}] legacy customerCount와 계획 손님 합계 불일치`);
      }

      for (const segment of segments) {
        const segmentOrders = planned.filter((order) => order.arrivalSegmentId === segment.id);
        const segmentTotals = {
          customerCount: segmentOrders.reduce((sum, order) => sum + order.customerCount, 0),
          orderCount: segmentOrders.length,
          itemCount: segmentOrders.reduce(
            (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
            0,
          ),
        };
        for (const [field, value] of Object.entries(segmentTotals)) {
          if (!inRange(value, segment[field])) {
            errors.push(`[day:${day.id}] ${segment.id}.${field} 계획 합계 범위 위반: ${value}`);
          }
        }
      }
    }
  }

  const d1First = (bundle.orders || []).find((order) => order.id === 'D1-ORDER-001');
  if (d1First) {
    const beer = d1First.items?.[0];
    const negima = d1First.items?.[1];
    if (
      d1First.source?.characterId !== 'CHAR-TSUKIOKA'
      || d1First.runtimeCustomerId !== 'REGULAR_TSUKIOKA'
      || beer?.menuId !== 'beer'
      || beer.quantity !== 1
      || negima?.menuId !== 'negima'
      || negima.quantity !== 2
    ) {
      errors.push('[order:D1-ORDER-001] 츠키오카 고정 주문은 생맥주 1잔→네기마 2개여야 함');
    }
  }

  const d2 = (bundle.days || []).find((day) => day.id === 'd2');
  if (d2 && (
    d2.tutorialPolicy?.guidanceLevel !== 'reduced'
    || d2.tutorialPolicy?.helpCanBeReenabled !== true
  )) {
    errors.push('[day:d2] 도움 감소와 도움말 다시 켜기 계약 위반');
  }
  const d3 = (bundle.days || []).find((day) => day.id === 'd3');
  if (d3 && (
    d3.newActionId !== 'd3-assembly-tare-brush'
    || d3.tutorialPolicy?.failurePolicy !== 'safe-first-use'
  )) {
    errors.push('[day:d3] 조립대 타레 신규 행동의 안전 안내 계약 위반');
  }

  const requiredAssemblyTareCommands = ['select-assembly-seasoning', 'brush-assembly-tare'];
  const obsoleteTareCommands = new Set([
    'apply-tare',
    'finish-tare',
    'select-grill-seasoning',
    'brush-grill-tare',
  ]);
  for (const scenarioId of ['d3', 'd4', 'd5']) {
    const scenario = (bundle.scenarios || []).find((candidate) => candidate.id === scenarioId);
    if (!scenario) continue;
    const commandIds = scenario.gameplayCommandIds || [];
    if (
      requiredAssemblyTareCommands.some((commandId) => !commandIds.includes(commandId))
      || commandIds.some((commandId) => commandId.includes('torch') || obsoleteTareCommands.has(commandId))
    ) {
      errors.push(`[scenario:${scenarioId}] 타레는 조립대에서 양념 선택·1회 붓질 후 재고로 보내며 그릴 도포·토치·구형 마감을 사용할 수 없음`);
    }
  }

  // 익힘 구간 순서 (DAT-001 §공통 6: 최소는 최대보다 클 수 없다)
  for (const p of bundle.processes || []) {
    const t = p.faceThresholdsSec;
    if (t && !(t.under <= t.perfect && t.perfect <= t.over && t.over <= t.burnt)) {
      errors.push(`[process:${p.id}] 익힘 구간 순서 위반: under≤perfect≤over≤burnt 이어야 함`);
    }
  }

  // 상태 값 (DAT-001 §공통 8)
  for (const [kind, records] of Object.entries(bundle)) {
    for (const r of records || []) {
      if (r && r.status !== 'candidate' && r.status !== 'approved') {
        errors.push(`[${kind}:${r.id}] 잘못된 상태: ${r.status} (candidate|approved)`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// approved이고 활성인 레코드만 게임 기본값으로 로드한다 (DAT-001 §공통 8).
// candidate는 도구에서만 시험하고 게임에 로드하지 않는다.
export function approvedOnly(records) {
  return (records || []).filter((r) => r.status === 'approved' && r.active);
}
