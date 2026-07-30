import { describe, expect, it } from 'vitest';
import {
  EXTRA_CHARACTER,
  FIXED_CHARACTER,
  S0_D3_STORY_SCENES,
  S0_INTERACTIONS,
  validateS0D3Content,
} from '../../src/scenario/s0-d3-content.js';

describe('S0~D3 시나리오 콘텐츠', () => {
  it('S0는 열쇠 선택→대문 열기→숯 점화의 무실패 3단계다', () => {
    expect(S0_INTERACTIONS.map((step) => step.interactionId)).toEqual([
      'S0-KEY-SELECT',
      'S0-GATE-OPEN',
      'S0-CHARCOAL-IGNITE',
    ]);
    expect(S0_INTERACTIONS).toHaveLength(3);
  });

  it('모든 scene·state·dialogue ID와 3줄 요약이 검증된다', () => {
    expect(validateS0D3Content()).toEqual([]);
    expect(new Set(S0_D3_STORY_SCENES.map((scene) => scene.dayId))).toEqual(new Set(['S0', 'D1', 'D2', 'D3']));
    for (const scene of S0_D3_STORY_SCENES) {
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
