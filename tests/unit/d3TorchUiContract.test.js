import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('D3 토치 UI 계약', () => {
  it('포인터·키보드·게이지·과열 경고와 stable test id를 제공한다', () => {
    const html = read('src/d1-game.html');
    const js = read('src/d1-game.js');
    expect(html).toContain('data-testid="d3-torch-panel"');
    expect(html).toContain('data-testid="d3-torch-cursor"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('토치는 선택 불향 보너스');
    expect(html).toContain('id="d3TorchWarning"');
    expect(html).toContain('data-required-asset-id="MDL-GRILL-TORCH"');
    expect(html).toContain('data-required-asset-id="VFX-TORCH-FLAME"');
    expect(html).toContain('data-required-asset-id="PROP-TARE-BRUSH-D3"');
    expect(js).toContain("proper: 'D3-MOMO-TORCH-PROPER'");
    expect(js).toContain("d3TorchTrack.addEventListener('pointermove'");
    expect(js).toContain("document.addEventListener('pointerdown'");
    expect(js).toContain('requestAnimationFrame(tickD3CursorTorch)');
    expect(js).toContain("d3TorchTrack.addEventListener('keydown'");
    expect(js).toContain('d3Grill: d3Grill.snapshot()');
  });
});
