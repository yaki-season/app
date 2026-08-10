// 브라우저 결선 계층. 엔진은 순수하게 두고 여기서만 window·document를 만진다.

import { runtimeAssetUrl } from '../assets/runtimeAssetResolver.js';
import { createAudioEngine } from './audioEngine.js';

let engine = null;

export function gameAudio() {
  return engine;
}

export function installGameAudio(win = globalThis) {
  if (engine) return engine;

  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  engine = createAudioEngine({
    createContext: Ctor ? () => new Ctor() : undefined,
    fetchImpl: win.fetch?.bind(win),
    resolveUrl: (url) => runtimeAssetUrl(url),
  });

  // 자동재생 제한: 첫 입력에서 연다. 그 전 이벤트는 재생하지 않고 버린다.
  const unlock = () => { void engine.unlock(); };
  for (const type of ['pointerdown', 'keydown', 'touchstart']) {
    win.addEventListener?.(type, unlock, { once: true, passive: true });
  }

  // 백그라운드에서 소리를 쌓아두지 않는다. 복귀는 논리 상태가 다시 루프를 건다.
  win.document?.addEventListener?.('visibilitychange', () => {
    if (win.document.visibilityState === 'hidden') engine.suspend();
    else engine.resume();
  });

  return engine;
}

// 호출부가 async를 신경 쓰지 않게 감싼다. 오디오는 절대 게임 흐름을 막지 않는다.
export function sfx(id, opts) {
  void engine?.play(id, opts);
}

export function sfxOnce(id, key, opts) {
  void engine?.playOnce(id, key, opts);
}

export function loopOn(id, opts) {
  void engine?.startLoop(id, opts);
}

export function loopOff(id) {
  engine?.stopLoop(id);
}

export function loopRate(id, rate) {
  engine?.setLoopRate(id, rate);
}
