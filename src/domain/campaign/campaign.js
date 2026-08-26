import {
  DEFAULT_CLAIMED_GRILL_SLOTS,
  GRILL_SLOT_UPGRADE_BLOCK,
  campaignGrillUpgradeState,
} from '../progression/grillSlots.js';

export const CAMPAIGN_PHASE = Object.freeze({
  PROLOGUE: 'prologue',
  PRE_OPEN: 'pre-open',
  BUSINESS: 'business',
  SETTLEMENT: 'settlement',
  PREVIEW: 'preview',
});

export const CAMPAIGN_NODE_KIND = Object.freeze({
  PROLOGUE: 'prologue',
  DAY: 'day',
  PREVIEW: 'preview',
});

export const EARLY_CAMPAIGN_NODE_IDS = Object.freeze([
  's0',
  'd1',
  'd2',
  'd3',
  'd4',
  'd5',
  'd5-complete',
]);

export const D4_CAMPAIGN_NODE_IDS = EARLY_CAMPAIGN_NODE_IDS;

export const GRILL_SLOT_CLAIM_REASON = Object.freeze({
  ALREADY_CLAIMED: 'already-claimed',
  PHASE_REQUIRED: 'pre-open-required',
  REPUTATION_REQUIRED: 'reputation-required',
  UNLOCK_REQUIRED: 'unlock-required',
  UNAVAILABLE: 'unavailable',
});

function inferKind(id) {
  if (id === 's0') return CAMPAIGN_NODE_KIND.PROLOGUE;
  if (id.endsWith('-preview')) return CAMPAIGN_NODE_KIND.PREVIEW;
  return CAMPAIGN_NODE_KIND.DAY;
}

function phaseForKind(kind) {
  if (kind === CAMPAIGN_NODE_KIND.PROLOGUE) return CAMPAIGN_PHASE.PROLOGUE;
  if (kind === CAMPAIGN_NODE_KIND.PREVIEW) return CAMPAIGN_PHASE.PREVIEW;
  return CAMPAIGN_PHASE.PRE_OPEN;
}

function uniqueStrings(values, field) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw new TypeError(`${field}는 문자열 배열이어야 합니다.`);
  }
  if (new Set(values).size !== values.length) throw new TypeError(`${field}에 중복 값이 있습니다.`);
  return [...values];
}

export function createCampaignDefinition(records, { initialNodeId = 's0' } = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new TypeError('캠페인 콘텐츠 레코드가 필요합니다.');
  }

  const nodes = new Map();
  for (const record of records) {
    const id = record?.id;
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('캠페인 node id가 필요합니다.');
    if (nodes.has(id)) throw new TypeError(`중복 캠페인 node id입니다: ${id}`);
    const kind = record.kind ?? inferKind(id);
    if (!Object.values(CAMPAIGN_NODE_KIND).includes(kind)) {
      throw new TypeError(`지원하지 않는 캠페인 node 종류입니다: ${kind}`);
    }
    const nextId = record.nextId ?? record.nextDay ?? null;
    if (nextId !== null && typeof nextId !== 'string') {
      throw new TypeError(`nextId는 문자열 또는 null이어야 합니다: ${id}`);
    }
    nodes.set(id, Object.freeze({ id, kind, nextId, contentId: record.contentId ?? id }));
  }

  if (!nodes.has(initialNodeId)) throw new TypeError(`초기 캠페인 node가 없습니다: ${initialNodeId}`);
  for (const node of nodes.values()) {
    if (node.nextId !== null && !nodes.has(node.nextId)) {
      throw new TypeError(`캠페인 다음 node 참조가 없습니다: ${node.id} -> ${node.nextId}`);
    }
    if (node.kind === CAMPAIGN_NODE_KIND.PREVIEW && node.nextId !== null) {
      throw new TypeError(`읽기 전용 preview는 다음 gameplay node를 가질 수 없습니다: ${node.id}`);
    }
  }

  return Object.freeze({
    initialNodeId,
    get(id) {
      return nodes.get(id) ?? null;
    },
    has(id) {
      return nodes.has(id);
    },
    ids: Object.freeze([...nodes.keys()]),
  });
}

