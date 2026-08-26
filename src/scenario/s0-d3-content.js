export const FIXED_CHARACTER = Object.freeze({
  AKI: Object.freeze({
    id: 'CHAR-AKI',
    displayName: '아사노 아키',
    japaneseName: '浅野 秋',
    age: 29,
    description: '짧은 흑갈색 머리, 피곤한 눈매, 마른 체형, 걷어 올린 셔츠와 짙은 남색 앞치마',
  }),
  TSUKIOKA: Object.freeze({
    id: 'CHAR-TSUKIOKA',
    displayName: '츠키오카 세이지',
    japaneseName: '月岡 誠司',
    age: 68,
    description: '퇴직한 시내버스 기사',
  }),
});

export const EXTRA_CHARACTER = Object.freeze({
  COMMUTER: Object.freeze({ id: 'EXTRA-COMMUTER', displayName: '퇴근길 손님', anonymous: true }),
  SOLO: Object.freeze({ id: 'EXTRA-SOLO', displayName: '혼술 손님', anonymous: true }),
  OFFICE_PAIR: Object.freeze({ id: 'EXTRA-OFFICE-PAIR', displayName: '직장인 손님 둘', anonymous: true }),
});

export const S0_INTERACTIONS = Object.freeze([
  Object.freeze({
    interactionId: 'S0-KEY-SELECT',
    stateId: 'S0-STATE-KEY',
    screenId: 'SCR-STORY-PROLOGUE',
    phaseId: 'exterior-key',
    actionLabel: '열쇠를 집는다',
    resultText: '손바닥에 차가운 황동의 감촉이 남았다.',
  }),
  Object.freeze({
    interactionId: 'S0-GATE-OPEN',
    stateId: 'S0-STATE-GATE',
    screenId: 'SCR-STORY-PROLOGUE',
    phaseId: 'gate-open',
    actionLabel: '문을 연다',
    resultText: '오래 잠들어 있던 문이 낮은 소리를 내며 열렸다.',
  }),
]);

const scene = ({
  sceneId,
  dayId,
  timing,
  sourceMasterId,
  lines,
  summary,
}) => Object.freeze({
  sceneId,
  dayId,
  timing,
  screenId: 'SCR-STORY-BEAT',
  sourceMasterId,
  lines: Object.freeze(lines.map(Object.freeze)),
  skipSummary: Object.freeze(summary),
});

