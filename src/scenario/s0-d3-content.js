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
      { dialogueId: 'DLG-S0-001', speakerId: 'CHAR-AKI', text: '짐만 정리하고 돌아가려고 했는데… 이 문 앞에 서니까 발이 안 떨어지네.' },
      { dialogueId: 'DLG-S0-002', speakerId: 'CHAR-AKI', text: '노트 모서리까지 까맣다. 할아버지는 숯 묻은 손으로도 꼭 뭘 적으셨지.' },
      { dialogueId: 'DLG-S0-003', speakerId: 'CHAR-AKI', text: '딱 하루만 열어 보자. 식탁부터 닦고, 화로에 불을 넣는 거야.' },
    ],
    summary: ['남겨진 열쇠로 오래 닫힌 가게 문을 열었다.', '가게 안에는 화로와 집기가 그대로 남아 있었다.', '아키는 가게를 다시 열기로 했다.'],
  }),
  scene({
    sceneId: 'SCN-D1-PREOPEN',
    dayId: 'D1',
    timing: 'pre-open',
    sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
    lines: [
      { dialogueId: 'DLG-D1-PRE-001', speakerId: 'CHAR-AKI', text: '닭도 썰었고, 잔도 닦았고… 간판을 켜니 정말 가게가 됐네.' },
      { dialogueId: 'DLG-D1-PRE-002', speakerId: 'CHAR-AKI', text: '노트는 불에서 조금 떨어뜨려 놓자. 또 숯이 묻겠네.' },
      { dialogueId: 'DLG-D1-PRE-003', speakerId: 'CHAR-AKI', text: '어서 오세요. 자리는 편한 곳에 앉으시면 돼요.' },
    ],
    summary: ['청소와 재료 준비를 마치고 간판에 불을 켰다.', '아키는 노트를 불에서 떨어뜨려 놓았다.', '문 앞의 손님을 맞았다. 첫 주문과 손님 이야기는 실제 영업에서 나눈다.'],
  }),
  scene({
    sceneId: 'SCN-D1-POST',
    dayId: 'D1',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D1-POST-001', speakerId: 'CHAR-AKI', text: '문을 닫으니까 다리가 풀리네. 빈 가게가 아까와는 다르게 조용해.' },
      { dialogueId: 'DLG-D1-POST-002', speakerId: 'CHAR-AKI', text: '다음 장은 모모구나. 닭다리살만 다섯 조각… 옆에 작은 메모도 있어.' },
      { dialogueId: 'DLG-D1-POST-003', speakerId: 'CHAR-AKI', text: '하루만 열려고 했는데. 내일 쓸 닭은 조금 더 사 둬야겠다.' },
    ],
    summary: ['첫날 영업을 마치고 모든 손님을 배웅했다.', '비법 노트에서 모모 조립법을 찾았다.', '다음 영업부터 모모 메뉴를 추가한다.'],
  }),
  scene({
    sceneId: 'SCN-D2-PREOPEN',
    dayId: 'D2',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D2-PRE-001', speakerId: 'CHAR-AKI', text: '닭다리살만 꽂으니 모모는 제법 묵직하네. 오늘 메뉴판에 한 줄 더 써 두자.' },
      { dialogueId: 'DLG-D2-PRE-002', speakerId: 'CHAR-AKI', text: '어제 놓았던 잔 자리네. 행주로 닦아도 동그란 자국이 조금 남았어.' },
      { dialogueId: 'DLG-D2-PRE-003', speakerId: 'EXTRA-COMMUTER', text: '저, 한 명인데요. 퇴근길에 냄새를 따라 들어왔어요.' },
    ],
    summary: ['아키는 노트를 보고 닭다리살 꼬치 모모를 준비했다.', '카운터의 잔 자국을 닦으며 둘째 날을 준비했다.', '퇴근길의 새 손님도 가게 안을 기웃거린다.'],
  }),
  scene({
    sceneId: 'SCN-D2-POST',
    dayId: 'D2',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D2-POST-001', speakerId: 'CHAR-AKI', text: '손님이 떠난 자리에 잔 자국이 남았네. 오늘은 이 의자에도 사람이 앉았구나.' },
      { dialogueId: 'DLG-D2-POST-002', speakerId: 'CHAR-AKI', text: '노트의 끈적한 페이지가 타레 배합이었어. 내일은 이 냄새도 돌려놓아 보자.' },
    ],
    summary: ['둘째 날의 영업을 마치고 카운터를 닦았다.', '노트에서 타레 배합이 적힌 페이지를 찾았다.', '아키는 내일 쓸 소스를 준비하기로 했다.'],
  }),
  scene({
    sceneId: 'SCN-D3-PREOPEN',
    dayId: 'D3',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D3-PRE-001', speakerId: 'CHAR-AKI', text: '간장에 단맛이 올라오니까 기억나네. 할아버지 앞치마에서도 이 냄새가 났지.' },
      { dialogueId: 'DLG-D3-PRE-002', speakerId: 'EXTRA-OFFICE-PAIR', text: '오늘은 타레도 되네요? 저희는 같은 걸 시키면 꼭 서로 바꿔 먹어서요.' },
      { dialogueId: 'DLG-D3-PRE-003', speakerId: 'CHAR-AKI', text: '그럼 소금과 타레를 나눠 드셔 보세요. 잔도 두 개 꺼내 둘게요.' },
    ],
    summary: ['아키가 노트의 배합으로 타레를 준비했다.', '소스 냄새가 할아버지의 앞치마를 떠올리게 했다.', '함께 온 손님들이 소금과 타레를 나눠 맛보려 한다.'],
  }),
  scene({
    sceneId: 'SCN-D3-POST',
    dayId: 'D3',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D3-POST-001', speakerId: 'EXTRA-COMMUTER', text: '이 가게, 친구한테 알려 줘도 돼요? 퇴근하고 같이 앉을 데를 찾고 있거든요.' },
      { dialogueId: 'DLG-D3-POST-002', speakerId: 'CHAR-AKI', text: '그럼요. 두 분 오시면 잔부터 꺼내 놓을게요.' },
      { dialogueId: 'DLG-D3-POST-003', speakerId: 'CHAR-AKI', text: '누군가 여길 같이 오고 싶은 곳으로 생각했구나.' },
    ],
    summary: ['타레 메뉴를 포함한 셋째 날 영업을 마쳤다.', '한 손님이 지인들에게 가게를 소개하고 싶다고 했다.', '다음 영업부터 양배추 사라다와 하이볼을 준비한다.'],
  }),
  scene({
    sceneId: 'SCN-D4-PREOPEN',
    dayId: 'D4',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D4-PRE-001', speakerId: 'CHAR-AKI', text: '양배추에 깨를 조금. 불 앞에서 기다릴 때 아삭한 것부터 드시면 좋겠어.' },
      { dialogueId: 'DLG-D4-PRE-002', speakerId: 'CHAR-AKI', text: '얼음은 충분하고, 긴 잔은 여기. 하이볼 자리도 비워 뒀다.' },
      { dialogueId: 'DLG-D4-PRE-003', speakerId: 'CHAR-AKI', text: '레몬을 자르니 손에 향이 남네. 오늘은 잔에서도 이 냄새가 나겠지.' },
    ],
    summary: ['손님이 기다리는 동안 무료 양배추 사라다를 먼저 낸다.', '하이볼 주문이 새로 추가된다.', '사이드 메뉴·그릴·드링크를 함께 운영한다.'],
  }),
  scene({
    sceneId: 'SCN-D4-POST',
    dayId: 'D4',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D4-POST-001', speakerId: 'CHAR-AKI', text: '마지막 얼음도 녹았네. 오늘은 집게보다 잔을 더 많이 잡은 기분이야.' },
      { dialogueId: 'DLG-D4-POST-002', speakerId: 'CHAR-AKI', text: '사라다 접시는 여기, 긴 잔은 이쪽. 내일은 손이 덜 헤매게 해 두자.' },
      { dialogueId: 'DLG-D4-POST-003', speakerId: 'CHAR-AKI', text: '노트에 접힌 귀퉁이가 또 있네. 토리카와… 할아버지는 이걸 마지막에 드셨지.' },
    ],
    summary: ['사라다와 하이볼을 준비했던 넷째 날이 저물었다.', '아키는 내일을 위해 접시와 잔의 자리를 정리했다.', '노트의 다음 접힌 페이지에는 토리카와가 적혀 있었다.'],
  }),
]);

