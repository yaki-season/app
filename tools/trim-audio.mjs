// 납품 오디오를 게임이 실제로 쓰는 길이로 줄여 배포본 용량을 낮춘다.
//
// 왜 필요한가: 납품 파일이 실내 앰비언스 28분(33MB), 지글거림 10분(19MB)처럼 길다. 게임은
// 반복음을 30~45초만 있어도 되고, 상태 신호는 2~3초만 울린다(엔진이 maxSec으로 자른다).
// 그대로 배포하면 첫 로딩에 수십 MB를 받는다.
//
// 원본은 지우지 않고 audio-src/로 옮긴다. 저장소 안이지만 public/ 밖이라 배포본에는 실리지 않는다.
//
// 사용법: node tools/trim-audio.mjs [--dry]
//   ffmpeg 실행 파일은 FFMPEG_PATH 환경변수로 준다(없으면 PATH의 ffmpeg).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const DRY = process.argv.includes('--dry');
const PUBLIC_AUDIO = 'public/assets/audio';
const SOURCE_KEEP = 'audio-src';

// seconds: 남길 길이. kind: 'loop'이면 이어 붙는 소리라 페이드를 넣지 않는다.
// 'cue'는 중간에서 자르므로 끝을 짧게 줄여 딸깍 소리를 막는다.
const PLAN = [
  // 반복음 — 30~45초면 충분하다(AUD-002도 실내 앰비언스를 30~60초로 규정한다).
  { file: 'ambience/shop-interior-r1-b1.mp3', seconds: 45, kind: 'loop' },
  { file: 'ambience/alley-night-r1-b1.mp3', seconds: 45, kind: 'loop' },
  { file: 'ambience/charcoal-bed-r1-b1.mp3', seconds: 40, kind: 'loop' },
  { file: 'ambience/crowd-l2-r1-b1.mp3', seconds: 30, kind: 'loop' },
  { file: 's0/distant-shop-r1-b1.mp3', dir: 'sfx', seconds: 40, kind: 'loop' },
  { file: 'grill/cook-loop-r1-b1.mp3', dir: 'sfx', seconds: 30, kind: 'loop' },
  { file: 'drink/beer-flow-r1-b1.mp3', dir: 'sfx', seconds: 8, kind: 'loop' },
  { file: 'drink/foam-flow-r1-b1.mp3', dir: 'sfx', seconds: 8, kind: 'loop' },
  { file: 'drink/fill-pitch-r1-b1.mp3', dir: 'sfx', seconds: 8, kind: 'loop' },

  // 단발 신호 — 런타임이 2~2.5초에서 끊는다. 파일도 그만큼만 있으면 된다.
  { file: 'grill/burnt-r1-b1.mp3', dir: 'sfx', seconds: 3, kind: 'cue' },
  { file: 'grill/proper-enter-r1-b1.mp3', dir: 'sfx', seconds: 3, kind: 'cue' },
  { file: 'grill/place-sizzle-r1-b1.mp3', dir: 'sfx', seconds: 3, kind: 'cue' },
  { file: 'drink/glass-set-r1-b1.mp3', dir: 'sfx', seconds: 2.5, kind: 'cue' },
  { file: 'drink/glass-resonance-r1-b1.mp3', dir: 'sfx', seconds: 3, kind: 'cue' },
  { file: 'drink/tray-tap-r1-b1.mp3', dir: 'sfx', seconds: 2.5, kind: 'cue' },
  { file: 'prep/first-sizzle-r1-b1.mp3', dir: 'sfx', seconds: 4, kind: 'cue' },
  { file: 'prep/fan-r1-b1.mp3', dir: 'sfx', seconds: 4, kind: 'cue' },
  { file: 's0/wet-tire-r1-b1.mp3', dir: 'sfx', seconds: 6, kind: 'cue' },
];

// BGM은 wav로만 납품돼 매번 7.7MB를 받는다. 길이는 그대로 두고 포맷만 바꾼다.
const BGM = { from: 'bgm/main-r1-b1.wav', to: 'bgm/main-r1-b1.mp3' };

const kb = (bytes) => `${Math.round(bytes / 1024)}KB`;

function run(args) {
  if (DRY) { console.log('  ffmpeg', args.join(' ')); return; }
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
}

function keepOriginal(path) {
  const target = join(SOURCE_KEEP, relative(PUBLIC_AUDIO, path));
  if (DRY) { console.log(`  keep → ${target}`); return; }
  mkdirSync(dirname(target), { recursive: true });
  renameSync(path, target);
}

let before = 0;
let after = 0;

for (const entry of PLAN) {
  const path = join(PUBLIC_AUDIO, entry.dir ?? '', entry.file);
  if (!existsSync(path)) { console.log(`skip (없음): ${path}`); continue; }
  const originalSize = statSync(path).size;
  const temporary = `${path}.trimmed.mp3`;
  const filters = entry.kind === 'cue'
    ? ['-af', `afade=t=out:st=${Math.max(0, entry.seconds - 0.15)}:d=0.15`]
    : [];
  run(['-i', path, '-t', String(entry.seconds), ...filters, '-c:a', 'libmp3lame', '-b:a', '96k', temporary]);
  keepOriginal(path);
  if (!DRY) renameSync(temporary, path);
  const newSize = DRY ? 0 : statSync(path).size;
  before += originalSize;
  after += newSize;
  console.log(`${entry.file.padEnd(34)} ${kb(originalSize).padStart(8)} → ${kb(newSize).padStart(7)}  (${entry.seconds}s ${entry.kind})`);
}

const bgmPath = join(PUBLIC_AUDIO, BGM.from);
if (existsSync(bgmPath)) {
  const originalSize = statSync(bgmPath).size;
  const target = join(PUBLIC_AUDIO, BGM.to);
  run(['-i', bgmPath, '-c:a', 'libmp3lame', '-b:a', '128k', target]);
  keepOriginal(bgmPath);
  const newSize = DRY ? 0 : statSync(target).size;
  before += originalSize;
  after += newSize;
  console.log(`${BGM.from.padEnd(34)} ${kb(originalSize).padStart(8)} → ${kb(newSize).padStart(7)}  (mp3 변환)`);
}

console.log(`\n합계 ${kb(before)} → ${kb(after)}`);
