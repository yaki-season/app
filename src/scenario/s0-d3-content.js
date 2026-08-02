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
    actionLabel: '남겨진 열쇠 선택',
    resultText: '차가운 황동 열쇠를 집었습니다.',
  }),
  Object.freeze({
    interactionId: 'S0-GATE-OPEN',
    stateId: 'S0-STATE-GATE',
    screenId: 'SCR-STORY-PROLOGUE',
    phaseId: 'gate-open',
    actionLabel: '가게 대문 열기',
    resultText: '잠금이 풀리고 오래 닫혀 있던 대문이 열렸습니다.',
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

export const S0_D3_STORY_SCENES = Object.freeze([
  scene({
    sceneId: 'SCN-S0-DECISION',
    dayId: 'S0',
    timing: 'post-interaction',
    sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
    lines: [
      { dialogueId: 'DLG-S0-001', speakerId: 'CHAR-AKI', text: '화로에 다시 불이 들었다. 숯 냄새가 먼저 기억을 깨우네.' },
      { dialogueId: 'DLG-S0-002', speakerId: 'CHAR-AKI', text: '메뉴는 네기마 하나. 손님이 오면 그때 생각하자.' },
      { dialogueId: 'DLG-S0-003', speakerId: 'CHAR-AKI', text: '하루만. 오늘 저녁만 문을 열어 보자.' },
    ],
    summary: ['할아버지의 열쇠로 가게를 다시 열었다.', '화로의 숯불이 다시 붙었다.', 'D1 목표: 네기마와 생맥주로 첫 손님을 맞는다.'],
  }),
  scene({
    sceneId: 'SCN-D1-PREOPEN',
    dayId: 'D1',
    timing: 'pre-open',
    sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
    lines: [
      { dialogueId: 'DLG-D1-PRE-001', speakerId: 'CHAR-AKI', text: '간판 불은 켰다. 이제 손님이 오기만 하면 된다.' },
      { dialogueId: 'DLG-D1-PRE-002', speakerId: 'CHAR-TSUKIOKA', text: '불이 켜졌군. 네기마 둘하고 생맥주 하나 부탁하지.' },
      { dialogueId: 'DLG-D1-PRE-003', speakerId: 'CHAR-AKI', text: '네. 하나씩 확인하면서 내겠습니다.' },
    ],
    summary: ['첫 손님 츠키오카 세이지가 찾아왔다.', '생맥주 부분 제공과 네기마 2개 조리를 배운다.', 'D1 목표: 첫 주문을 끝까지 안전하게 완성한다.'],
  }),
  scene({
    sceneId: 'SCN-D1-POST',
    dayId: 'D1',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D1-POST-001', speakerId: 'CHAR-TSUKIOKA', text: '처음부터 익숙한 사람은 없지. 불을 꺼뜨리지 않은 걸로 충분해.' },
      { dialogueId: 'DLG-D1-POST-002', speakerId: 'CHAR-AKI', text: '내일도 열 수 있을지는 모르겠지만, 숯은 남겨 둘게요.' },
      { dialogueId: 'DLG-D1-POST-003', speakerId: 'CHAR-TSUKIOKA', text: '그럼 내일도 불이 켜져 있으면 들르지.' },
    ],
    summary: ['첫 영업과 정산을 마쳤다.', '모모 페이지의 일부가 읽히기 시작했다.', 'D2 목표: 도움 없이 기본 조리 흐름을 반복한다.'],
  }),
  scene({
    sceneId: 'SCN-D2-PREOPEN',
    dayId: 'D2',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D2-PRE-001', speakerId: 'CHAR-AKI', text: '어제보다 손이 덜 떨린다. 오늘은 모모도 준비해 보자.' },
      { dialogueId: 'DLG-D2-PRE-002', speakerId: 'CHAR-TSUKIOKA', text: '어제 그 자리 비었나? 오늘은 천천히 먹고 가겠네.' },
      { dialogueId: 'DLG-D2-PRE-003', speakerId: 'EXTRA-COMMUTER', text: '불빛이 보여서 들어왔어요. 혼자 한 잔 괜찮죠?' },
    ],
    summary: ['D2에 모모와 재방문 손님이 들어온다.', '기본 조리 안내가 줄어든다.', 'D2 목표: 주문과 준비 목록을 스스로 확인한다.'],
  }),
  scene({
    sceneId: 'SCN-D2-POST',
    dayId: 'D2',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D2-POST-001', speakerId: 'EXTRA-SOLO', text: '조용해서 좋네요. 다음에도 퇴근길에 들를게요.' },
      { dialogueId: 'DLG-D2-POST-002', speakerId: 'CHAR-AKI', text: '두 번째 날이 더 길게 느껴질 줄 알았는데, 벌써 마감이네.' },
    ],
    summary: ['모모 첫 판매와 기본 조리를 마쳤다.', '이름 없는 손님이 재방문 의사를 남겼다.', 'D3 목표: 타레 마감과 화면 밖 위험을 익힌다.'],
  }),
  scene({
    sceneId: 'SCN-D3-PREOPEN',
    dayId: 'D3',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D3-PRE-001', speakerId: 'CHAR-AKI', text: '노트 가장자리에 타레 자국이 남아 있다. 오늘은 붓을 써 보자.' },
      { dialogueId: 'DLG-D3-PRE-002', speakerId: 'EXTRA-OFFICE-PAIR', text: '소금 하나, 타레 하나요. 생맥주도 같이 부탁해요.' },
      { dialogueId: 'DLG-D3-PRE-003', speakerId: 'CHAR-AKI', text: '화면을 옮겨도 그릴과 잔 상태를 놓치지 말자.' },
    ],
    summary: ['D3에 타레 주문과 붓 마감이 열린다.', '그릴과 생맥주가 동시에 진행된다.', 'D3 목표: 화면 밖 위험을 확인하며 주문을 완성한다.'],
  }),
  scene({
    sceneId: 'SCN-D3-POST',
    dayId: 'D3',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D3-POST-001', speakerId: 'EXTRA-COMMUTER', text: '다른 사람한테도 이 가게 얘기해도 될까요?' },
      { dialogueId: 'DLG-D3-POST-002', speakerId: 'CHAR-AKI', text: '아직 서툴지만, 다시 찾을 자리는 남겨 두고 싶어요.' },
      { dialogueId: 'DLG-D3-POST-003', speakerId: 'CHAR-TSUKIOKA', text: '가게는 소문보다 불이 오래 켜져 있는 게 먼저지.' },
    ],
    summary: ['타레와 교차 작업을 안전하게 마쳤다.', '가게를 소개해도 되는지 묻는 손님이 생겼다.', '다음 목표: D4의 즉시 제공 메뉴를 준비한다.'],
  }),
]);

export function validateS0D3Content() {
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
  for (const storyScene of S0_D3_STORY_SCENES) {
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
