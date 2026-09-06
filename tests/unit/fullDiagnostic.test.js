import { describe, expect, it } from 'vitest';
import { runChecks } from '../../tools/qa/full-diagnostic.mjs';

describe('전체 진단은 실패를 숨기거나 후속 검사를 건너뛰지 않는다', () => {
  it('첫 게이트 실패 뒤에도 게임 검증을 실행하고 실패 상태를 남긴다', () => {
    const visited = [];
    const results = runChecks(['assets', 'game'], name => {
      visited.push(name); return { status: name === 'assets' ? 1 : 0 };
    });
    expect(visited).toEqual(['assets', 'game']);
    expect(results.map(result => result.ok)).toEqual([false, true]);
  });
  it('실행 자체의 예외 뒤에도 다음 검사를 실행한다', () => {
    const results = runChecks(['broken', 'game'], name => {
      if (name === 'broken') throw Error('spawn failed');
      return { status: 0 };
    });
    expect(results).toMatchObject([{ ok: false, error: 'spawn failed' }, { ok: true }]);
  });
  it('종료 코드가 없는 중단도 성공으로 취급하지 않는다', () => {
    expect(runChecks(['interrupted'], () => ({ status: null }))[0].ok).toBe(false);
  });
});
