// 시작 메뉴 · 일시정지의 "플레이방법" 화면 내용.
//
// 수치를 여기서 다시 적지 않는다. 굽기 임계는 COOK_THRESHOLDS_SEC, 따르기 목표는 DRINK,
// 하이볼 비율은 HIGHBALL_DEFAULT_CONFIG, 사라다 홀드는 INSTANT_SERVICE_DEFAULT_HOLD_MS가
// 정본이고 이 모듈은 읽어서 문장으로 바꾸기만 한다(비법노트와 같은 규칙).
//
// 이미지 한 장이 아니라 DOM으로 그린다. 창 크기가 바뀌어도 글자가 깨지지 않고,
// 구이 초 수 같은 수치가 바뀌면 이 화면도 저절로 따라간다.

import { COOK_THRESHOLDS_SEC, DONENESS } from '../config/recipe.js';
import { DRINK } from '../render/drinkStation.js';
import { HIGHBALL_DEFAULT_CONFIG } from '../application/stations/highballStation.js';
import { INSTANT_SERVICE_DEFAULT_HOLD_MS } from '../application/stations/instantServiceStation.js';

const round1 = (value) => Number(Number(value).toFixed(1));
const seconds = (value) => `${round1(value)}초`;

// 화면 이동 띠. 실제 하단 퀵네비와 같은 순서다.
const SCREEN_CHIPS = Object.freeze([
  { label: '손님' },
  { label: '조립' },
  { label: '그릴' },
  { label: '드링크' },
  { label: '사이드 메뉴', locked: true },
]);

const FLOW_STEPS = Object.freeze([
  { no: '①', title: '주문 받기', detail: '손님을 클릭' },
  { no: '②', title: '만들기', detail: '각 스테이션에서' },
  { no: '③', title: '픽업대에 올리기', detail: '완성품이 쌓인다' },
  { no: '④', title: '손님에게 내기', detail: '고르고 클릭' },
  { no: '⑤', title: '자리 정리', detail: '3초 누르기' },
]);

function stationCards() {
  const perfect = seconds(COOK_THRESHOLDS_SEC[DONENESS.PERFECT]);
  const over = seconds(COOK_THRESHOLDS_SEC[DONENESS.OVER]);
  const burnt = seconds(COOK_THRESHOLDS_SEC[DONENESS.BURNT]);
  const [beerLow, beerHigh] = DRINK.beerRange;
  const [foamLow, foamHigh] = DRINK.foamRange;
  const whiskey = round1(HIGHBALL_DEFAULT_CONFIG.whiskeyPerfect.reduce((a, b) => a + b, 0) / 2);
  const soda = round1(HIGHBALL_DEFAULT_CONFIG.sodaPerfect.reduce((a, b) => a + b, 0) / 2);
  const saladHold = seconds(INSTANT_SERVICE_DEFAULT_HOLD_MS / 1000);
  return [
    {
      title: '조립',
      lines: [
        '재료통을 눌러 레시피 순서대로 끼운다.',
        '타레는 소스통을 고르고 꼬치 위를 좌우로 한 번.',
        '→ 타레 꼬치가 된다.',
      ],
    },
    {
      title: '그릴',
      lines: [
        `한 면당 ${perfect}~${over}가 적정. 양면 모두 굽는다.`,
        `${over}를 넘기면 과다.`,
        `${burnt}를 넘기면 탄다.`,
      ],
    },
    {
      title: '드링크',
      lines: [
        `생맥주 · 레버를 내려 맥주 ${seconds(beerLow)}~${seconds(beerHigh)}, 올려 거품 ${seconds(foamLow)}~${seconds(foamHigh)}.`,
        `합쳐 ${seconds(DRINK.totalCap)}를 넘기면 넘친다.`,
        `하이볼 · 얼음 → 위스키 ${whiskey} : 탄산수 ${soda} → 레몬. 완성 잔을 눌러 픽업대로.`,
      ],
    },
    {
      title: '사이드 메뉴',
      lines: [
        `사라다 카드를 ${saladHold} 누르고 있으면 한 접시.`,
        '무료지만 주문한 수량만큼',
        '반드시 내야 한다.',
      ],
    },
  ];
}

