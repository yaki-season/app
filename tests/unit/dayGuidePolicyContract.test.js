import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/d1-game.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../src/d1-game.html', import.meta.url), 'utf8');
const legacyView = readFileSync(new URL('../../src/d1/view.js', import.meta.url), 'utf8');
const legacyHtml = readFileSync(new URL('../../src/d1.html', import.meta.url), 'utf8');
const legacySceneHtml = readFileSync(new URL('../../src/d1-scene.html', import.meta.url), 'utf8');
const orders = JSON.parse(readFileSync(
  new URL('../../content/orders/early-campaign.json', import.meta.url),
  'utf8',
));

describe('실제 영업 순차 안내 폐기 계약', () => {
  it('공개 영업 진입점에 단계 패널·강제 target·진행도 저장을 남기지 않는다', () => {
    expect(html).not.toContain('data-testid="d1-guide"');
    expect(source).not.toContain('firstOrderGuide');
    expect(source).not.toContain('guideTarget');
    expect(source).not.toContain('guideFlipCount');
    expect(legacyView).not.toContain("document.querySelector('#guide')");
    expect(legacyHtml).not.toContain('data-testid="d1-guide"');
    expect(legacySceneHtml).not.toContain('data-testid="d1-guide"');
    expect(orders.filter(({ dayId }) => dayId === 'd1').every(({ guidanceId }) => guidanceId === null))
      .toBe(true);
  });
});
