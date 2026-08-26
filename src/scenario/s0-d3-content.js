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
      { dialogueId: 'DLG-S0-001', speakerId: 'CHAR-AKI', text: '문을 열자 묵은 나무 냄새 사이로 오래전 숯 향이 희미하게 되살아났다.' },
      { dialogueId: 'DLG-S0-002', speakerId: 'CHAR-AKI', text: '할아버지가 쓰던 화로 앞에 서니, 이제야 이곳에 돌아왔다는 실감이 난다.' },
      { dialogueId: 'DLG-S0-003', speakerId: 'CHAR-AKI', text: '잘할 수 있을지는 모르겠다. 그래도 오늘은 도망치지 말자. 내 손으로 다시 불을 켜 보자.' },
    ],
    summary: ['남겨진 열쇠로 오래 닫힌 가게의 문을 열었다.', '희미했던 숯 향과 함께 오래된 기억도 다시 살아났다.', '두렵지만, 오늘 하루만큼은 내 손으로 이 가게를 지켜 보기로 했다.'],
  }),
  scene({
    sceneId: 'SCN-D1-PREOPEN',
    dayId: 'D1',
    timing: 'pre-open',
    sourceMasterId: 'CM-PROLOGUE-INHERITANCE-R1',
    lines: [
      { dialogueId: 'DLG-D1-PRE-001', speakerId: 'CHAR-AKI', text: '간판에 불을 켰다. 불이 들어온 가게를 한참 바라봤다. 이제 정말 시작이구나.' },
      { dialogueId: 'DLG-D1-PRE-002', speakerId: 'CHAR-TSUKIOKA', text: '불이 켜졌군. 기다린 보람이 있어. 네기마 둘하고 생맥주 하나 주겠나.' },
      { dialogueId: 'DLG-D1-PRE-003', speakerId: 'CHAR-AKI', text: '네, 정성껏 준비하겠습니다. 오늘의 첫 손님이니까요.' },
    ],
    summary: ['간판에 불을 밝히자 츠키오카 씨가 첫 손님으로 들어왔다.', '네기마 둘과 생맥주 한 잔. 다시 연 가게의 첫 주문이었다.', '서툴러도 서두르지 말자. 한 가지씩 정성을 다해 내어 보자.'],
  }),
  scene({
    sceneId: 'SCN-D1-POST',
    dayId: 'D1',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D1-POST-001', speakerId: 'CHAR-TSUKIOKA', text: '나쁘지 않았어. 첫날부터 익숙한 사람은 없지. 불을 꺼뜨리지 않은 것만으로도 충분하네.' },
      { dialogueId: 'DLG-D1-POST-002', speakerId: 'CHAR-AKI', text: '문을 닫고 나니 다리가 풀리네요. 그래도 내일 쓸 숯은 조금 남겨 두고 싶습니다.' },
      { dialogueId: 'DLG-D1-POST-003', speakerId: 'CHAR-TSUKIOKA', text: '그 마음이면 됐어. 내일도 불이 보이면 다시 들르지.' },
    ],
    summary: ['어설펐지만 첫날의 마지막 손님까지 무사히 배웅했다.', '낡은 조리 노트에서 모모를 굽던 할아버지의 손길을 찾았다.', '내일은 오늘보다 조금 덜 떨리는 손으로 불 앞에 서 보고 싶다.'],
  }),
  scene({
    sceneId: 'SCN-D2-PREOPEN',
    dayId: 'D2',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D2-PRE-001', speakerId: 'CHAR-AKI', text: '어제보다 손끝이 덜 떨린다. 오늘은 노트에 남은 모모도 천천히 준비해 보자.' },
      { dialogueId: 'DLG-D2-PRE-002', speakerId: 'CHAR-TSUKIOKA', text: '어제 그 자리 비었나? 오늘은 천천히 먹고 가겠네.' },
      { dialogueId: 'DLG-D2-PRE-003', speakerId: 'EXTRA-COMMUTER', text: '불빛이 보여서 들어왔어요. 혼자 한 잔 괜찮죠?' },
    ],
    summary: ['어제 앉았던 자리를 기억한 손님이 다시 문을 열고 들어왔다.', '골목의 불빛을 따라 낯선 손님도 조용히 자리를 잡았다.', '어제 배운 손맛을 믿고, 오늘은 내 눈으로 가게를 살펴보자.'],
  }),
  scene({
    sceneId: 'SCN-D2-POST',
    dayId: 'D2',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D2-POST-001', speakerId: 'EXTRA-SOLO', text: '조용해서 좋네요. 다음에도 퇴근길에 들를게요.' },
      { dialogueId: 'DLG-D2-POST-002', speakerId: 'CHAR-AKI', text: '어제는 하루만 버텨 보자고 했는데, 오늘은 문을 닫는 시간이 조금 아쉽다.' },
    ],
    summary: ['노트에서 찾아낸 모모를 처음으로 손님상에 올렸다.', '이름도 묻지 못한 손님이 다음에 또 오겠다는 말을 남겼다.', '왜 이 가게 문을 다시 열었는지, 조금은 알 것 같았다.'],
  }),
  scene({
    sceneId: 'SCN-D3-PREOPEN',
    dayId: 'D3',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D3-PRE-001', speakerId: 'CHAR-AKI', text: '노트 가장자리에 밴 타레 자국에서 달고 깊은 냄새가 난다. 오늘은 이 맛도 되살려 보자.' },
      { dialogueId: 'DLG-D3-PRE-002', speakerId: 'EXTRA-OFFICE-PAIR', text: '소금 하나, 타레 하나요. 생맥주도 같이 부탁해요.' },
      { dialogueId: 'DLG-D3-PRE-003', speakerId: 'CHAR-AKI', text: '한쪽에 마음을 빼앗기면 다른 쪽을 놓치기 쉽다. 오늘은 불과 잔을 함께 살피자.' },
    ],
    summary: ['할아버지의 노트에 밴 타레 향을 따라 새로운 맛을 준비했다.', '손님이 늘어난 만큼 화로와 맥주 사이를 오가는 발걸음도 바빠졌다.', '조급해하지 말자. 눈앞의 한 사람에게 따뜻한 한 상을 내면 된다.'],
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
    summary: ['달큰한 타레 냄새가 가게 안에 오래 남았다.', '누군가에게 이곳을 소개하고 싶다는 손님도 생겼다.', '아직 서툴지만, 내일도 돌아올 자리를 정성껏 남겨 두고 싶다.'],
  }),
  scene({
    sceneId: 'SCN-D4-PREOPEN',
    dayId: 'D4',
    timing: 'pre-open',
    sourceMasterId: 'CM-PREOPEN-PLANNING-R1',
    lines: [
      { dialogueId: 'DLG-D4-PRE-001', speakerId: 'CHAR-AKI', text: '어젯밤 손님이 가게를 소개하고 싶다고 했다. 오늘은 기다리는 동안 먼저 내어 드릴 양배추 사라다를 준비해 두자.' },
      { dialogueId: 'DLG-D4-PRE-002', speakerId: 'CHAR-TSUKIOKA', text: '손님이 늘면 불만 보다가 잔을 놓치기 쉽지. 오늘은 하이볼도 한 잔 부탁하겠네.' },
      { dialogueId: 'DLG-D4-PRE-003', speakerId: 'CHAR-AKI', text: '네. 작은 한 접시부터 꼬치와 잔까지, 한 흐름으로 놓치지 않고 내어 보겠습니다.' },
    ],
    summary: ['손님이 기다리는 동안 먼저 내어 줄 양배추 사라다를 준비했다.', '츠키오카 씨의 주문으로 하이볼 제작을 시작한다.', 'D4 목표: 사이드 메뉴·그릴·드링크를 한 흐름으로 운영한다.'],
  }),
  scene({
    sceneId: 'SCN-D4-POST',
    dayId: 'D4',
    timing: 'post-settlement',
    sourceMasterId: 'CM-SETTLEMENT-R1',
    lines: [
      { dialogueId: 'DLG-D4-POST-001', speakerId: 'EXTRA-COMMUTER', text: '사라다 한 접시가 먼저 나오니까 기다리는 시간도 좋았어요. 하이볼도 또 생각날 것 같고요.' },
      { dialogueId: 'DLG-D4-POST-002', speakerId: 'CHAR-AKI', text: '오늘은 가게 전체가 한꺼번에 움직이는 것 같았어요. 바빴지만 어느 자리도 비워 두지 않았네요.' },
      { dialogueId: 'DLG-D4-POST-003', speakerId: 'CHAR-TSUKIOKA', text: '이제 불을 지키는 데서 한 걸음 더 나아갔군. 이 가게만의 리듬이 생기기 시작했어.' },
    ],
    summary: ['양배추 사라다와 하이볼이 처음으로 손님상에 올랐다.', '늘어난 주문 속에서도 세 스테이션을 끝까지 운영했다.', '가게에는 버티는 하루가 아니라 이어 갈 리듬이 생기기 시작했다.'],
  }),
]);

