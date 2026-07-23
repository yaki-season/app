// DAT-001 콘텐츠 교차 검증 규칙 (순수 JS, Ajv 불필요).
// 브라우저 런타임과 Node 테스트가 함께 쓴다. 스키마 검증(Ajv)은 validate.js가 별도로 한다.

// bundle: { processes, recipes, customers, days, upgrades, staff, scenarios } — 각각 레코드 배열
export function checkContentRules(bundle) {
  const errors = [];

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
  }
  for (const d of bundle.days || []) {
    for (const t of d.customerPool || []) {
      if (!has('customers', t)) errors.push(`[day:${d.id}] 미정의 손님 유형 참조: ${t}`);
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
