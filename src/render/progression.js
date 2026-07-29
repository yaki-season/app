// 성장·구매 (순수 로직, GPL-005 경제·성장).
//
// 골드=매출+팁, 명성=좋음 서빙 +3·화난 이탈 -1(조건 게이트, 소비하지 않음, §2-2). 업그레이드는
// 골드 비용 + 명성 조건 + 선행 업그레이드 조합으로 구매하며(§12,114), 소유 효과를 경제에 집계한다.

// 명성 변화 (§2-2): 좋음 서빙 +3, 낮음 서빙 0(만족 40<80), 화난 이탈 -1.
export function reputationDelta(records) {
  let delta = 0;
  for (const r of records) {
    if (r.served) { if (r.good) delta += 3; }
    else delta -= 1;
  }
  return delta;
}

// 아이템 구매 상태.
export function itemState(item, wallet) {
  const owned = wallet.owned || new Set();
  if (owned.has(item.id)) return 'owned';
  if (item.requiresUpgradeId && !owned.has(item.requiresUpgradeId)) return 'locked-prereq';
  if ((wallet.reputation ?? 0) < (item.reputationReq ?? 0)) return 'locked-rep';
  if ((wallet.gold ?? 0) < item.costGold) return 'unaffordable';
  return 'buyable';
}

export function catalog(items, wallet) {
  return items.filter((it) => it.active !== false).map((it) => ({ ...it, state: itemState(it, wallet) }));
}

// 구매 판정: 가능하면 차감 결과를 반환한다. (지갑을 직접 바꾸지 않는 순수 함수)
export function buy(item, wallet) {
  const st = itemState(item, wallet);
  if (st !== 'buyable') return { ok: false, reason: st };
  return { ok: true, gold: (wallet.gold ?? 0) - item.costGold, ownedAdd: item.id };
}

// 소유 업그레이드 효과를 경제에 집계한다. 현재는 basePriceMult(판매가 배수)만 경제에 반영.
// grillSlots·seatCap 등은 소유로 기록되며 해당 게임플레이 배선은 후속 증분이 사용한다.
export function effectiveEconomy(baseEconomy, ownedItems) {
  let mult = 1;
  for (const it of ownedItems) {
    if (it.effect && it.effect.kind === 'basePriceMult') mult *= it.effect.value;
  }
  return { ...baseEconomy, basePrice: Math.round(baseEconomy.basePrice * mult) };
}

// 소유 효과 요약(다른 시스템이 참조): { basePriceMult, grillSlots, seatCap }.
export function ownedEffects(ownedItems) {
  const summary = { basePriceMult: 1, grillSlots: 1, seatCap: 6 };
  for (const it of ownedItems) {
    const e = it.effect;
    if (!e) continue;
    if (e.kind === 'basePriceMult') summary.basePriceMult *= e.value;
    else if (e.kind === 'grillSlots') summary.grillSlots = Math.max(summary.grillSlots, e.value);
    else if (e.kind === 'seatCap') summary.seatCap = Math.max(summary.seatCap, e.value);
  }
  return summary;
}
