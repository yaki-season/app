import { CAMPAIGN_PHASE } from '../../domain/campaign/campaign.js';
import {
  D1_DAY_PHASE,
  advanceD1BusinessDay,
  buildD1CampaignReward,
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
      campaign.campaign.nodeId !== 'd1'
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
      runId: runId ?? `${campaign.meta.campaignId}:d1`,
      seed: seed ?? campaign.meta.seed,
    });
    this.lastError = null;
    return { ok: true, value: this.getState(), checkpoint: checkpoint.save };
  }

  advance(deltaMs) {
    if (!this.state) throw new TypeError('D1 영업을 먼저 시작해야 합니다.');
    this.state = advanceD1BusinessDay(this.state, this.definition, deltaMs);
    return { ok: true, value: this.getState() };
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
    const result = await this.campaignRuntime.completeDay({
      dayId: 'd1',
      completionId: this.state.settlement.completionId,
      reward: buildD1CampaignReward(summary),
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
