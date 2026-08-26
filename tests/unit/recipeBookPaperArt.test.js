// 비법노트 종이(UI-RECIPE-BOOK-PAPER)는 누끼 딴 라스터여야 한다. R1은 흰 배경이 남아 있어
// 패널 주위에 흰 테가 보였다. CSS가 활성 manifest url을 그대로 쓰는지도 함께 고정한다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readPngAlpha } from '../helpers/pngAlpha.js';

const appRoot = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(fileURLToPath(new URL(relative, appRoot)));

const manifest = JSON.parse(read('public/assets/manifest.json').toString('utf8'));
const paper = manifest.assets.find(({ id }) => id === 'UI-RECIPE-BOOK-PAPER');
const css = read('src/d1-game.css').toString('utf8');

describe('비법노트 종이 누끼 계약', () => {
  it('활성 runtime이 straight 알파로 등록돼 있다', () => {
    expect(paper).toBeDefined();
    expect(paper.alpha).toBe('straight');
    expect(paper.status).toBe('approved');
  });

  it('종이 바깥 여백과 펀치홀이 완전히 투명하다', () => {
    const png = readPngAlpha(read(`public${paper.url}`));
    expect({ width: png.width, height: png.height }).toEqual(paper.dimensions);
    // 네 모서리 = 종이 바깥. 잘라내지 않은 원본이면 여기가 불투명한 흰색이다.
    for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]]) {
      expect(png.at(x, y)).toBe(0);
    }
    // 왼쪽 펀치홀 열(원본에서 흰색으로 채워져 있던 구멍)도 뚫려 있어야 한다.
    const holeColumn = 80;
    let punched = 0;
    for (let y = 0; y < png.height; y += 1) if (png.at(holeColumn, y) === 0) punched += 1;
    expect(punched).toBeGreaterThan(png.height * 0.2);
    // 종이 본문은 불투명하게 남는다.
    expect(png.at(Math.round(png.width * 0.6), Math.round(png.height * 0.5))).toBe(255);
  });

  it('비법노트 CSS가 활성 runtime url만 참조한다', () => {
    expect(css).toContain(paper.url);
    expect(css).not.toMatch(/grandfather-secret-recipe-notebook-bg-r1-b1\.png/);
    // 잘라낸 가장자리를 다시 사각형으로 만드는 배경색·사각 그림자를 두지 않는다.
    const block = css.slice(css.indexOf('.recipe-book {'), css.indexOf('.recipe-book[hidden]'));
    expect(block).not.toMatch(/box-shadow/);
    expect(block).not.toMatch(/background:\s*#/);
  });
});