export function assertEarlyCampaignDefinition(definition) {
  for (let index = 0; index < EARLY_CAMPAIGN_NODE_IDS.length; index += 1) {
    const id = EARLY_CAMPAIGN_NODE_IDS[index];
    const node = definition.get(id);
    if (!node) throw new TypeError(`초기 캠페인 필수 node가 없습니다: ${id}`);
    const expectedNext = EARLY_CAMPAIGN_NODE_IDS[index + 1] ?? null;
    if (node.nextId !== expectedNext) {
      throw new TypeError(`초기 캠페인 연결이 올바르지 않습니다: ${id} -> ${node.nextId}`);
    }
  }
  if (definition.get('s0').kind !== CAMPAIGN_NODE_KIND.PROLOGUE) {
    throw new TypeError('s0는 prologue여야 합니다.');
  }
  for (const id of ['d1', 'd2', 'd3', 'd4', 'd5']) {
    if (definition.get(id).kind !== CAMPAIGN_NODE_KIND.DAY) {
      throw new TypeError(`${id}는 영업일이어야 합니다.`);
    }
  }
  if (definition.get('d5-complete').kind !== CAMPAIGN_NODE_KIND.PREVIEW) {
    throw new TypeError('d5-complete는 읽기 전용 완료 상태여야 합니다.');
  }
  return definition;
}

export function assertD4CampaignDefinition(definition) {
  return assertEarlyCampaignDefinition(definition);
}

export function createCampaignState({
  definition,
  campaignId,
  contentVersion,
  seed,
}) {
  if (typeof campaignId !== 'string' || campaignId.length === 0) {
    throw new TypeError('campaignId가 필요합니다.');
  }
  if (typeof contentVersion !== 'string' || contentVersion.length === 0) {
    throw new TypeError('contentVersion이 필요합니다.');
  }
  if (!Number.isInteger(seed) || seed < 0) throw new TypeError('seed는 0 이상의 정수여야 합니다.');

  const initial = definition.get(definition.initialNodeId);
  return {
    stateVersion: 1,
    meta: { campaignId, contentVersion, seed },
    campaign: {
      nodeId: initial.id,
      nodeKind: initial.kind,
      dayId: initial.kind === CAMPAIGN_NODE_KIND.DAY ? initial.id : null,
      phase: phaseForKind(initial.kind),
      completedDayIds: [],
      unlockedNodeIds: [initial.id],
    },
    economy: {
      balance: 0,
      reputation: 0,
      settlements: [],
    },
    progression: {
      unlockIds: [],
      staffIds: [],
      claimedGrillSlots: DEFAULT_CLAIMED_GRILL_SLOTS,
    },
    story: {
      flagIds: [],
      tutorialFlagIds: [],
    },
  };
}

function transitionToNode(state, definition, nextId) {
  const next = definition.get(nextId);
  if (!next) throw new TypeError(`정의되지 않은 다음 캠페인 node입니다: ${nextId}`);
  return {
    ...state,
    campaign: {
      ...state.campaign,
      nodeId: next.id,
      nodeKind: next.kind,
      dayId: next.kind === CAMPAIGN_NODE_KIND.DAY ? next.id : null,
      phase: phaseForKind(next.kind),
      unlockedNodeIds: state.campaign.unlockedNodeIds.includes(next.id)
        ? state.campaign.unlockedNodeIds
        : [...state.campaign.unlockedNodeIds, next.id],
    },
  };
}

export function completePrologue(state, definition) {
  if (state.campaign.phase !== CAMPAIGN_PHASE.PROLOGUE) {
    throw new TypeError('프롤로그 상태에서만 S0를 완료할 수 있습니다.');
  }
  const node = definition.get(state.campaign.nodeId);
  if (!node?.nextId) throw new TypeError('프롤로그의 다음 날짜가 없습니다.');
  return transitionToNode(state, definition, node.nextId);
}

