import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DIAGNOSTIC_CHECKS = Object.freeze([
  'assets:validate', 'visual:references:validate', 'd1:release:check', 'test', 'test:e2e', 'build',
]);

// 하나의 실패가 뒤의 검증 결과를 가리지 않는다. 최종 실패 코드는 반드시 유지한다.
export function runChecks(checks, run) {
  return checks.map(name => {
    try {
      const result = run(name);
      return { name, ok: result.status === 0 && !result.error, status: result.status,
        error: result.error ? String(result.error.message ?? result.error) : null };
    } catch (error) {
      return { name, ok: false, status: null, error: String(error.message ?? error) };
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw Error('npm run verify:full-diagnostic 으로 실행하세요.');
  const results = runChecks(DIAGNOSTIC_CHECKS, name => {
    console.log(`\n[진단 시작] ${name}`);
    return spawnSync(process.execPath, [npmCli, 'run', name], { stdio: 'inherit' });
  });
  console.table(results);
  process.exitCode = results.every(result => result.ok) ? 0 : 1;
}
