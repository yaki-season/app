import { describe, it, expect } from 'vitest';
import { stageResult } from '../../src/render/stageResult.js';

describe('stage reward display compatibility', () => {
  it('uses this day’s saved reward when an old save has no detailed summary', () => {
    expect(stageResult(null, { reward: { balance: 41, reputation: 12 } })).toEqual({
      earnings: 41, reputation: 12, signedReputation: '+12', cleared: false,
    });
  });

  it('retains zero and negative changes instead of replacing them with other totals', () => {
    expect(stageResult({ economy: { total: 0, reputation: -3 }, orders: { completed: 0 } },
      { reward: { balance: 200, reputation: 20 } })).toEqual({
      earnings: 0, reputation: -3, signedReputation: '-3', cleared: false,
    });
    expect(stageResult({ economy: { total: 6, reputation: 0 }, orders: { completed: 1 } }))
      .toMatchObject({ earnings: 6, signedReputation: '+0', cleared: true });
  });
});
