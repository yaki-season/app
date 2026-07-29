// 로컬 개발 서버(python http.server, app/ 루트)에서 승인 아트의 런타임 URL /assets/... 가
// public/assets/... 로 해소되도록 app/assets → public/assets 링크를 만든다.
//
// 자산 파이프라인 계약상 런타임 URL은 /assets/로 시작하고 파일은 public/assets에 있다
// (tools/assets/runtime-assets-lib.mjs). 링크는 커밋하지 않으므로(gitignore) 새 체크아웃마다 실행한다:
//   node tools/dev/link-assets.mjs   (또는 npm run link:assets)
import { existsSync, symlinkSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const link = path.join(appRoot, 'assets');
const target = path.join(appRoot, 'public', 'assets');

if (existsSync(link)) {
  try { lstatSync(link); console.log(`이미 존재: ${link}`); process.exit(0); } catch { /* fallthrough */ }
}
try {
  if (process.platform === 'win32') {
    // 디렉터리 정션(관리자 권한 불필요).
    execFileSync('cmd', ['/c', 'mklink', '/J', link, target], { stdio: 'ignore' });
  } else {
    symlinkSync(target, link, 'dir');
  }
  console.log(`링크 생성: ${link} -> ${target}`);
} catch (err) {
  console.error(`링크 생성 실패(${err.message}). 수동: mklink /J assets public\\assets`);
  process.exit(1);
}