export const D6_PREOPEN_SCENE = Object.freeze({
  sceneId: 'SCN-D6-PREOPEN', dayId: 'D6', timing: 'pre-open', screenId: 'SCR-STORY-BEAT',
  lines: [
    { dialogueId: 'DLG-D6-PRE-001', speakerId: 'CHAR-AKI', text: '오늘은 메뉴를 더 늘리지 말자. 잔하고 접시부터 손 닿는 곳에.' },
    { dialogueId: 'DLG-D6-PRE-002', speakerId: 'CHAR-AKI', text: '의자도 여섯 개 다 닦았다. 안쪽 자리까지 불빛이 닿네.' },
    { dialogueId: 'DLG-D6-PRE-003', speakerId: 'CHAR-AKI', text: '누가 먼저 올까. 문을 열고 기다려 보자.' },
  ],
  skipSummary: ['새 메뉴 대신 익숙한 조리대로 여섯째 날을 준비한다.', '아키는 잔과 접시를 채우고 여섯 의자를 꺼내 놓았다.'],
});

export const D4_EPILOGUE_PAGES = Object.freeze([
  Object.freeze({
    pageId: 'D4-EPILOGUE-01',
    illustrationAssetId: 'IL-D4-EPILOGUE-CLEANUP-PIXEL',
    kicker: '영업을 마치고',
    title: '넷째 날 정리를 마쳤다',
    visualLine: '아키는 사라다 접시와 하이볼 잔을 씻어 제자리에 놓았다.',
    paragraphs: Object.freeze([
      '마지막 손님이 나간 뒤에도 레몬 향은 손끝에 남았다. 아키는 접시를 씻고, 젖은 행주로 카운터의 둥근 잔 자국을 지웠다.',
      '오늘 손이 꼬였던 순간들을 노트 여백에 적었다. 정답을 베껴 쓰던 페이지 옆에 처음으로 자기 글씨가 늘어났다.',
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
    releaseNote: '내일의 한 줄 · 닭껍질은 노릇해진 뒤 금방 탄다. 오래 눈을 떼지 말 것.',
  }),
]);

export const D5_EPILOGUE_PAGES = Object.freeze([
  Object.freeze({
    pageId: 'D5-EPILOGUE-01',
    kicker: '다섯째 날, 문을 닫고',
    title: '노트의 빈 여백',
    visualLine: '불을 낮춘 화로 곁에서 아키는 오늘 날짜를 적었다.',
    paragraphs: Object.freeze([
      '처음에는 짐을 정리하러 왔다. 하루만 열어 보자던 가게에서 어느새 닷새를 보냈다. 닦아 놓은 잔들 위로 골목의 불빛이 비쳤다.',
      '할아버지의 빽빽한 글씨 옆에 아키는 오늘 배운 것들을 적었다. 잘된 것도, 다시 해 보고 싶은 것도. 이 페이지는 이제 두 사람의 노트가 되었다.',
      '문을 잠그기 전, 의자를 한 번 더 가지런히 밀어 넣었다. 다음에 돌아올 사람이 편히 앉을 수 있도록.',
    ]),
    releaseNote: '닷새의 기록을 남겼습니다. 다음 날도 같은 가게에서 이어집니다.',
  }),
]);

export const D6_EPILOGUE_PAGES = Object.freeze([
  Object.freeze({
    pageId: 'D6-EPILOGUE-01', kicker: '여섯째 날, 문을 닫고', title: '사장님이라는 말',
    visualLine: '아키는 마지막 의자를 밀어 넣고 카운터에 잠시 손을 짚었다.',
    paragraphs: Object.freeze([
      '잔 부딪히는 소리 사이로 들었던 호칭이, 조용해진 가게에서 다시 떠올랐다. 사장님. 돌아볼 다른 사람은 없었다.',
      '노트에 내일 준비할 것을 적었다. 잔, 접시, 그리고 손님이 일어난 자리. 할아버지의 조리법 옆에 가게를 돌리는 자기 순서가 생겼다.',
    ]),
    releaseNote: '여섯째 날의 영업 기록을 저장했습니다. 현재 준비된 이야기는 여기까지입니다.',
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
  for (const storyScene of [...S0_D4_STORY_SCENES, D6_PREOPEN_SCENE]) {
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