export const S0_D4_STORY_SCENES = Object.freeze([
  scene({
    sceneId: 'SCN-S0-DECISION',
    dayId: 'S0',
    timing: 'post-interaction',
    sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
    lines: [
      { dialogueId: 'DLG-S0-001', speakerId: 'CHAR-AKI', text: '문을 열었더니 안에 숯 냄새가 아직 남아 있네.' },
      { dialogueId: 'DLG-S0-002', speakerId: 'CHAR-AKI', text: '할아버지가 쓰던 화로도 그대로야.' },
      { dialogueId: 'DLG-S0-003', speakerId: 'CHAR-AKI', text: '겁나지만 일단 불부터 켜 보자.' },
    ],
    summary: ['남겨진 열쇠로 오래 닫힌 가게 문을 열었다.', '가게 안에는 화로와 집기가 그대로 남아 있었다.', '아키는 가게를 다시 열기로 했다.'],
  }),
  scene({
    sceneId: 'SCN-D1-PREOPEN',
    dayId: 'D1',
    timing: 'pre-open',
    sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
    lines: [
      { dialogueId: 'DLG-D1-PRE-001', speakerId: 'CHAR-AKI', text: '간판 불도 켰고, 준비는 끝났다. 이제 손님만 오면 돼.' },
      { dialogueId: 'DLG-D1-PRE-002', speakerId: 'CHAR-TSUKIOKA', text: '불이 켜졌네. 네기마 둘하고 생맥주 하나 주겠나.' },
      { dialogueId: 'DLG-D1-PRE-003', speakerId: 'CHAR-AKI', text: '네. 첫 주문이네요. 바로 준비할게요.' },
    ],
    summary: ['간판에 불을 켜고 첫 영업을 시작했다.', '츠키오카가 네기마 둘과 생맥주 한 잔을 주문했다.', 'D1에서는 기본 조립·굽기·음료 제공을 익힌다.'],
  }),
  scene({
    sceneId: 'SCN-D1-POST',
    dayId: 'D1',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D1-POST-001', speakerId: 'CHAR-TSUKIOKA', text: '첫날치고 괜찮았어. 서두르지만 않으면 돼.' },
      { dialogueId: 'DLG-D1-POST-002', speakerId: 'CHAR-AKI', text: '끝나니까 다리에 힘이 풀리네요. 그래도 내일 준비는 해 둘게요.' },
      { dialogueId: 'DLG-D1-POST-003', speakerId: 'CHAR-TSUKIOKA', text: '그래. 내일 또 들르지.' },
    ],
    summary: ['첫날 영업을 마치고 모든 손님을 배웅했다.', '비법 노트에서 모모 조립법을 찾았다.', '다음 영업부터 모모 메뉴를 추가한다.'],
  }),
  scene({
    sceneId: 'SCN-D2-PREOPEN',
    dayId: 'D2',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D2-PRE-001', speakerId: 'CHAR-AKI', text: '오늘부터 모모도 해 보자. 조립 순서는 노트에 적혀 있어.' },
      { dialogueId: 'DLG-D2-PRE-002', speakerId: 'CHAR-TSUKIOKA', text: '어제 그 자리 비었나? 오늘도 한 잔 하겠네.' },
      { dialogueId: 'DLG-D2-PRE-003', speakerId: 'EXTRA-COMMUTER', text: '불이 켜져 있어서 들어왔어요. 혼자 앉아도 되죠?' },
    ],
    summary: ['D2부터 모모 메뉴를 조립할 수 있다.', '츠키오카가 다시 방문했고 새 손님도 들어왔다.', '두 종류의 꼬치 주문을 함께 처리한다.'],
  }),
  scene({
    sceneId: 'SCN-D2-POST',
    dayId: 'D2',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D2-POST-001', speakerId: 'EXTRA-SOLO', text: '조용해서 좋네요. 다음에도 퇴근길에 들를게요.' },
      { dialogueId: 'DLG-D2-POST-002', speakerId: 'CHAR-AKI', text: '감사합니다. 내일도 이 시간에 열어 둘게요.' },
    ],
    summary: ['모모를 처음 손님에게 제공했다.', '새 손님이 다시 방문하겠다고 말했다.', '다음 영업부터 타레 주문을 추가한다.'],
  }),
  scene({
    sceneId: 'SCN-D3-PREOPEN',
    dayId: 'D3',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D3-PRE-001', speakerId: 'CHAR-AKI', text: '노트에 타레 배합이 적혀 있네. 오늘은 이대로 한번 만들어 보자.' },
      { dialogueId: 'DLG-D3-PRE-002', speakerId: 'EXTRA-OFFICE-PAIR', text: '소금 하나랑 타레 하나 주세요. 생맥주도 같이 부탁해요.' },
      { dialogueId: 'DLG-D3-PRE-003', speakerId: 'CHAR-AKI', text: '꼬치 굽는 동안 맥주 주문도 놓치지 말자.' },
    ],
    summary: ['노트에 적힌 타레 조리법을 처음 사용했다.', '꼬치와 생맥주 주문을 함께 처리해야 했다.', 'D3에서는 조립대 타레 붓질과 동시 주문 처리를 익힌다.'],
  }),
  scene({
    sceneId: 'SCN-D3-POST',
    dayId: 'D3',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D3-POST-001', speakerId: 'EXTRA-COMMUTER', text: '여기 괜찮던데, 친구들한테 소개해도 되죠?' },
      { dialogueId: 'DLG-D3-POST-002', speakerId: 'CHAR-AKI', text: '그럼요. 아직 부족하지만 다음에는 더 잘해 볼게요.' },
      { dialogueId: 'DLG-D3-POST-003', speakerId: 'CHAR-TSUKIOKA', text: '손님이 다시 오고 싶다고 하면 잘한 거지. 내일도 문 열게나.' },
    ],
    summary: ['타레 메뉴를 포함한 셋째 날 영업을 마쳤다.', '한 손님이 지인들에게 가게를 소개하고 싶다고 했다.', '다음 영업부터 양배추 사라다와 하이볼을 준비한다.'],
  }),
  scene({
    sceneId: 'SCN-D4-PREOPEN',
    dayId: 'D4',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D4-PRE-001', speakerId: 'CHAR-AKI', text: '손님이 늘고 있으니 기다리는 동안 먼저 낼 사라다를 준비해 두자.' },
      { dialogueId: 'DLG-D4-PRE-002', speakerId: 'CHAR-TSUKIOKA', text: '오늘은 하이볼로 하지. 꼬치 굽다가 음료 주문 놓치지 말고.' },
      { dialogueId: 'DLG-D4-PRE-003', speakerId: 'CHAR-AKI', text: '네. 사라다부터 내고, 꼬치와 음료도 순서대로 챙길게요.' },
    ],
    summary: ['손님이 기다리는 동안 무료 양배추 사라다를 먼저 낸다.', '하이볼 주문이 새로 추가된다.', '사이드 메뉴·그릴·드링크를 함께 운영한다.'],
  }),
  scene({
    sceneId: 'SCN-D4-POST',
    dayId: 'D4',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D4-POST-001', speakerId: 'EXTRA-COMMUTER', text: '사라다가 먼저 나오니까 좋네요. 하이볼도 맛있었어요.' },
      { dialogueId: 'DLG-D4-POST-002', speakerId: 'CHAR-AKI', text: '오늘은 계속 바빴네요. 그래도 주문은 다 챙겼어요.' },
      { dialogueId: 'DLG-D4-POST-003', speakerId: 'CHAR-TSUKIOKA', text: '메뉴가 늘었는데도 잘 해냈군. 이 정도면 계속해 볼 만하겠어.' },
    ],
    summary: ['양배추 사라다와 하이볼을 처음 제공했다.', '사이드 메뉴·그릴·드링크 주문을 모두 처리했다.', '다음 영업을 위해 토리카와를 준비한다.'],
  }),
]);

