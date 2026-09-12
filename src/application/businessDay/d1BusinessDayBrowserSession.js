import { CAMPAIGN_PHASE } from '../../domain/campaign/campaign.js';
import { D1BusinessDayRuntime } from './d1BusinessDayRuntime.js';
import { D1BusinessDayUiPort } from './d1BusinessDayUiPort.js';
import { S0D3CampaignBridge } from '../../scenario/s0-d3-campaign.js';

// 캠페인 day-start 체크포인트와 영업 UI를 연결한다. 같은 회차의 검증된 businessSnapshot이
// 있으면 손님·주문·좌석·시계를 재개하고, 없으면 해당 날짜를 시작한다. 완료 보상은 campaign 저장이 소유한다.
export async function createD1BusinessDayBrowserSession({
  definition,
  storagePort,
  browserStorage,
  clock,
  campaignId = 'scenario-s0-d3',
  seed = 0,
  resetDevelopment = false,
  developmentStartDay = null,
  businessSnapshot = null,
} = {}) {
  if (!definition) throw new TypeError('D1 영업일 definition이 필요합니다.');
  const bridge = new S0D3CampaignBridge({
    storagePort,
    browserStorage,
    clock,
    campaignId,
    seed,
  });
  const loaded = developmentStartDay
    ? await bridge.restartDevelopmentCampaign()
    : resetDevelopment
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
    if (!['d2', 'd3', 'd4', 'd5', 'd6'].includes(developmentStartDay)) {
      throw new TypeError(`지원하지 않는 개발 시작 날짜입니다: ${developmentStartDay}`);
    }
    if (campaign.campaign.nodeId === 's0') bridge.finishPrologue();
    const precedingDays = developmentStartDay === 'd6'
      ? ['d1', 'd2', 'd3', 'd4', 'd5']
      : developmentStartDay === 'd5'
      ? ['d1', 'd2', 'd3', 'd4']
      : developmentStartDay === 'd4' ? ['d1', 'd2', 'd3']
      : developmentStartDay === 'd3' ? ['d1', 'd2'] : ['d1'];
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
  const nextDayId = definition.nextNodeId ?? (dayId === 'd1' ? 'd2' : dayId === 'd2' ? 'd3' : null);
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
  const runId = `${campaign.meta.campaignId}:${dayId}`;
  // 손상된 영업 저장을 발견했을 때에는 시작 체크포인트도 쓰지 않는다.
  if (businessSnapshot && !runtime.validateSnapshot(businessSnapshot, runId).ok) {
    return { ok: false, error: { code: 'BUSINESS_SNAPSHOT_INVALID', message: '영업 중 저장을 복구하지 못했습니다. 원본 저장은 유지됩니다.' }, bridge, port: null };
  }
  const started = await port.start({
    runId,
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
  if (businessSnapshot) {
    const restored = runtime.restore(businessSnapshot);
    if (!restored.ok) {
      return { ok: false, error: { code: 'BUSINESS_SNAPSHOT_INVALID', message: '영업 중 저장을 복구하지 못했습니다. 원본 저장은 유지됩니다.' }, bridge, port: null };
    }
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
