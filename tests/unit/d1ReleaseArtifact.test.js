import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildD1ReleaseArtifact,
  checkD1ReleaseArtifact,
} from '../../tools/content/build-d1-release-definition.mjs';

const artifactUrl = new URL('../../content/releases/d1-business-day-definition.v1.json', import.meta.url);

describe('작업 009 D1 공개 release artifact', () => {
  it('정본 builder 출력으로 canonical JSON artifact를 결정적으로 materialize한다', () => {
    const artifact = readFileSync(fileURLToPath(artifactUrl), 'utf8');
    const release = JSON.parse(artifact);

    expect(artifact).toBe(buildD1ReleaseArtifact());
    expect(release).toMatchObject({
      id: 'd1-release-definition',
      schemaVersion: 1,
      source: { dayId: 'd1' },
      sessionTargetMs: 420000,
      totals: { customers: 4, orders: 4, items: 9 },
      timingMs: { cleanup: 3000 },
    });
    expect(release.seatIds).toHaveLength(6);
    expect(release.waves.map(({ atMs }) => atMs)).toEqual([0, 100000, 220000]);
    expect(release.waves.flatMap((wave) => wave.customers).map(({ id }) => id)).toEqual([
      'REGULAR_TSUKIOKA', 'D1-OFFICE-A', 'D1-OFFICE-B', 'D1-SOLO-A',
    ]);
    expect(release.economy.menuPrices).toEqual({ beer: 6, negima: 3 });
  });

  it('artifact가 다르면 최상위 drift 필드를 보고하고 조용히 덮어쓰지 않는다', () => {
    const stale = JSON.parse(buildD1ReleaseArtifact());
    stale.totals.items = 8;
    const result = checkD1ReleaseArtifact({ artifact: `${JSON.stringify(stale)}\n` });

    expect(result).toEqual({ valid: false, differences: ['totals'] });
  });
});
