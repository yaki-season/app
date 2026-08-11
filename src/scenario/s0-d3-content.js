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

export const S0_D3_STORY_SCENES = Object.freeze([
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
]);

// D3 뒤의 저장 node 이름은 기존 세이브 호환성을 위해 d4-preview로 남겨 두지만,
// 공개 화면에서는 아직 만들어지지 않은 D4를 예고하지 않고 사흘간의 영업을 닫는 후일담을 보여 준다.
export const D3_EPILOGUE_PAGES = Object.freeze([
  Object.freeze({
    pageId: 'D3-EPILOGUE-01',
    kicker: '후일담 · 문을 닫은 뒤에도',
    title: '불은 금세 식지 않았다',
    visualLine: '빈 가게에는 오늘 건넨 말과 웃음이 숯불의 잔열처럼 남아 있었다.',
    paragraphs: Object.freeze([
      '마지막 잔을 엎어 물기를 빼고, 타레가 묻은 붓을 천천히 씻었다. 문을 잠근 뒤에도 손끝에는 달큰한 냄새와 숯의 온기가 오래 머물렀다.',
      '사흘 전에는 낯설기만 했던 카운터가 이제는 하루의 표정을 기억하는 자리처럼 보였다. 서툰 손이 지나간 곳마다 작고 분명한 생활의 자국이 생겨 있었다.',
    ]),
  }),
  Object.freeze({
    pageId: 'D3-EPILOGUE-02',
    kicker: '후일담 · 골목 끝의 불빛',
    title: '가게를 기억하는 사람이 생겼다',
    visualLine: '셔터 아래로 새어 나온 한 줄기 빛 앞에서 누군가가 잠시 걸음을 늦추었다.',
    paragraphs: Object.freeze([
      '골목은 다시 조용해졌지만 완전히 처음의 밤으로 돌아가지는 않았다. 퇴근길에 들른 사람과 혼자 잔을 기울이던 사람은 저마다의 집으로 작은 가게 이야기를 가져갔다.',
      '좋은 가게는 큰 소문으로 시작되지 않는다고 츠키오카는 말했다. 다시 와도 좋겠다고 생각하는 한 사람, 그 사람을 위해 내일도 같은 자리를 닦아 두는 마음에서 시작된다고.',
    ]),
  }),
  Object.freeze({
    pageId: 'D3-EPILOGUE-03',
    kicker: '후일담 · 아직 쓰이지 않은 날들',
    title: '노트의 다음 장은 비어 있었다',
    visualLine: '빈칸은 끝이 아니라, 아직 불리지 않은 이름과 아직 굽지 않은 맛을 위한 자리였다.',
    paragraphs: Object.freeze([
      '할아버지의 노트에는 모르는 글씨와 오래된 얼룩이 아직 많이 남아 있었다. 언젠가는 새로운 꼬치를 굽고, 낯선 주문 앞에서 다시 허둥대고, 오늘보다 능숙한 손으로 누군가의 저녁을 내어 줄 것이다.',
      '그날이 언제인지는 알 수 없었다. 다만 아키는 빈 페이지를 덮지 않았다. 다음 계절이 올 때까지 이야기가 머물 자리를 조심스럽게 남겨 두었다.',
    ]),
  }),
  Object.freeze({
    pageId: 'D3-EPILOGUE-04',
    kicker: 'YAKI SEASON · 다음 계절을 기다리며',
    title: '이야기는 여기서 잠시 불을 낮춘다',
    visualLine: '문을 닫은 것이 아니다. 다시 불을 켤 저녁을 기약하며 잠시 숨을 고르는 것이다.',
    paragraphs: Object.freeze([
      '사흘 동안 켜 둔 작은 불은 이제 기억 속에서 천천히 익어 갈 것이다. 새로운 손님과 새로운 메뉴, 아직 만나지 못한 밤의 이야기는 다음 계절을 준비하고 있다.',
      '아키는 열쇠를 주머니에 넣고 골목을 돌아보았다. 다시 돌아올 수 있는 불빛이 있다는 것만으로, 내일은 어제와 조금 다른 날이 될 것 같았다.',
    ]),
    releaseNote: 'YAKI SEASON의 다음 이야기는 차후 공개됩니다.',
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
