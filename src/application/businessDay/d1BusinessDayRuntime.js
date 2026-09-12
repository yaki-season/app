import { CAMPAIGN_PHASE } from '../../domain/campaign/campaign.js';
import { buildGuestMemoryFlags, normalizeGuestStoryProgress } from '../../domain/businessDay/guestMemory.js';
import {
  D1_DAY_PHASE,
  advanceD1BusinessDay,
  buildBusinessDayCampaignReward,
  createD1BusinessDayState,
  dispatchD1Command,
  markD1BusinessDayComplete,
  validateD1BusinessDayState,
} from '../../domain/businessDay/d1BusinessDay.js';

export class D1BusinessDayRuntime {
  constructor({ definition, campaignRuntime, state = null }) {
    if (!definition) throw new TypeError('D1 영업일 definition이 필요합니다.');
    if (!campaignRuntime) throw new TypeError('campaignRuntime이 필요합니다.');
    this.definition = definition;
    this.campaignRuntime = campaignRuntime;
    this.state = state;
    this.lastError = null;
    this.finalResult = null;
  }

  getState() {
    return this.state === null ? null : structuredClone(this.state);
  }

  getStatus() {
    return {
      ready: this.state !== null && this.lastError === null,
      error: this.lastError,
      canFinalize: this.state?.phase === D1_DAY_PHASE.SETTLEMENT
        && this.state?.settlement.ready === true,
    };
  }

  async start({ runId, seed } = {}) {
    const campaign = this.campaignRuntime.getState();
    if (!campaign) throw new TypeError('캠페인을 먼저 생성하거나 불러와야 합니다.');
    if (
      campaign.campaign.nodeId !== this.definition.id
      || campaign.campaign.phase !== CAMPAIGN_PHASE.PRE_OPEN
    ) {
      throw new TypeError('D1 영업 전 캠페인 상태에서만 D1 영업을 시작할 수 있습니다.');
    }
    const checkpoint = await this.campaignRuntime.startDay();
    if (!checkpoint.ok) {
      this.lastError = checkpoint.error;
      return checkpoint;
    }
    this.state = createD1BusinessDayState({
      definition: this.definition,
      runId: runId ?? `${campaign.meta.campaignId}:${this.definition.id}`,
      seed: seed ?? campaign.meta.seed,
    });
    this.lastError = null;
    return { ok: true, value: this.getState(), checkpoint: checkpoint.save };
  }

  validateSnapshot(snapshot, runId = this.state?.runId) {
    // 영업 시작 체크포인트와 같은 회차만 재개한다. 오래된 완료 snapshot은 보상을 재실행하지 않는다.
    if (!snapshot || snapshot.runId !== runId
      || snapshot.dayId !== this.definition.id || snapshot.phase === D1_DAY_PHASE.COMPLETE) {
      return { ok: false, reason: 'snapshot-session-mismatch' };
    }
    let validation;
    try {
      validation = validateD1BusinessDayState(snapshot, this.definition);
      if (!snapshot.clock || !Number.isFinite(snapshot.clock.elapsedMs)
        || snapshot.clock.elapsedMs < 0 || !Array.isArray(snapshot.waves)
        || snapshot.waves.length !== this.definition.waves.length
        || snapshot.waves.some((wave, i) => wave.id !== this.definition.waves[i].id)
        || !snapshot.customers || !snapshot.orders || !snapshot.metrics || !snapshot.settlement
        || !Array.isArray(snapshot.ledger) || !Array.isArray(snapshot.handledEventIds)
        || snapshot.seats.some((seat, i) => seat.id !== this.definition.seatIds[i]
          || (seat.customerId && !snapshot.customers[seat.customerId]))) {
        return { ok: false, reason: 'invalid-snapshot' };
      }
    } catch {
      return { ok: false, reason: 'invalid-snapshot' };
    }
    if (!validation.valid) return { ok: false, reason: 'invalid-snapshot', errors: validation.errors };
    return { ok: true };
  }

  restore(snapshot) {
    const validation = this.validateSnapshot(snapshot);
    if (!validation.ok) return validation;
    this.state = structuredClone(snapshot);
    this.state.guestStory = normalizeGuestStoryProgress(this.state.guestStory, this.definition.id);
    if (!Array.isArray(this.state.guestServings)) this.state.guestServings = [];
    this.state.clock.paused = false;
    return { ok: true, value: this.getState() };
  }

  advance(deltaMs) {
    if (!this.state) throw new TypeError('D1 영업을 먼저 시작해야 합니다.');
    this.state = advanceD1BusinessDay(this.state, this.definition, deltaMs);
    return { ok: true, value: this.getState() };
  }

  setGuestStoryProgress(progress) {
    if (!this.state) return;
    this.state.guestStory = normalizeGuestStoryProgress(progress, this.definition.id);
  }

  dispatch(command) {
    if (!this.state) throw new TypeError('D1 영업을 먼저 시작해야 합니다.');
    const result = dispatchD1Command(this.state, this.definition, command);
    this.state = result.state;
    return { ...result, state: this.getState() };
  }

  async finalize() {
    if (!this.state) throw new TypeError('D1 영업을 먼저 시작해야 합니다.');
    if (this.finalResult) return { ...this.finalResult, duplicate: true };
    if (this.state.phase !== D1_DAY_PHASE.SETTLEMENT || !this.state.settlement.ready) {
      return { ok: false, reason: 'settlement-not-ready' };
    }
    const validation = validateD1BusinessDayState(this.state, this.definition);
    if (!validation.valid) {
      return { ok: false, reason: 'invalid-d1-state', errors: validation.errors };
    }

    const campaignState = this.campaignRuntime.getState();
    if (campaignState.campaign.phase === CAMPAIGN_PHASE.BUSINESS) {
      this.campaignRuntime.closeDayForSettlement();
    }
    const summary = this.state.settlement.summary;
    const reward = buildBusinessDayCampaignReward(summary, this.definition);
    reward.storyFlagIds = [...new Set([...reward.storyFlagIds, ...buildGuestMemoryFlags(this.state)])];
    const result = await this.campaignRuntime.completeDay({
      dayId: this.definition.id,
      completionId: this.state.settlement.completionId,
      reward,
      summary,
    });
    if (!result.ok) {
      this.lastError = result.error;
      return result;
    }
    this.state = markD1BusinessDayComplete(this.state);
    this.lastError = null;
    this.finalResult = {
      ok: true,
      value: this.getState(),
      campaign: result.value,
      settlement: summary,
      save: result.save,
      duplicate: result.duplicate,
    };
    return this.finalResult;
  }
}
