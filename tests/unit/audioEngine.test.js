import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUDIO_BUS, AUDIO_CATALOG, audioEntry, audioIdsByBus, crowdAmbienceId } from '../../src/audio/audioCatalog.js';
import { AUDIO_EXTENSIONS, createAudioEngine } from '../../src/audio/audioEngine.js';

function fakeContext() {
  const sources = [];
  return {
    state: 'running',
    destination: {},
    sources,
    createGain: () => ({ gain: { value: 1 }, connect() {} }),
    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        stopped: false,
        onended: null,
        connect() {},
        start() { sources.push(source); },
        stop() { source.stopped = true; },
      };
      return source;
    },
    decodeAudioData: async () => ({ duration: 1 }),
    resume: async () => {},
  };
}

function engineWith({ present = () => true } = {}) {
  const context = fakeContext();
  const requested = [];
  const engine = createAudioEngine({
    createContext: () => context,
    fetchImpl: async (url) => {
      requested.push(url);
      return present(url)
        ? { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
        : { ok: false, arrayBuffer: async () => { throw new Error('없는 파일'); } };
    },
  });
  return { engine, context, requested };
}

describe('오디오 카탈로그', () => {
  it('AUD-002의 78개 자산을 중복 없는 ID로 담는다', () => {
    expect(AUDIO_CATALOG).toHaveLength(78);
    expect(new Set(AUDIO_CATALOG.map((entry) => entry.id)).size).toBe(78);
  });

  it('손님이 한 명이면 군중음을 재생하지 않는다', () => {
    expect(crowdAmbienceId(0)).toBeNull();
    expect(crowdAmbienceId(1)).toBeNull();
    expect(crowdAmbienceId(2)).toBe('AMB-CROWD-L1');
    expect(crowdAmbienceId(4)).toBe('AMB-CROWD-L1');
    expect(crowdAmbienceId(5)).toBe('AMB-CROWD-L2');
    expect(crowdAmbienceId(9)).toBe('AMB-CROWD-L2');
  });

  it('BGM 6종은 같은 곡을 가리키고 SFX·환경음은 각자 파일을 갖는다', () => {
    const bgmUrls = new Set(audioIdsByBus(AUDIO_BUS.BGM).map((id) => audioEntry(id).url));
    expect(bgmUrls.size).toBe(1);
    // 상태별 곡을 나중에 갈라도 ID는 그대로 남아야 한다.
    expect(audioIdsByBus(AUDIO_BUS.BGM)).toHaveLength(6);

    const nonBgm = AUDIO_CATALOG.filter((entry) => entry.bus !== AUDIO_BUS.BGM);
    expect(new Set(nonBgm.map((entry) => entry.url)).size).toBe(nonBgm.length);
  });

  it('납품 체크리스트와 파일 이름이 정확히 일치한다', () => {
    // 카탈로그와 README가 갈라지면 님이 넣은 파일이 조용히 안 울린다. 그 상황을 여기서 잡는다.
    const readme = readFileSync(new URL('../../public/assets/audio/README.md', import.meta.url), 'utf8');
    const listed = new Set([...readme.matchAll(/`([a-z0-9-]+-r\d+-b\d+\.ogg)`/g)].map((m) => m[1]));
    const catalogFiles = new Set(AUDIO_CATALOG.map((entry) => entry.url.split('/').pop()));
    // 78개 자산이지만 파일은 72개다. BGM 6종이 main 한 곡을 공유하고, complete-r1-b1.ogg가
    // 조립과 생맥주에 각각 있으나 폴더가 달라 충돌하지 않는다.
    expect(catalogFiles.size).toBe(72);
    for (const file of catalogFiles) expect(listed, file).toContain(file);
    for (const file of listed) expect(catalogFiles, file).toContain(file);
  });

  it('모든 경로가 audio pack 규약을 따른다', () => {
    for (const entry of AUDIO_CATALOG) {
      expect(entry.url, entry.id).toMatch(/^\/assets\/audio\/[a-z0-9/-]+\/[a-z0-9-]+-r\d+-b\d+\.ogg$/);
    }
  });

  it('경고 4종만 warning 버스를 쓰고 우선순위를 갖는다', () => {
    const warnings = audioIdsByBus(AUDIO_BUS.WARNING);
    expect(warnings.sort()).toEqual([
      'SFX-TORCH-OVERHEAT', 'SFX-WARN-CUSTOMER-LEAVE', 'SFX-WARN-T1', 'SFX-WARN-T3',
    ]);
    for (const id of warnings) expect(audioEntry(id).priority, id).toBeGreaterThan(0);
    // 조리 실패 임박이 손님 이탈 임박보다 급하다.
    expect(audioEntry('SFX-WARN-T1').priority)
      .toBeGreaterThan(audioEntry('SFX-WARN-CUSTOMER-LEAVE').priority);
  });

  it('굽기 루프와 흐름음은 루프로 선언한다', () => {
    for (const id of ['SFX-GRILL-COOK-LOOP', 'SFX-DRINK-BEER-FLOW', 'SFX-TORCH-LOOP']) {
      expect(audioEntry(id).loop, id).toBe(true);
    }
    expect(audioEntry('SFX-UI-SELECT').loop).toBe(false);
    expect(audioEntry('SFX-INGAME-SELECT').loop).toBe(false);
    expect(audioEntry('SFX-ASM-PICK-CHICKEN')).toBeNull();
    expect(audioEntry('SFX-ASM-PICK-LEEK')).toBeNull();
    expect(audioEntry('SFX-ASM-PIERCE')?.url).toContain('/sfx/assembly/pierce-r1-b1.ogg');
    expect(audioEntry('SFX-ASM-PIERCE-CHICKEN')).toBeNull();
    expect(audioEntry('SFX-ASM-PIERCE-LEEK')).toBeNull();
    expect(audioEntry('SFX-ASM-SKEWER-REBOUND')).toBeNull();
    expect(audioEntry('SFX-GRILL-FLIP')?.url).toContain('/sfx/grill/flip-r1-b1.ogg');
    expect(audioEntry('SFX-GRILL-FLIP-TONG')).toBeNull();
    expect(audioEntry('SFX-GRILL-FLIP-TURN')).toBeNull();
    expect(audioEntry('SFX-GRILL-FLIP-OILSPIT')).toBeNull();
    expect(audioEntry('SFX-S0-KEY-PICK')?.url).toContain('/sfx/s0/key-pick-r1-b1.ogg');
  });
});

describe('오디오 엔진', () => {
  it('파일이 없으면 조용히 넘어가고 다시 받으러 가지 않는다', async () => {
    const { engine, requested } = engineWith({ present: () => false });
    expect(await engine.play('SFX-UI-SELECT')).toBeNull();
    expect(await engine.play('SFX-UI-SELECT')).toBeNull();
    // 후보 확장자를 한 바퀴 돌고 포기한다. 두 번째 호출은 아예 나가지 않는다.
    expect(requested).toHaveLength(AUDIO_EXTENSIONS.length);
    expect(engine.state().missing).toContain('SFX-UI-SELECT');
  });

  it('파일이 있으면 재생하고 버퍼를 재사용한다', async () => {
    const { engine, context, requested } = engineWith();
    await engine.play('SFX-UI-SELECT');
    await engine.play('SFX-UI-SELECT');
    expect(context.sources).toHaveLength(2);
    expect(requested).toHaveLength(1);
  });

  it('ogg가 없으면 다른 확장자를 찾아 쓴다', async () => {
    // 님이 mp3나 wav를 넣어도 이름만 맞으면 울려야 한다.
    const { engine, requested } = engineWith({ present: (url) => url.endsWith('.wav') });
    expect(await engine.play('SFX-UI-SELECT')).not.toBeNull();
    expect(requested.at(-1)).toMatch(/select-r1-b1\.wav$/);
    expect(engine.state().missing).toHaveLength(0);
  });

  it('루프 자산은 mp3보다 갭 없는 포맷을 먼저 고른다', () => {
    // mp3는 인코더 패딩 때문에 루프 경계에 틈이 생긴다. 둘 다 있으면 ogg/m4a가 이겨야 한다.
    expect(AUDIO_EXTENSIONS.indexOf('.ogg')).toBeLessThan(AUDIO_EXTENSIONS.indexOf('.mp3'));
    expect(AUDIO_EXTENSIONS.indexOf('.m4a')).toBeLessThan(AUDIO_EXTENSIONS.indexOf('.mp3'));
  });

  it('더 급한 경고가 우는 동안 덜 급한 경고를 얹지 않는다', async () => {
    const { engine, context } = engineWith();
    await engine.play('SFX-WARN-T1');                 // 조리 실패 임박
    await engine.play('SFX-WARN-CUSTOMER-LEAVE');     // 손님 이탈 임박 → 막힘
    expect(context.sources).toHaveLength(1);

    context.sources[0].onended?.();                   // 앞 경고가 끝나면
    await engine.play('SFX-WARN-CUSTOMER-LEAVE');
    expect(context.sources).toHaveLength(2);
  });

  it('같은 임계는 한 번만 운다', async () => {
    const { engine, context } = engineWith();
    await engine.playOnce('SFX-WARN-T3', 'slot-a');
    await engine.playOnce('SFX-WARN-T3', 'slot-a');
    expect(context.sources).toHaveLength(1);

    await engine.playOnce('SFX-WARN-T3', 'slot-b');   // 다른 대상은 별개
    expect(context.sources).toHaveLength(2);

    engine.resetOnce();                               // 다음 꼬치는 다시 운다
    await engine.playOnce('SFX-WARN-T3', 'slot-a');
    expect(context.sources).toHaveLength(3);
  });

  it('일시정지는 반복음을 즉시 멈추고 예정된 소리를 쌓아두지 않는다', async () => {
    const { engine, context } = engineWith();
    await engine.startLoop('SFX-GRILL-COOK-LOOP');
    expect(engine.state().loops).toContain('SFX-GRILL-COOK-LOOP');

    engine.suspend();
    expect(context.sources[0].stopped).toBe(true);
    expect(engine.state().loops).toHaveLength(0);

    expect(await engine.play('SFX-UI-SELECT')).toBeNull();
    engine.resume();
    expect(await engine.play('SFX-UI-SELECT')).not.toBeNull();
  });

  it('루프는 중복 시작되지 않고 재생 속도를 런타임이 바꾼다', async () => {
    const { engine, context } = engineWith();
    await engine.startLoop('SFX-DRINK-FILL-PITCH');
    await engine.startLoop('SFX-DRINK-FILL-PITCH');
    expect(context.sources).toHaveLength(1);

    expect(engine.setLoopRate('SFX-DRINK-FILL-PITCH', 1.4)).toBe(true);
    expect(context.sources[0].playbackRate.value).toBe(1.4);
  });

  it('음소거와 음량을 버스별로 다룬다', async () => {
    const { engine } = engineWith();
    await engine.play('SFX-UI-SELECT');
    expect(engine.setVolume(AUDIO_BUS.BGM, 0.3)).toBe(true);
    expect(engine.state().volumes[AUDIO_BUS.BGM]).toBe(0.3);
    expect(engine.setVolume('없는버스', 0.5)).toBe(false);
    expect(engine.setMuted(true)).toBe(true);
    expect(engine.state().muted).toBe(true);
  });

  it('AudioContext를 못 만들어도 던지지 않는다', async () => {
    const engine = createAudioEngine({
      createContext: () => { throw new Error('자동재생 차단'); },
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    });
    expect(await engine.unlock()).toBe(false);
    expect(await engine.play('SFX-UI-SELECT')).toBeNull();
    expect(engine.state().ready).toBe(false);
  });

  it('카탈로그에 없는 ID는 조용히 무시한다', async () => {
    const { engine, requested } = engineWith();
    expect(await engine.play('SFX-없는-소리')).toBeNull();
    expect(requested).toHaveLength(0);
  });
});
