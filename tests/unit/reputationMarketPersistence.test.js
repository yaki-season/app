import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CampaignRuntime } from '../../src/application/campaign/campaignRuntime.js';
import { createS0D3CampaignDefinition, S0_D3_CONTENT_VERSION } from '../../src/scenario/s0-d3-campaign.js';
const config = JSON.parse(readFileSync(new URL('../../content/progression/grill-slots.json', import.meta.url), 'utf8'));

function harness() {
  const writes = [];
  let release;
  const repository = { saveCheckpoint: request => {
    writes.push(request);
    return new Promise(resolve => { release = resolve; });
  } };
  const runtime = new CampaignRuntime({ definition: createS0D3CampaignDefinition(), saveRepository: repository });
  runtime.startNewCampaign({ campaignId: 'market-concurrency', contentVersion: S0_D3_CONTENT_VERSION, seed: 42 });
  runtime.finishPrologue();
  runtime.state.economy.reputation = 90;
  return { runtime, writes, release: value => release(value) };
}
describe('마켓과 영업 시작의 단일 저장 경계', () => {
  it.each(['claim', 'start'])('%s 저장 중 중복 설치와 영업 시작을 모두 차단한다', operation => {
    return (async () => {
      const h = harness();
      const pending = operation === 'claim' ? h.runtime.claimGrillSlots(config, 3) : h.runtime.startDay();
      expect(h.runtime.getState().progression.claimedGrillSlots).toBe(2);
      expect((await h.runtime.claimGrillSlots(config, 3)).ok).toBe(false);
      expect((await h.runtime.startDay()).ok).toBe(false);
      expect(h.writes).toHaveLength(1);
      h.release({ ok: true, value: {} });
      expect((await pending).ok).toBe(true);
      expect(h.runtime.getState().progression.claimedGrillSlots).toBe(operation === 'claim' ? 3 : 2);
      expect(h.runtime.getState().campaign.phase).toBe(operation === 'claim' ? 'pre-open' : 'business');
    })();
  });
  it('실패 뒤 잠금이 해제되며 설치할 상품은 다음 한 단계 그대로이다', async () => {
    const h = harness();
    const pending = h.runtime.claimGrillSlots(config, 3);
    h.release({ ok: false, error: { message: 'quota' } });
    expect((await pending).ok).toBe(false);
    expect(h.runtime.getState().progression.claimedGrillSlots).toBe(2);
    const retry = h.runtime.claimGrillSlots(config, 3);
    expect(h.writes).toHaveLength(2);
    h.release({ ok: true, value: {} });
    expect((await retry).applied).toBe(true);
    expect(h.runtime.getState().economy.reputation).toBe(90);
  });
});
