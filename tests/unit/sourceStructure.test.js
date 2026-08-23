import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sourceUrl = new URL('../../src/', import.meta.url);

const compatibilityEntrypoints = Object.freeze({
  'main.js': "import './app/entrypoints/main.js';",
  'game.js': "import './app/entrypoints/game.js';",
  'd1-game.js': "import './app/entrypoints/d1-game.js';",
  'd1-scene.js': "import './app/entrypoints/d1-scene.js';",
  'd1.js': "import './app/entrypoints/d1.js';",
  's0-d3.js': "import './app/entrypoints/s0-d3.js';",
  'public-shell.js': "export { bootPublicShell } from './app/entrypoints/public-shell.js';",
  'art-recomposition-harness.js': "import './app/entrypoints/harnesses/art-recomposition-harness.js';",
  'grill-ui-harness.js': "import './app/entrypoints/harnesses/grill-ui-harness.js';",
  's0-exterior-background-harness.js': "import './app/entrypoints/harnesses/s0-exterior-background-harness.js';",
});

function filesIn(relativeDirectory) {
  const directory = new URL(relativeDirectory, sourceUrl);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDirectory}${entry.name}`;
    return entry.isDirectory() ? filesIn(`${relativePath}/`) : [relativePath];
  });
}

describe('src 책임별 디렉터리 구조', () => {
  it('기존 브라우저 스크립트 URL은 얇은 호환 진입점으로 유지한다', () => {
    for (const [filename, expectedSource] of Object.entries(compatibilityEntrypoints)) {
      const source = readFileSync(new URL(filename, sourceUrl), 'utf8').trim();
      expect(source).toBe(expectedSource);
    }
  });

  it('이전 render·public-shell 구현 디렉터리에 소스 파일을 다시 두지 않는다', () => {
    expect(filesIn('render/')).toEqual([]);
    expect(filesIn('public-shell/')).toEqual([]);
  });
});