export const D4_EPILOGUE_PAGES = Object.freeze([
  Object.freeze({
    pageId: 'D4-EPILOGUE-01',
    kicker: '후일담 · 문을 닫은 뒤에도',
    title: '가게의 리듬이 남아 있었다',
    visualLine: '빈 접시와 잔을 거둔 뒤에도 오늘 오간 발걸음이 카운터 사이에 남아 있었다.',
    paragraphs: Object.freeze([
      '양배추가 담겼던 접시를 씻고, 레몬 향이 남은 하이볼 잔을 엎어 물기를 뺐다. 화로와 잔 사이를 셀 수 없이 오간 발걸음은 이제 낯선 동선이 아니었다.',
      '가게는 더 이상 불을 꺼뜨리지 않기 위해 버티는 곳만은 아니었다. 기다리는 손님에게 먼저 건넬 한 접시와 다음 주문을 내다보는 작은 리듬이 생겼다.',
    ]),
  }),
  Object.freeze({
    pageId: 'D4-EPILOGUE-02',
    kicker: 'YAKI SEASON · 다음 장을 준비하며',
    title: '노트의 빈칸은 조금 넓어졌다',
    visualLine: '새로 적힌 두 메뉴 옆에는 아직 이름 없는 다음 저녁을 위한 자리가 남아 있었다.',
    paragraphs: Object.freeze([
      '아키는 비법 노트에 양배추 사라다와 하이볼을 적고 그 옆을 비워 두었다. 더 많은 손님과 메뉴가 들어와도 오늘 만든 흐름을 잃지 않기 위해서였다.',
      '불을 낮추고 문을 잠근 뒤, 골목을 한 번 돌아보았다. 내일도 돌아와 같은 자리를 닦고 다시 불을 켤 수 있다는 확신이 처음으로 생겼다.',
    ]),
    releaseNote: 'YAKI SEASON의 다음 이야기는 차후 공개됩니다.',
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
