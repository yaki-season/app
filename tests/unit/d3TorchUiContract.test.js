import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('D3 토치 UI 계약', () => {
  it('포인터·키보드·게이지·과열 경고와 stable test id를 제공한다', () => {
    const html = read('src/d1-game.html');
    const js = read('src/d1-game.js');
    expect(html).toContain('data-testid="d3-torch-panel"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('키보드: Space로 토치를 켠 채 ← →로 이동');
    expect(html).toContain('id="d3TorchWarning"');
    expect(js).toContain("d3TorchTrack.addEventListener('pointermove'");
    expect(js).toContain("d3TorchTrack.addEventListener('keydown'");
    expect(js).toContain('d3Grill: d3Grill.snapshot()');
  });
});
