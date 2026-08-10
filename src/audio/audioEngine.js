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

  function start(entry, buffer, { rate = 1, gain = 1 } = {}) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = entry.loop;
    if (source.playbackRate) source.playbackRate.value = rate;

    const nodeGain = context.createGain();
    nodeGain.gain.value = gain;
    source.connect(nodeGain);
    nodeGain.connect(busGain.get(entry.bus) ?? masterGain);
    source.start();

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
    // 화면이 숨겨졌거나 잠금 해제 전이면 쌓아두지 않고 버린다(AUD-001 16항, 자동재생 예외).
    const buffer = await load(id);
    if (!buffer || !canSound()) return null;
    try {
      return start(entry, buffer, opts);
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
      const handle = await play(id, opts);
      if (handle) loops.set(id, handle);
      return handle;
    },

    stopLoop(id) {
      const handle = loops.get(id);
      if (!handle) return false;
      loops.delete(id);
      try { handle.source.stop(); } catch { /* 이미 끝난 소스 */ }
      return true;
    },

    // 채움 피치와 토치 훑기는 파일이 아니라 런타임이 변조한다.
    setLoopRate(id, rate) {
      const handle = loops.get(id);
      if (!handle?.source?.playbackRate) return false;
      handle.source.playbackRate.value = rate;
      return true;
    },

    stopAllLoops() {
      for (const id of [...loops.keys()]) this.stopLoop(id);
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
      };
    },
  };
}
