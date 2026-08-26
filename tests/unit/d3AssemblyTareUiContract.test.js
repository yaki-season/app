import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('D3 타레 조립 UI 계약', () => {
  it('조립대에만 소스통·실제 붓질 입력을 두고 그릴은 양념별 재고만 소비한다', () => {
    const html = read('src/d1-game.html');
    const js = read('src/d1-game.js');
    const css = read('src/d1-game.css');
    expect(html).toContain('data-testid="assembly-tare-pot"');
    expect(html).toContain('data-testid="assembly-tare-cursor"');
    expect(html).toContain('/assets/campaign/d3/prop-tare-sauce-pot-r2-b1.png');
    expect(html).toContain('/assets/campaign/d3/prop-tare-sauce-pot-open-r2-b1.png');
    expect(html).not.toContain('data-testid="grill-tare-pot"');
    expect(html).not.toContain('data-testid="grill-tare-cursor"');
    expect(html).toContain('id="grillWaitingNegimaSalt"');
    expect(html).toContain('id="grillWaitingNegimaTare"');
    expect(html).not.toContain('data-menu-id="momo" data-seasoning="tare"');
    expect(js).toContain("cook.selectAssemblySeasoning('tare')");
    expect(js).toContain('cook.brushAssemblyTare(coverage)');
    expect(js).toContain("document.addEventListener('pointermove'");
    expect(js).toContain('assemblyTarePaintedZones.size / ASSEMBLY_TARE_ZONE_COUNT');
    expect(js).not.toContain('cook.applyTare(');
    expect(html).not.toContain('d3-torch');
    expect(html).not.toContain('토치');
    expect(css).not.toContain('d3-torch');
    expect(js).not.toContain('d3Torch');
    expect(js).not.toContain('createD3GrillSession');
  });
});
