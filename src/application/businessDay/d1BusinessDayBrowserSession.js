import { CAMPAIGN_PHASE } from '../../domain/campaign/campaign.js';
import { D1BusinessDayRuntime } from './d1BusinessDayRuntime.js';
import { D1BusinessDayUiPort } from './d1BusinessDayUiPort.js';
import { S0D3CampaignBridge } from '../../scenario/s0-d3-campaign.js';

const DEVELOPMENT_PRECEDING_DAYS = Object.freeze({
  d2: Object.freeze(['d1']),
  d3: Object.freeze(['d1', 'd2']),
});

const DEFAULT_NEXT_DAY_BY_ID = Object.freeze({
  d1: 'd2',
  d2: 'd3',
});

// S0/D1 campaign 저장과 D1 영업 UI port를 브라우저 화면에 조립하는 얇은 adapter다.
// 영업 중 상태는 별도 저장하지 않는다. 새로고침 시 campaign day-start 체크포인트(D1 pre-open)를
// 다시 불러와 같은 D1을 안전하게 재시작하며, 완료 뒤에는 저장된 D2 pre-open을 그대로 노출한다.
export async function createD1BusinessDayBrowserSession({
  definition,
  storagePort,
  browserStorage,
  clock,
  campaignId = 'scenario-s0-d3',
  seed = 0,
  resetDevelopment = false,
  developmentStartDay = null,
} = {}) {
  if (!definition) throw new TypeError('D1 영업일 definition이 필요합니다.');
  const bridge = new S0D3CampaignBridge({
    storagePort,
    browserStorage,
    clock,
    campaignId,
    seed,
  });
  const loaded = developmentStartDay || resetDevelopment
    ? await bridge.restartDevelopmentCampaign()
    : await bridge.loadOrStart();
  if (!loaded.ok) {
    return {
      ok: false,
      error: loaded.error,
      bridge,
      port: null,
      position: null,
    };
  }

  let campaign = bridge.getState();
  if (developmentStartDay) {
    const precedingDays = DEVELOPMENT_PRECEDING_DAYS[developmentStartDay];
    if (!precedingDays) {
      throw new TypeError(`지원하지 않는 개발 시작 날짜입니다: ${developmentStartDay}`);
    }
    if (campaign.campaign.nodeId === 's0') bridge.finishPrologue();
    for (const precedingDayId of precedingDays) {
      const startedDay = await bridge.startDay();
      if (!startedDay.ok) return { ...startedDay, bridge, port: null, position: bridge.getPosition() };
      const enteredSettlement = bridge.enterSettlement();
      if (!enteredSettlement.ok) {
        return { ...enteredSettlement, bridge, port: null, position: bridge.getPosition() };
      }
      const completedDay = await bridge.completeDay(precedingDayId, {
        completionId: `development-unlock:${precedingDayId}`,
      });
      if (!completedDay.ok) return { ...completedDay, bridge, port: null, position: bridge.getPosition() };
    }
    campaign = bridge.getState();
  }
  const startedFromS0 = campaign.campaign.nodeId === 's0';
  if (startedFromS0) {
    bridge.finishPrologue();
    campaign = bridge.getState();
  }

  const dayId = definition.id;
  const nextDayId = definition.nextNodeId ?? DEFAULT_NEXT_DAY_BY_ID[dayId] ?? null;
  if (
    campaign.campaign.nodeId === nextDayId
    && [CAMPAIGN_PHASE.PRE_OPEN, CAMPAIGN_PHASE.PREVIEW].includes(campaign.campaign.phase)
  ) {
    return {
      ok: true,
      completed: true,
      resumed: loaded.resumed ?? false,
      startedFromS0,
      bridge,
      port: null,
      campaign,
    };
  }
  if (campaign.campaign.nodeId !== dayId || campaign.campaign.phase !== CAMPAIGN_PHASE.PRE_OPEN) {
    return {
      ok: false,
      error: {
        code: 'D1_BROWSER_CAMPAIGN_STATE',
        message: `${dayId.toUpperCase()} 영업 전 또는 완료된 다음 캠페인 상태가 아닙니다.`,
        campaign: campaign.campaign,
      },
      bridge,
      port: null,
      position: bridge.getPosition(),
    };
  }

  const runtime = new D1BusinessDayRuntime({
    definition,
    campaignRuntime: bridge.runtime,
  });
  const port = new D1BusinessDayUiPort({ runtime, definition });
  const started = await port.start({
    runId: `${campaign.meta.campaignId}:${dayId}`,
    seed: campaign.meta.seed,
  });
  if (!started.ok) {
    return {
      ok: false,
      error: started.error,
      bridge,
      port,
      position: bridge.getPosition(),
    };
  }
  return {
    ok: true,
    completed: false,
    resumed: loaded.resumed ?? false,
    startedFromS0,
    bridge,
    port,
    campaign: bridge.getState(),
    checkpoint: started.checkpoint,
  };
}
