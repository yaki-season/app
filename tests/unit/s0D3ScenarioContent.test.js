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
      text: '문을 열었더니 안에 숯 냄새가 아직 남아 있네.',
    });
    expect(prologue.skipSummary).toContain('아키는 가게를 다시 열기로 했다.');
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
    expect(orderLine.text).toBe('불이 켜졌네. 네기마 둘하고 생맥주 하나 주겠나.');
  });

  it('D3와 D4 대사는 안정 ID와 화자를 유지하며 영업 정보를 명료하게 전달한다', () => {
    const scenes = Object.fromEntries(
      S0_D4_STORY_SCENES.map((storyScene) => [storyScene.sceneId, storyScene]),
    );

    expect(scenes['SCN-D3-PREOPEN']).toMatchObject({
      lines: [
        { dialogueId: 'DLG-D3-PRE-001', speakerId: 'CHAR-AKI', text: '노트에 타레 배합이 적혀 있네. 오늘은 이대로 한번 만들어 보자.' },
        { dialogueId: 'DLG-D3-PRE-002', speakerId: 'EXTRA-OFFICE-PAIR', text: '소금 하나랑 타레 하나 주세요. 생맥주도 같이 부탁해요.' },
        { dialogueId: 'DLG-D3-PRE-003', speakerId: 'CHAR-AKI', text: '꼬치 굽는 동안 맥주 주문도 놓치지 말자.' },
      ],
      skipSummary: [
        '노트에 적힌 타레 조리법을 처음 사용했다.',
        '꼬치와 생맥주 주문을 함께 처리해야 했다.',
        'D3에서는 조립대 타레 붓질과 동시 주문 처리를 익힌다.',
      ],
    });
    expect(scenes['SCN-D3-POST']).toMatchObject({
      lines: [
        { dialogueId: 'DLG-D3-POST-001', speakerId: 'EXTRA-COMMUTER', text: '여기 괜찮던데, 친구들한테 소개해도 되죠?' },
        { dialogueId: 'DLG-D3-POST-002', speakerId: 'CHAR-AKI', text: '그럼요. 아직 부족하지만 다음에는 더 잘해 볼게요.' },
        { dialogueId: 'DLG-D3-POST-003', speakerId: 'CHAR-TSUKIOKA', text: '손님이 다시 오고 싶다고 하면 잘한 거지. 내일도 문 열게나.' },
      ],
      skipSummary: [
        '타레 메뉴를 포함한 셋째 날 영업을 마쳤다.',
        '한 손님이 지인들에게 가게를 소개하고 싶다고 했다.',
        '다음 영업부터 양배추 사라다와 하이볼을 준비한다.',
      ],
    });
    expect(scenes['SCN-D4-PREOPEN']).toMatchObject({
      lines: [
        { dialogueId: 'DLG-D4-PRE-001', speakerId: 'CHAR-AKI', text: '손님이 늘고 있으니 기다리는 동안 먼저 낼 사라다를 준비해 두자.' },
        { dialogueId: 'DLG-D4-PRE-002', speakerId: 'CHAR-TSUKIOKA', text: '오늘은 하이볼로 하지. 꼬치 굽다가 음료 주문 놓치지 말고.' },
        { dialogueId: 'DLG-D4-PRE-003', speakerId: 'CHAR-AKI', text: '네. 사라다부터 내고, 꼬치와 음료도 순서대로 챙길게요.' },
      ],
      skipSummary: [
        '손님이 기다리는 동안 무료 양배추 사라다를 먼저 낸다.',
        '하이볼 주문이 새로 추가된다.',
        '사이드 메뉴·그릴·드링크를 함께 운영한다.',
      ],
    });
    expect(scenes['SCN-D4-POST']).toMatchObject({
      lines: [
        { dialogueId: 'DLG-D4-POST-001', speakerId: 'EXTRA-COMMUTER', text: '사라다가 먼저 나오니까 좋네요. 하이볼도 맛있었어요.' },
        { dialogueId: 'DLG-D4-POST-002', speakerId: 'CHAR-AKI', text: '오늘은 계속 바빴네요. 그래도 주문은 다 챙겼어요.' },
        { dialogueId: 'DLG-D4-POST-003', speakerId: 'CHAR-TSUKIOKA', text: '메뉴가 늘었는데도 잘 해냈군. 이 정도면 계속해 볼 만하겠어.' },
      ],
      skipSummary: [
        '양배추 사라다와 하이볼을 처음 제공했다.',
        '사이드 메뉴·그릴·드링크 주문을 모두 처리했다.',
        '다음 영업을 위해 토리카와를 준비한다.',
      ],
    });
  });

  it('D4 후일담은 자연스러운 문장으로 D5 토리카와 영업을 연다', () => {
    expect(D4_EPILOGUE_PAGES).toEqual([
      {
        pageId: 'D4-EPILOGUE-01',
        illustrationAssetId: 'IL-D4-EPILOGUE-CLEANUP-PIXEL',
        kicker: '영업을 마치고',
        title: '넷째 날 정리를 마쳤다',
        visualLine: '아키는 사라다 접시와 하이볼 잔을 씻어 제자리에 놓았다.',
        paragraphs: [
          '마지막 손님이 나간 뒤 아키는 접시와 잔을 씻고 조리대를 닦았다. 오늘은 사라다, 꼬치, 음료 주문이 계속 겹쳤지만 끝까지 모두 내보냈다.',
          '처음에는 정신이 없었지만 몇 번 오가다 보니 일하는 순서가 보였다. 내일도 같은 방식으로 준비하면 될 것 같았다.',
        ],
      },
      {
        pageId: 'D4-EPILOGUE-02',
        illustrationAssetId: 'IL-D4-EPILOGUE-TORIKAWA-PIXEL',
        kicker: '다섯째 날 준비',
        title: '토리카와를 메뉴에 추가했다',
        visualLine: '아키는 비법 노트에 토리카와 조립 순서와 굽는 법을 적었다.',
        paragraphs: [
          '접은 닭껍질 다섯 조각을 꼬치에 끼우는 순서를 정리했다. 소금과 타레 주문을 구분해 굽는 방법도 함께 적었다.',
          '재료와 도구를 준비한 뒤 가게 문을 잠갔다. 내일은 토리카와를 처음 손님에게 내볼 생각이었다.',
        ],
        releaseNote: 'D5에서 토리카와 메뉴가 추가됩니다.',
      },
    ]);
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
