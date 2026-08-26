export const DEFAULT_CLAIMED_GRILL_SLOTS = 2;

export const GRILL_SLOT_UPGRADE_BLOCK = Object.freeze({
  UNAVAILABLE: 'unavailable',
  UNLOCK: 'unlock',
  REPUTATION: 'reputation',
});

function normalizedTiers(config = {}) {
  return [...(config.tiers ?? [])]
    .filter((tier) => Number.isInteger(tier?.slots) && tier.slots > 0)
    .sort((left, right) => left.slots - right.slots);
}

// 명성만을 사용하는 기존 소비자용 계산이다. 캠페인 해금 조건은
// campaignGrillUpgradeState에서 별도로 적용한다.
export function grillSlotsForReputation(reputation, config = {}) {
  const rep = Number.isFinite(reputation) ? reputation : 0;
  const tiers = normalizedTiers(config);
  const max = Number.isInteger(config.maxSlots) ? config.maxSlots : 8;
  let slots = 0;
  for (const tier of tiers) {
    if (rep >= (tier.reputation ?? 0)) slots = Math.max(slots, tier.slots);
  }
  if (slots === 0) {
    slots = tiers.length
      ? Math.min(...tiers.map((tier) => tier.slots))
      : DEFAULT_CLAIMED_GRILL_SLOTS;
  }
  return Math.max(1, Math.min(slots, max));
}

export function grillUnlockState(claimedSlots, reputation, config = {}) {
  const available = grillSlotsForReputation(reputation, config);
  const claimed = claimedSlots ?? available;
  return { available, claimed, pending: available > claimed };
}

// 캠페인용 판정은 명성 외에도 날짜/콘텐츠 해금 ID를 함께 확인한다.
// 명성은 조건일 뿐 소비하지 않으며, available은 지금 수동 claim 가능한 칸 수다.
export function campaignGrillUpgradeState({
  claimedSlots = DEFAULT_CLAIMED_GRILL_SLOTS,
  reputation = 0,
  unlockIds = [],
} = {}, config = {}) {
  const claimed = Number.isInteger(claimedSlots)
    ? claimedSlots
    : DEFAULT_CLAIMED_GRILL_SLOTS;
  const rep = Number.isFinite(reputation) ? reputation : 0;
  const unlocked = new Set(Array.isArray(unlockIds) ? unlockIds : []);
  const tiers = normalizedTiers(config);
  const max = Number.isInteger(config.maxSlots) ? config.maxSlots : 8;

  let available = Math.min(claimed, max);
  for (const tier of tiers) {
    const hasUnlock = !tier.requiresUnlockId || unlocked.has(tier.requiresUnlockId);
    if (hasUnlock && rep >= (tier.reputation ?? 0)) {
      available = Math.max(available, Math.min(tier.slots, max));
    }
  }

  const target = tiers.find((tier) => tier.slots > claimed) ?? null;
  let blockedBy = null;
  if (!target) blockedBy = GRILL_SLOT_UPGRADE_BLOCK.UNAVAILABLE;
  else if (target.requiresUnlockId && !unlocked.has(target.requiresUnlockId)) {
    blockedBy = GRILL_SLOT_UPGRADE_BLOCK.UNLOCK;
  } else if (rep < (target.reputation ?? 0)) {
    blockedBy = GRILL_SLOT_UPGRADE_BLOCK.REPUTATION;
  }

  return {
    available,
    claimed,
    pending: available > claimed,
    targetSlots: target?.slots ?? null,
    requiredReputation: target?.reputation ?? null,
    requiredUnlockId: target?.requiresUnlockId ?? null,
    blockedBy,
  };
}
