import {
  beginBusinessDay,
  claimCampaignGrillSlots,
  completeBusinessDay,
  completePrologue,
  createCampaignState,
  enterSettlement,
  getCampaignGrillSlotUpgradeState,
} from '../../domain/campaign/campaign.js';
import { CHECKPOINT_TYPE } from '../persistence/saveEnvelope.js';
import { canonicalStringify } from '../../core/canonicalJson.js';

export class CampaignRuntime {
  constructor({ definition, saveRepository, state = null }) {
    if (!definition) throw new TypeError('campaign definition이 필요합니다.');
    if (!saveRepository) throw new TypeError('saveRepository가 필요합니다.');
    this.definition = definition;
    this.saveRepository = saveRepository;
    this.state = state;
    this.lastError = null;
    this.loadedCheckpoint = null;
  }

  startNewCampaign(options) {
    this.loadedCheckpoint = null;
    this.state = createCampaignState({ definition: this.definition, ...options });
    this.lastError = null;
    return { ok: true, value: this.getState() };
  }

  async loadCampaign() {
    this.loadedCheckpoint = null;
    const loaded = await this.saveRepository.loadActive();
    if (!loaded.ok) {
      this.lastError = loaded.error;
      return loaded;
    }
    this.state = loaded.value.envelope.payload;
    this.loadedCheckpoint = structuredClone(loaded.value);
    this.lastError = null;
    return { ok: true, value: this.getState(), save: loaded.value };
  }

  getState() {
    return this.state === null ? null : structuredClone(this.state);
  }

  getStatus() {
    return {
      ready: this.state !== null && this.lastError === null,
      error: this.lastError,
      recovery: this.lastError?.uiState ?? null,
    };
  }

  ensureState() {
    if (this.state === null) throw new TypeError('캠페인을 먼저 생성하거나 불러와야 합니다.');
  }

  readOnlyPreviewError(command) {
    if (this.state?.campaign?.phase !== 'preview') return null;
    return {
      ok: false,
      error: {
        code: 'CAMPAIGN_PREVIEW_READ_ONLY',
        message: `미리보기에서는 ${command} 명령을 실행할 수 없습니다.`,
        recoverable: true,
      },
    };
  }

  finishPrologue() {
    this.ensureState();
    this.state = completePrologue(this.state, this.definition);
    return { ok: true, value: this.getState() };
  }

  async startDay() {
    this.ensureState();
    if (this.preOpenWritePending) return { ok: false, error: { message: '진행을 저장하는 중입니다.' } };
    const readOnly = this.readOnlyPreviewError('begin-day');
    if (readOnly) return readOnly;
    // 같은 검증된 day-start를 불러온 직후에는 저장을 회전시키지 않는다.
    // 새 캠페인·다음 날·마켓 변경 상태는 이 비교를 통과하지 못해 정상 저장한다.
    const loaded = this.loadedCheckpoint;
    this.loadedCheckpoint = null;
    if (loaded?.envelope.checkpointType === CHECKPOINT_TYPE.DAY_START
      && canonicalStringify(loaded.envelope.payload) === canonicalStringify(this.state)) {
      this.state = beginBusinessDay(this.state);
      this.lastError = null;
      return { ok: true, value: this.getState(), save: loaded };
    }
    // 저장이 성공하기 전에는 business 상태로 전환하지 않는다.
    this.preOpenWritePending = true;
    let saved;
    try { saved = await this.saveRepository.saveCheckpoint({
      checkpointType: CHECKPOINT_TYPE.DAY_START,
      state: this.state,
      completedDayId: this.state.campaign.completedDayIds.at(-1) ?? null,
    }); } finally { this.preOpenWritePending = false; }
    if (!saved.ok) {
      this.lastError = saved.error;
      return saved;
    }
    this.state = beginBusinessDay(this.state);
    this.lastError = null;
    return { ok: true, value: this.getState(), save: saved.value };
  }

  getGrillSlotUpgradeState(config = {}) {
    this.ensureState();
    return getCampaignGrillSlotUpgradeState(this.state, config);
  }

  async claimGrillSlots(config = {}, targetSlots = null) {
    this.ensureState();
    if (this.preOpenWritePending) return { ok: false, error: { message: '진행을 저장하는 중입니다.' } };
    const readOnly = this.readOnlyPreviewError('claim-grill-slots');
    if (readOnly) return readOnly;
    const candidate = claimCampaignGrillSlots(this.state, config, targetSlots);
    if (!candidate.applied) {
      return {
        ok: true,
        applied: false,
        reason: candidate.reason,
        upgrade: candidate.upgrade,
        value: this.getState(),
      };
    }

    // claim 후보를 먼저 저장하고, 성공한 경우에만 메모리 상태를 교체한다.
    this.preOpenWritePending = true;
    let saved;
    try { saved = await this.saveRepository.saveCheckpoint({
      checkpointType: CHECKPOINT_TYPE.DAY_START,
      state: candidate.state,
      completedDayId: candidate.state.campaign.completedDayIds.at(-1) ?? null,
    }); } finally { this.preOpenWritePending = false; }
    if (!saved.ok) {
      this.lastError = saved.error;
      return saved;
    }
    this.state = candidate.state;
    this.lastError = null;
    return {
      ok: true,
      applied: true,
      reason: null,
      upgrade: candidate.upgrade,
      value: this.getState(),
      save: saved.value,
    };
  }

  closeDayForSettlement() {
    this.ensureState();
    const readOnly = this.readOnlyPreviewError('enter-settlement');
    if (readOnly) return readOnly;
    this.state = enterSettlement(this.state);
    return { ok: true, value: this.getState() };
  }

  async completeDay({ dayId, completionId, reward, summary = null }) {
    this.ensureState();
    const readOnly = this.readOnlyPreviewError('complete-day');
    if (readOnly) return readOnly;
    const candidate = completeBusinessDay(this.state, this.definition, {
      dayId,
      completionId,
      reward,
      summary,
    });
    if (!candidate.applied) {
      return {
        ok: true,
        value: this.getState(),
        settlement: candidate.settlement,
        duplicate: true,
      };
    }

    // 보상·날짜 전이는 day-complete가 검증 완료된 뒤에만 메모리 상태에도 반영한다.
    const saved = await this.saveRepository.saveCheckpoint({
      checkpointType: CHECKPOINT_TYPE.DAY_COMPLETE,
      state: candidate.state,
      completedDayId: dayId,
    });
    if (!saved.ok) {
      this.lastError = saved.error;
      return saved;
    }
    this.state = candidate.state;
    this.lastError = null;
    return {
      ok: true,
      value: this.getState(),
      settlement: candidate.settlement,
      duplicate: false,
      save: saved.value,
    };
  }
}
