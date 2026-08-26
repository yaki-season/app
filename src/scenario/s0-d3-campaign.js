import {
  CAMPAIGN_PHASE,
  CampaignRuntime,
  CampaignSaveRepository,
  LocalStorageAdapter,
  PERSISTENCE_ERROR_CODE,
  assertD4CampaignDefinition,
  createCampaignDefinition,
  validateCampaignState,
} from '../campaign-runtime.js';

export const S0_D3_CONTENT_VERSION = 'content-s0-d3-r1';
export const S0_D3_STORAGE_PREFIX = 'yaki-season.dev2-scenario.';

class PrefixedStoragePort {
  constructor(storage, prefix) {
    this.storage = storage;
    this.prefix = prefix;
  }

  get(key) {
    return this.storage.get(`${this.prefix}${key}`);
  }

  set(key, value) {
    return this.storage.set(`${this.prefix}${key}`, value);
  }

  remove(key) {
    return this.storage.remove(`${this.prefix}${key}`);
  }
}

export function createS0D3StoragePort(browserStorage) {
  return new PrefixedStoragePort(
    new LocalStorageAdapter(browserStorage),
    S0_D3_STORAGE_PREFIX,
  );
}

// 공개·개발 진입점이 함께 사용하는 단일 캠페인 체인이다.
export const S0_D4_CAMPAIGN_RECORDS = Object.freeze([
  Object.freeze({ id: 's0', kind: 'prologue', nextId: 'd1', contentId: 'scenario.s0' }),
  Object.freeze({ id: 'd1', kind: 'day', nextId: 'd2', contentId: 'campaign.day.d1' }),
  Object.freeze({ id: 'd2', kind: 'day', nextId: 'd3', contentId: 'campaign.day.d2' }),
  Object.freeze({ id: 'd3', kind: 'day', nextId: 'd4', contentId: 'campaign.day.d3' }),
  Object.freeze({ id: 'd4', kind: 'day', nextId: 'd5-preview', contentId: 'campaign.day.d4' }),
  Object.freeze({ id: 'd5-preview', kind: 'preview', nextId: null, contentId: 'campaign.preview.d5' }),
]);

// 공개 API 이름은 기존 소비자 호환을 위해 유지하되, 정의의 기준은 S0~D4다.
export const S0_D3_CAMPAIGN_RECORDS = S0_D4_CAMPAIGN_RECORDS;

export function createS0D3CampaignDefinition() {
  return createS0D4CampaignDefinition();
}

export function createS0D4CampaignDefinition() {
  return assertD4CampaignDefinition(createCampaignDefinition(S0_D4_CAMPAIGN_RECORDS));
}

export function campaignPresentationPosition(state) {
  if (state?.campaign?.nodeId === 's0') return Object.freeze({ kind: 'prologue', dayId: 'S0' });
  if (state?.campaign?.nodeId === 'd5-preview') return Object.freeze({ kind: 'epilogue', dayId: 'D4' });
  if (['d1', 'd2', 'd3', 'd4'].includes(state?.campaign?.nodeId)) {
    return Object.freeze({
      kind: state.campaign.phase === CAMPAIGN_PHASE.PRE_OPEN ? 'pre-open' : state.campaign.phase,
      dayId: state.campaign.nodeId.toUpperCase(),
    });
  }
  throw new TypeError(`지원하지 않는 campaign presentation 상태입니다: ${state?.campaign?.nodeId}`);
}

// 구 버전에서 D3 완료를 종착점으로 저장한 상태는 D4 영업 전으로 자연스럽게 이어 준다.
export function normalizeLegacyCampaignState(state) {
  if (state?.campaign?.nodeId !== ['d4', 'preview'].join('-')) return state;
  return {
    ...state,
    campaign: {
      ...state.campaign,
      nodeId: 'd4',
      nodeKind: 'day',
      dayId: 'd4',
      phase: CAMPAIGN_PHASE.PRE_OPEN,
      unlockedNodeIds: [...new Set([
        ...(state.campaign.unlockedNodeIds ?? []).filter((id) => id !== ['d4', 'preview'].join('-')),
        'd4',
      ])],
    },
    progression: {
      ...state.progression,
      unlockIds: [...new Set([
        ...(state.progression?.unlockIds ?? []).filter((id) => id !== ['d4', 'preview'].join('-')),
        'day-d4',
      ])],
    },
  };
}

export class S0D3CampaignBridge {
  constructor({
    storagePort,
    browserStorage,
    clock,
    campaignId = 'scenario-s0-d3',
    seed = 0,
  } = {}) {
    this.definition = createS0D4CampaignDefinition();
    this.campaignId = campaignId;
    this.seed = seed;
    const presentationStorage = storagePort ?? createS0D3StoragePort(browserStorage);
    this.repository = new CampaignSaveRepository({
      storage: presentationStorage,
      clock,
      normalizePayload: normalizeLegacyCampaignState,
      validatePayload: (payload) => validateCampaignState(payload, this.definition),
      acceptsContentVersion: (version) => version === S0_D3_CONTENT_VERSION,
    });
    this.runtime = new CampaignRuntime({
      definition: this.definition,
      saveRepository: this.repository,
    });
  }

  newCampaign() {
    return this.runtime.startNewCampaign({
      campaignId: this.campaignId,
      contentVersion: S0_D3_CONTENT_VERSION,
      seed: this.seed,
    });
  }

  async loadOrStart({ forceNew = false } = {}) {
    if (forceNew) {
      const started = this.newCampaign();
      return { ...started, resumed: false, pendingFirstCheckpoint: true };
    }
    const loaded = await this.runtime.loadCampaign();
    if (loaded.ok) return { ...loaded, resumed: true };
    if (loaded.error.code !== PERSISTENCE_ERROR_CODE.SAVE_MISSING) return loaded;
    const started = this.newCampaign();
    return { ...started, resumed: false };
  }

  getState() {
    return this.runtime.getState();
  }

  getPosition() {
    return campaignPresentationPosition(this.getState());
  }

  finishPrologue() {
    return this.runtime.finishPrologue();
  }

  startDay() {
    return this.runtime.startDay();
  }

  enterSettlement() {
    return this.runtime.closeDayForSettlement();
  }

  completeDay(dayId, {
    completionId,
    reward = {},
  } = {}) {
    const normalizedDayId = dayId.toLowerCase();
    return this.runtime.completeDay({
      dayId: normalizedDayId,
      completionId: completionId
        ?? `${this.getState().meta.campaignId}:${normalizedDayId}`,
      // 정식 보상은 Developer 1 영업 결과가 전달한다. 독립 UI 검증의 기본값은 무보상이다.
      reward,
    });
  }

  async restartDevelopmentCampaign() {
    const reset = await this.repository.resetDevelopmentSaves({
      releasePhase: 'pre-public-development',
    });
    if (!reset.ok) return reset;
    return this.newCampaign();
  }
}
