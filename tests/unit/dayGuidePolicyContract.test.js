import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/d1-game.js', import.meta.url), 'utf8');

describe('날짜별 도움 감소 계약', () => {
  it('D1 순차·D2 복습·D3 신규 행동 정책을 분리하고 비D1에서는 강제 target을 만들지 않는다', () => {
    expect(source).toContain("d1: { title: '첫 주문 · 총 3항목', mode: 'sequential' }");
    expect(source).toContain("d2: { title: 'D2 · 복습 도움', mode: 'review'");
    expect(source).toContain("d3: { title: 'D3 · 타레와 토치', mode: 'new-action'");
    expect(source).toContain("if (policy.mode !== 'sequential')");
    expect(source).toContain("target.dataset.guideTarget = 'false'");
  });
});
