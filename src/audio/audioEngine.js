// AUD-001 이벤트·상태 계약과 믹싱 규칙을 구현하는 재생 엔진.
//
// 설계 원칙 하나: 이 엔진은 어떤 경우에도 던지지 않는다. 파일이 없든, 디코딩이 깨지든, 브라우저가
// 자동재생을 막든 게임은 그대로 돈다. 오디오는 보조 채널이고 무음 플레이가 정식 지원 대상이다.
//
// AudioContext와 fetch를 주입받는다. 단위 테스트가 node 환경에서 돌기 때문이다.

import { AUDIO_BUS, audioEntry } from './audioCatalog.js';

const BUSES = [AUDIO_BUS.BGM, AUDIO_BUS.AMBIENCE, AUDIO_BUS.SFX, AUDIO_BUS.WARNING];

// decodeAudioData는 확장자가 아니라 내용으로 포맷을 판별한다. 그래서 납품 포맷을 하나로 강제하지
// 않고 순서대로 찾는다. 먼저 찾은 것을 쓴다.
//
// mp3를 뒤로 미룬 이유: 인코더 패딩 때문에 루프 경계에 틈이 생긴다. 같은 소리를 ogg와 mp3로 둘 다
// 넣으면 루프가 매끄러운 쪽이 선택된다.
export const AUDIO_EXTENSIONS = Object.freeze(['.ogg', '.m4a', '.mp3', '.wav']);

function urlCandidates(url) {
  const base = url.replace(/\.[a-z0-9]+$/i, '');
  return AUDIO_EXTENSIONS.map((ext) => `${base}${ext}`);
}

export const DEFAULT_VOLUMES = Object.freeze({
  master: 0.8,
  [AUDIO_BUS.BGM]: 0.55,
  [AUDIO_BUS.AMBIENCE]: 0.45,
  [AUDIO_BUS.SFX]: 0.9,
  // 경고는 BGM보다 우선하지만 갑작스러운 과도한 음량 상승을 쓰지 않는다(AUD-001 21항).
  [AUDIO_BUS.WARNING]: 1.0,
});