const QUALITY_GRADES = Object.freeze(['Perfect', 'Good', 'OK', 'Fail']);

// element는 자식을 받지 않으므로 여기서 조립한다.
function section(element, className, titleText) {
  const node = element('div', { className });
  if (titleText) node.append(element('p', { className: 'howto-section-title', text: titleText }));
  return node;
}

export function createHowToPlayContent(element) {
  const root = element('div', { className: 'howto' });

  root.append(element('p', { className: 'howto-lead', text: '굽고 · 따르고 · 제때 낸다' }));

  // ── 화면 이동 ──
  const nav = section(element, 'howto-nav', '화면 이동 · 아래 버튼이나 좌우 화살표로 옮겨 다닌다');
  const chips = element('div', { className: 'howto-chips' });
  for (const { label, locked } of SCREEN_CHIPS) {
    chips.append(element('span', {
      className: locked ? 'howto-chip is-locked' : 'howto-chip',
      text: locked ? `${label} (4일차부터)` : label,
    }));
  }
  nav.append(chips);
  root.append(nav);

  // ── 한 접시가 나가는 흐름 ──
  const flow = section(element, 'howto-flow', '한 접시가 나가는 흐름');
  const steps = element('ol', { className: 'howto-steps' });
  for (const { no, title, detail } of FLOW_STEPS) {
    const item = element('li', { className: 'howto-step' });
    item.append(
      element('strong', { className: 'howto-step-title', text: `${no} ${title}` }),
      element('span', { className: 'howto-step-detail', text: detail }),
    );
    steps.append(item);
  }
  flow.append(steps);
  flow.append(element('p', {
    className: 'howto-aside',
    text: '동행 손님은 둘 중 아무나 눌러도 그룹 주문 전체가 접수된다.',
  }));
  flow.append(element('p', {
    className: 'howto-aside',
    text: '낼 때는 픽업대에서 낼 것을 먼저 고르고 그 손님을 클릭한다.',
  }));
  root.append(flow);

  // ── 스테이션별 요령 ──
  const stations = section(element, 'howto-stations', '스테이션별 요령');
  const cards = element('div', { className: 'howto-cards' });
  for (const { title, lines } of stationCards()) {
    const card = element('div', { className: 'howto-card' });
    card.append(element('strong', { className: 'howto-card-title', text: title }));
    for (const line of lines) card.append(element('p', { className: 'howto-card-line', text: line }));
    cards.append(card);
  }
  stations.append(cards);
  root.append(stations);

  // ── 품질과 시간 ──
  const quality = section(element, 'howto-quality', '품질과 시간');
  const grades = element('div', { className: 'howto-grades' });
  for (const grade of QUALITY_GRADES) {
    grades.append(element('span', { className: `howto-grade q-${grade}`, text: grade }));
  }
  quality.append(grades);
  quality.append(element('p', {
    className: 'howto-card-line',
    text: '적정 구간에 가까울수록 좋은 평가와 팁으로 돌아온다.',
  }));
  quality.append(element('p', {
    className: 'howto-card-line',
    text: '손님 머리 위 게이지가 인내심이다. 15초가 남으면 붉게 재촉하고, 다 떨어지면 그냥 나가버린다.',
  }));
  root.append(quality);

  root.append(element('p', {
    className: 'howto-footer',
    text: '만드는 법을 잊었으면 왼쪽 위 비법노트를 펼쳐 본다. 영업이 끝나면 손님 · 품질 · 매출을 정산한다.',
  }));

  // ── 화면 조작 (기존 도움 내용) ──
  const controls = section(element, 'howto-controls', '화면 조작');
  controls.append(
    element('p', { className: 'howto-card-line', text: 'Tab과 Shift+Tab으로 항목을 이동하고 Enter 또는 Space로 선택할 수 있습니다.' }),
    element('p', { className: 'howto-card-line', text: '저장 파일은 이 브라우저에만 남습니다. 내보내기와 불러오기는 사용자가 직접 실행할 때만 동작합니다.' }),
    element('p', { className: 'howto-card-line', text: '모든 상태와 경고는 색뿐 아니라 문구로도 표시됩니다.' }),
  );
  root.append(controls);

  return [root];
}