export function beginBusinessDay(state) {
  if (state.campaign.nodeKind !== CAMPAIGN_NODE_KIND.DAY) {
    throw new TypeError('영업일 node에서만 영업을 시작할 수 있습니다.');
  }
  if (state.campaign.phase !== CAMPAIGN_PHASE.PRE_OPEN) {
    throw new TypeError('영업 전 상태에서만 영업을 시작할 수 있습니다.');
  }
  return {
    ...state,
    campaign: { ...state.campaign, phase: CAMPAIGN_PHASE.BUSINESS },
  };
}

export function getCampaignGrillSlotUpgradeState(state, config = {}) {
  return campaignGrillUpgradeState({
    claimedSlots: state?.progression?.claimedGrillSlots,
    reputation: state?.economy?.reputation,
    unlockIds: state?.progression?.unlockIds,
  }, config);
}

// 해금 조건을 만족해도 플레이어가 직접 선택해야만 반영한다.
// 명성과 골드는 판정에만 사용하고 state.economy는 변경하지 않는다.
export function claimCampaignGrillSlots(state, config = {}) {
  const upgrade = getCampaignGrillSlotUpgradeState(state, config);
  if (state?.campaign?.phase !== CAMPAIGN_PHASE.PRE_OPEN) {
    return {
      state,
      applied: false,
      reason: GRILL_SLOT_CLAIM_REASON.PHASE_REQUIRED,
      upgrade,
    };
  }
  if (!upgrade.pending) {
    const reason = upgrade.blockedBy === GRILL_SLOT_UPGRADE_BLOCK.UNLOCK
      ? GRILL_SLOT_CLAIM_REASON.UNLOCK_REQUIRED
      : upgrade.blockedBy === GRILL_SLOT_UPGRADE_BLOCK.REPUTATION
        ? GRILL_SLOT_CLAIM_REASON.REPUTATION_REQUIRED
        : upgrade.targetSlots === null
          ? GRILL_SLOT_CLAIM_REASON.ALREADY_CLAIMED
          : GRILL_SLOT_CLAIM_REASON.UNAVAILABLE;
    return { state, applied: false, reason, upgrade };
  }

  const candidate = {
    ...state,
    progression: {
      ...state.progression,
      claimedGrillSlots: upgrade.available,
    },
  };
  return {
    state: candidate,
    applied: true,
    reason: null,
    upgrade: getCampaignGrillSlotUpgradeState(candidate, config),
  };
}

export function enterSettlement(state) {
  if (state.campaign.phase !== CAMPAIGN_PHASE.BUSINESS) {
    throw new TypeError('영업 중 상태에서만 정산에 진입할 수 있습니다.');
  }
  return {
    ...state,
    campaign: { ...state.campaign, phase: CAMPAIGN_PHASE.SETTLEMENT },
  };
}

function normalizeReward(reward = {}) {
  const balance = reward.balance ?? 0;
  const reputation = reward.reputation ?? 0;
  if (!Number.isFinite(balance) || !Number.isFinite(reputation)) {
    throw new TypeError('정산 보상은 유한한 숫자여야 합니다.');
  }
  return {
    balance,
    reputation,
    unlockIds: uniqueStrings(reward.unlockIds ?? [], 'reward.unlockIds'),
    storyFlagIds: uniqueStrings(reward.storyFlagIds ?? [], 'reward.storyFlagIds'),
  };
}