export const D4_EPILOGUE_PAGES = Object.freeze([
  Object.freeze({
    pageId: 'D4-EPILOGUE-01',
    illustrationAssetId: 'IL-D4-EPILOGUE-CLEANUP-PIXEL',
    kicker: '영업을 마치고',
    title: '넷째 날 정리를 마쳤다',
    visualLine: '아키는 사라다 접시와 하이볼 잔을 씻어 제자리에 놓았다.',
    paragraphs: Object.freeze([
      '마지막 손님이 나간 뒤 아키는 접시와 잔을 씻고 조리대를 닦았다. 오늘은 사라다, 꼬치, 음료 주문이 계속 겹쳤지만 끝까지 모두 내보냈다.',
      '처음에는 정신이 없었지만 몇 번 오가다 보니 일하는 순서가 보였다. 내일도 같은 방식으로 준비하면 될 것 같았다.',
    ]),
  }),
  Object.freeze({
    pageId: 'D4-EPILOGUE-02',
    illustrationAssetId: 'IL-D4-EPILOGUE-TORIKAWA-PIXEL',
    kicker: '다섯째 날 준비',
    title: '토리카와를 메뉴에 추가했다',
    visualLine: '아키는 비법 노트에 토리카와 조립 순서와 굽는 법을 적었다.',
    paragraphs: Object.freeze([
      '접은 닭껍질 다섯 조각을 꼬치에 끼우는 순서를 정리했다. 소금과 타레 주문을 구분해 굽는 방법도 함께 적었다.',
      '재료와 도구를 준비한 뒤 가게 문을 잠갔다. 내일은 토리카와를 처음 손님에게 내볼 생각이었다.',
    ]),
    releaseNote: 'D5에서 토리카와 메뉴가 추가됩니다.',
  }),
]);

export function validateS0D4Content() {
  const errors = [];
  const ids = new Set();
  const knownSpeakers = new Set([
    ...Object.values(FIXED_CHARACTER).map((character) => character.id),
    ...Object.values(EXTRA_CHARACTER).map((character) => character.id),
  ]);
  for (const interaction of S0_INTERACTIONS) {
    for (const id of [interaction.interactionId, interaction.stateId]) {
      if (ids.has(id)) errors.push(`중복 ID: ${id}`);
      ids.add(id);
    }
  }
  for (const storyScene of S0_D4_STORY_SCENES) {
    if (ids.has(storyScene.sceneId)) errors.push(`중복 ID: ${storyScene.sceneId}`);
    ids.add(storyScene.sceneId);
    if (storyScene.skipSummary.length > 3) errors.push(`${storyScene.sceneId} 요약은 3줄을 넘습니다.`);
    for (const line of storyScene.lines) {
      if (ids.has(line.dialogueId)) errors.push(`중복 ID: ${line.dialogueId}`);
      ids.add(line.dialogueId);
      if (!knownSpeakers.has(line.speakerId)) errors.push(`알 수 없는 speakerId: ${line.speakerId}`);
    }
  }
  return errors;
}

export function speakerById(speakerId) {
  return [...Object.values(FIXED_CHARACTER), ...Object.values(EXTRA_CHARACTER)]
    .find((character) => character.id === speakerId) ?? null;
}