export function createAudioEngine(options = {}) {
  const {
    createContext,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    resolveUrl = (url) => url,
    volumes: initialVolumes,
  } = options;

  const volumes = { ...DEFAULT_VOLUMES, ...(initialVolumes ?? {}) };
  let muted = false;
  let context = null;
  let masterGain = null;
  const busGain = new Map();

  // id → Promise<AudioBuffer|null>. null은 "없는 파일"이며 다시 받으러 가지 않는다.
  const buffers = new Map();
  const missing = new Set();
  const pendingLoops = new Map();
  const activeOneShots = new Map();
  const playGeneration = new Map();
  const loops = new Map();          // id → { source, gain }
  const firedKeys = new Set();      // 임계별 1회 보장
  const activeWarnings = new Set(); // { priority }
  let suspended = false;

  function busVolume(bus) {
    return muted ? 0 : (volumes.master ?? 1) * (volumes[bus] ?? 1);
  }

  function ensureContext() {
    if (context || typeof createContext !== 'function') return context;
    try {
      context = createContext();
      masterGain = context.createGain();
      masterGain.connect(context.destination);
      for (const bus of BUSES) {
        const gain = context.createGain();
        gain.gain.value = busVolume(bus);
        gain.connect(masterGain);
        busGain.set(bus, gain);
      }
    } catch {
      context = null;
    }
    return context;
  }

  function applyVolumes() {
    for (const bus of BUSES) {
      const gain = busGain.get(bus);
      if (gain) gain.gain.value = busVolume(bus);
    }
  }

  async function load(id) {
    if (missing.has(id)) return null;
    if (buffers.has(id)) return buffers.get(id);
    const entry = audioEntry(id);
    if (!entry || !ensureContext() || typeof fetchImpl !== 'function') return null;

    const promise = (async () => {
      for (const url of urlCandidates(entry.url)) {
        try {
          const response = await fetchImpl(resolveUrl(url));
          if (!response?.ok) continue;
          const bytes = await response.arrayBuffer();
          return await context.decodeAudioData(bytes);
        } catch {
          // 없는 파일과 깨진 파일을 구분하지 않는다. 다음 후보로 넘어간다.
        }
      }
      missing.add(id);
      return null;
    })();
    buffers.set(id, promise);
    return promise;
  }

  function canSound() {
    return Boolean(ensureContext()) && !suspended && context.state !== 'suspended';
  }

  // 더 급한 경고가 울리는 동안 덜 급한 경고를 얹지 않는다(AUD-001 11항).
  function warningBlocked(entry) {
    if (entry.bus !== AUDIO_BUS.WARNING) return false;
    for (const active of activeWarnings) {
      if (active.priority > (entry.priority ?? 0)) return true;
    }
    return false;
  }

  // 납품 파일이 연출보다 길 때 호출부가 길이를 잘라 쓴다. 원본을 다시 굽는 대신 재생만 줄이는
  // 쪽이라, 나중에 짧은 파일이 들어오면 maxSec만 빼면 된다. 뚝 끊기면 클릭음이 나므로 끝에서
  // 짧게 감쇄시킨다.
  function truncate(source, nodeGain, gain, maxSec) {
    const now = context.currentTime ?? 0;
    const fade = Math.min(0.12, maxSec / 4);
    if (typeof nodeGain.gain.setValueAtTime === 'function') {
      nodeGain.gain.setValueAtTime(gain, now + maxSec - fade);
      nodeGain.gain.linearRampToValueAtTime(0, now + maxSec);
    }
    try { source.stop(now + maxSec); } catch { /* stop 미지원 소스 */ }
  }

  function start(entry, buffer, { rate = 1, gain = 1, maxSec = null } = {}) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = entry.loop;
    if (source.playbackRate) source.playbackRate.value = rate;

    const nodeGain = context.createGain();
    nodeGain.gain.value = gain;
    source.connect(nodeGain);
    nodeGain.connect(busGain.get(entry.bus) ?? masterGain);
    source.start();
    if (Number.isFinite(maxSec) && maxSec > 0 && !(buffer.duration <= maxSec)) {
      truncate(source, nodeGain, gain, maxSec);
    }

    if (entry.bus === AUDIO_BUS.WARNING) {
      const token = { priority: entry.priority ?? 0 };
      activeWarnings.add(token);
      source.onended = () => activeWarnings.delete(token);
    }
    return { source, gain: nodeGain };
  }

  async function play(id, opts = {}) {
    const entry = audioEntry(id);
    if (!entry || !canSound() || warningBlocked(entry)) return null;
    const generation = playGeneration.get(id) ?? 0;
    // 화면이 숨겨졌거나 잠금 해제 전이면 쌓아두지 않고 버린다(AUD-001 16항, 자동재생 예외).
    const buffer = await load(id);
    if (!buffer || !canSound()) return null;
    if (!entry.loop && generation !== (playGeneration.get(id) ?? 0)) return null;
    try {
      const handle = start(entry, buffer, opts);
      if (!entry.loop) {
        const handles = activeOneShots.get(id) ?? new Set();
        handles.add(handle);
        activeOneShots.set(id, handles);
        const previousOnEnded = handle.source.onended;
        handle.source.onended = () => {
          previousOnEnded?.();
          handles.delete(handle);
          if (handles.size === 0) activeOneShots.delete(id);
        };
      }
      return handle;
    } catch {
      return null;
    }
  }

  return {
    // 브라우저 자동재생 제한: 첫 사용자 입력에서 호출한다.
    async unlock() {
      if (!ensureContext()) return false;
      try {
        if (context.state === 'suspended') await context.resume();
        return context.state === 'running';
      } catch {
        return false;
      }
    },

    play,

    // 같은 위험의 같은 임계는 한 번만 운다.
    playOnce(id, key, opts) {
      const dedupe = `${id}:${key}`;
      if (firedKeys.has(dedupe)) return null;
      firedKeys.add(dedupe);
      return play(id, opts);
    },

    resetOnce(prefix = '') {
      for (const key of [...firedKeys]) {
        if (!prefix || key.startsWith(prefix)) firedKeys.delete(key);
      }
    },

    async startLoop(id, opts) {
      if (loops.has(id)) return loops.get(id);
      if (pendingLoops.has(id)) return null;
      const token = Symbol(id);
      pendingLoops.set(id, token);
      const handle = await play(id, opts);
      if (pendingLoops.get(id) !== token) {
        try { handle?.source.stop(); } catch { /* cancelled while loading */ }
        return null;
      }
      pendingLoops.delete(id);
      if (handle) loops.set(id, handle);
      return handle;
    },

    stopLoop(id) {
      const cancelledPending = pendingLoops.delete(id);
      const handle = loops.get(id);
      if (!handle) return cancelledPending;
      loops.delete(id);
      try { handle.source.stop(); } catch { /* 이미 끝난 소스 */ }
      return true;
    },

    stop(id) {
      const handles = activeOneShots.get(id);
      playGeneration.set(id, (playGeneration.get(id) ?? 0) + 1);
      if (!handles) return false;
      activeOneShots.delete(id);
      for (const handle of handles) {
        try { handle.source.stop(); } catch { /* already ended */ }
      }
      return true;
    },

    // 액체 채움 피치는 별도 파일을 늘리지 않고 런타임이 변조한다.
    //
    // glideSec을 주면 목표값으로 미끄러진다. 매 프레임 값을 그대로 꽂으면 계단처럼 끊긴 피치가
    // 지직거리는 잡음(zipper noise)으로 들린다.
    setLoopRate(id, rate, { glideSec = 0 } = {}) {
      const handle = loops.get(id);
      const param = handle?.source?.playbackRate;
      if (!param) return false;
      if (glideSec > 0 && typeof param.setTargetAtTime === 'function') {
        param.setTargetAtTime(rate, context.currentTime ?? 0, glideSec / 3);
        return true;
      }
      param.value = rate;
      return true;
    },

    stopAllLoops() {
      for (const id of new Set([...loops.keys(), ...pendingLoops.keys()])) this.stopLoop(id);
    },

    setVolume(bus, value) {
      const clamped = Math.max(0, Math.min(1, Number(value) || 0));
      if (bus !== 'master' && !BUSES.includes(bus)) return false;
      volumes[bus] = clamped;
      applyVolumes();
      return true;
    },

    setMuted(next) {
      muted = next === true;
      applyVolumes();
      return muted;
    },

    // 일시정지·백그라운드는 반복음을 즉시 멈춘다. 복귀 시 논리 상태로 새 루프를 시작한다.
    suspend() {
      suspended = true;
      this.stopAllLoops();
    },

    resume() {
      suspended = false;
    },

    state() {
      return {
        ready: Boolean(context),
        suspended,
        muted,
        volumes: { ...volumes },
        loaded: [...buffers.keys()],
        missing: [...missing],
        loops: [...loops.keys()],
        pendingLoops: [...pendingLoops.keys()],
        loopRates: Object.fromEntries([...loops].map(([id, handle]) => [
          id,
          handle.source?.playbackRate?.value ?? 1,
        ])),
        activeOneShots: [...activeOneShots.keys()],
      };
    },
  };
}
