import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_PHASE,
  MemoryStorageAdapter,
} from '../../src/campaign-runtime.js';
import {
  S0D3CampaignBridge,
  S0_D3_STORAGE_PREFIX,
  campaignPresentationPosition,
  createS0D3CampaignDefinition,
} from '../../src/scenario/s0-d3-campaign.js';

describe('S0~D3 campaign presentation bridge', () => {
  it('공개 campaign node chain만 소비한다', () => {
    const definition = createS0D3CampaignDefinition();
    expect(definition.ids).toEqual(['s0', 'd1', 'd2', 'd3', 'd4-preview']);
    expect(S0_D3_STORAGE_PREFIX).toBe('yaki-season.dev2-scenario.');
  });

  it('day-start 체크포인트를 영업 전 UI로 재개한다', async () => {
    const storage = new MemoryStorageAdapter();
    const first = new S0D3CampaignBridge({ storagePort: storage });
    expect((await first.loadOrStart()).resumed).toBe(false);
    first.finishPrologue();
    expect((await first.startDay()).ok).toBe(true);
    expect(first.getState().campaign.phase).toBe(CAMPAIGN_PHASE.BUSINESS);

    const reloaded = new S0D3CampaignBridge({ storagePort: storage });
    expect((await reloaded.loadOrStart()).resumed).toBe(true);
    expect(reloaded.getPosition()).toEqual({ kind: 'pre-open', dayId: 'D1' });
    expect(reloaded.getState().campaign.phase).toBe(CAMPAIGN_PHASE.PRE_OPEN);
  });

  it('정산 완료 뒤 다음 날짜를 저장하고 D3 뒤에는 UI를 종료한다', async () => {
    const storage = new MemoryStorageAdapter();
    const bridge = new S0D3CampaignBridge({ storagePort: storage });
    await bridge.loadOrStart();
    bridge.finishPrologue();

    for (const dayId of ['D1', 'D2', 'D3']) {
      await bridge.startDay();
      bridge.enterSettlement();
      const completed = await bridge.completeDay(dayId);
      expect(completed.ok).toBe(true);
    }

    expect(campaignPresentationPosition(bridge.getState())).toEqual({
      kind: 'epilogue',
      dayId: 'D3',
    });
    expect(bridge.getState().economy).toMatchObject({
      balance: 0,
      reputation: 0,
    });
  });

  it('정식 영업 결과가 제공되면 공개 aggregate에 그대로 위임한다', async () => {
    const bridge = new S0D3CampaignBridge({ storagePort: new MemoryStorageAdapter() });
    await bridge.loadOrStart();
    bridge.finishPrologue();
    await bridge.startDay();
    bridge.enterSettlement();
    await bridge.completeDay('D1', {
      completionId: 'developer-1:d1-result',
      reward: { balance: 300, reputation: 2, storyFlagIds: ['d1-cleared'] },
    });
    expect(bridge.getState()).toMatchObject({
      campaign: { nodeId: 'd2' },
      economy: { balance: 300, reputation: 2 },
      story: { flagIds: ['d1-cleared'] },
    });
  });
});
