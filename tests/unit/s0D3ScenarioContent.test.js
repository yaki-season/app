import { describe, expect, it } from 'vitest';
import {
  D4_EPILOGUE_PAGES,
  EXTRA_CHARACTER,
  FIXED_CHARACTER,
  S0_D4_STORY_SCENES,
  S0_INTERACTIONS,
  validateS0D4Content,
} from '../../src/scenario/s0-d3-content.js';

describe('S0~D4 시나리오 콘텐츠', () => {
  it('S0는 열쇠를 집고 문을 연 뒤 아키의 결심으로 이어진다', () => {
    expect(S0_INTERACTIONS.map((step) => step.interactionId)).toEqual([
      'S0-KEY-SELECT',
      'S0-GATE-OPEN',
    ]);
    expect(S0_INTERACTIONS).toHaveLength(2);
    const prologue = S0_D4_STORY_SCENES.find(({ sceneId }) => sceneId === 'SCN-S0-DECISION');
    expect(prologue.lines[0]).toMatchObject({
      dialogueId: 'DLG-S0-001',
      text: expect.stringContaining('오래전 숯 향'),
    });
    expect(prologue.skipSummary).toContain('두렵지만, 오늘 하루만큼은 내 손으로 이 가게를 지켜 보기로 했다.');
  });

  it('모든 scene·state·dialogue ID와 3줄 요약이 검증된다', () => {
    expect(validateS0D4Content()).toEqual([]);
    expect(new Set(S0_D4_STORY_SCENES.map((scene) => scene.dayId))).toEqual(new Set(['S0', 'D1', 'D2', 'D3', 'D4']));
    for (const scene of S0_D4_STORY_SCENES) {
      expect(scene.skipSummary.length).toBeLessThanOrEqual(3);
      expect(scene.lines.every((line) => line.dialogueId.startsWith('DLG-'))).toBe(true);
    }
  });

  it('고정 인물은 아사노 아키와 츠키오카 세이지뿐이다', () => {
    expect(Object.values(FIXED_CHARACTER).map((character) => character.displayName)).toEqual([
      '아사노 아키',
      '츠키오카 세이지',
    ]);
    expect(Object.values(EXTRA_CHARACTER).every((character) => character.anonymous)).toBe(true);
  });

  it('D1 첫 주문 대사는 네기마 2개 계약을 말한다', () => {
    const preopen = S0_D4_STORY_SCENES.find(({ sceneId }) => sceneId === 'SCN-D1-PREOPEN');
    const orderLine = preopen.lines.find(({ dialogueId }) => dialogueId === 'DLG-D1-PRE-002');
    expect(orderLine.text).toBe('불이 켜졌군. 기다린 보람이 있어. 네기마 둘하고 생맥주 하나 주겠나.');
  });

  it('D4 종착 후일담은 두 장의 산문과 차후 공개 문구로 닫힌다', () => {
    expect(D4_EPILOGUE_PAGES).toHaveLength(2);
    expect(new Set(D4_EPILOGUE_PAGES.map(({ pageId }) => pageId)).size).toBe(2);
    expect(D4_EPILOGUE_PAGES.every(({ paragraphs }) => paragraphs.length === 2)).toBe(true);
    expect(D4_EPILOGUE_PAGES.at(-1).releaseNote).toContain('차후 공개');
  });

  it('정식 인물 설정을 안정 ID에 연결한다', () => {
    expect(FIXED_CHARACTER.AKI).toMatchObject({
      id: 'CHAR-AKI',
      japaneseName: '浅野 秋',
      age: 29,
    });
    expect(FIXED_CHARACTER.TSUKIOKA).toMatchObject({
      id: 'CHAR-TSUKIOKA',
      japaneseName: '月岡 誠司',
      age: 68,
      description: '퇴직한 시내버스 기사',
    });
  });
});