export function completeBusinessDay(state, definition, {
  dayId,
  completionId,
  reward,
  summary = null,
}) {
  if (typeof completionId !== 'string' || completionId.length === 0) {
    throw new TypeError('중복 정산 방지 completionId가 필요합니다.');
  }

  const existing = state.economy.settlements.find((item) => item.completionId === completionId);
  if (existing) return { state, applied: false, settlement: existing };

  if (state.campaign.phase !== CAMPAIGN_PHASE.SETTLEMENT) {
    throw new TypeError('정산 상태에서만 영업일을 완료할 수 있습니다.');
  }
  if (dayId !== state.campaign.dayId) {
    throw new TypeError(`현재 영업일과 정산 영업일이 다릅니다: ${state.campaign.dayId} / ${dayId}`);
  }

  const node = definition.get(dayId);
  if (!node?.nextId) throw new TypeError(`다음 캠페인 node가 없습니다: ${dayId}`);
  const normalizedReward = normalizeReward(reward);
  const settlement = {
    completionId,
    dayId,
    reward: normalizedReward,
    summary: summary === null ? null : structuredClone(summary),
  };
  const next = transitionToNode({
    ...state,
    campaign: {
      ...state.campaign,
      completedDayIds: state.campaign.completedDayIds.includes(dayId)
        ? state.campaign.completedDayIds
        : [...state.campaign.completedDayIds, dayId],
    },
    economy: {
      ...state.economy,
      balance: state.economy.balance + normalizedReward.balance,
      reputation: state.economy.reputation + normalizedReward.reputation,
      settlements: [...state.economy.settlements, settlement],
    },
    progression: {
      ...state.progression,
      unlockIds: [...new Set([...state.progression.unlockIds, ...normalizedReward.unlockIds])],
    },
    story: {
      ...state.story,
      flagIds: [...new Set([...state.story.flagIds, ...normalizedReward.storyFlagIds])],
    },
  }, definition, node.nextId);

  return { state: next, applied: true, settlement };
}

export function validateCampaignState(state, definition) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { valid: false, errors: ['payload가 객체가 아닙니다.'] };
  }
  if (state.stateVersion !== 1) errors.push('지원하지 않는 campaign stateVersion입니다.');
  if (typeof state.meta?.campaignId !== 'string' || state.meta.campaignId.length === 0) {
    errors.push('meta.campaignId가 올바르지 않습니다.');
  }
  if (typeof state.meta?.contentVersion !== 'string' || state.meta.contentVersion.length === 0) {
    errors.push('meta.contentVersion이 올바르지 않습니다.');
  }
  if (!Number.isInteger(state.meta?.seed) || state.meta.seed < 0) {
    errors.push('meta.seed가 올바르지 않습니다.');
  }

  const node = definition.get(state.campaign?.nodeId);
  if (!node) errors.push(`정의되지 않은 campaign.nodeId입니다: ${state.campaign?.nodeId}`);
  if (node && state.campaign?.nodeKind !== node.kind) errors.push('campaign.nodeKind가 콘텐츠와 다릅니다.');
  if (!Object.values(CAMPAIGN_PHASE).includes(state.campaign?.phase)) {
    errors.push('campaign.phase가 올바르지 않습니다.');
  }
  if (node?.kind === CAMPAIGN_NODE_KIND.PREVIEW && state.campaign?.phase !== CAMPAIGN_PHASE.PREVIEW) {
    errors.push('preview node는 preview phase여야 합니다.');
  }
  for (const field of ['completedDayIds', 'unlockedNodeIds']) {
    try {
      uniqueStrings(state.campaign?.[field], `campaign.${field}`);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (!Array.isArray(state.economy?.settlements)) errors.push('economy.settlements가 배열이 아닙니다.');
  if (!Number.isFinite(state.economy?.balance)) errors.push('economy.balance가 올바르지 않습니다.');
  if (!Number.isFinite(state.economy?.reputation)) errors.push('economy.reputation이 올바르지 않습니다.');
  const ids = state.economy?.settlements?.map((item) => item?.completionId) ?? [];
  if (ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    errors.push('정산 completionId가 없거나 중복됐습니다.');
  }
  for (const field of ['unlockIds', 'staffIds']) {
    try {
      uniqueStrings(state.progression?.[field], `progression.${field}`);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (!Number.isInteger(state.progression?.claimedGrillSlots)
    || state.progression.claimedGrillSlots < DEFAULT_CLAIMED_GRILL_SLOTS) {
    errors.push('progression.claimedGrillSlots가 올바르지 않습니다.');
  }
  return { valid: errors.length === 0, errors };
}
