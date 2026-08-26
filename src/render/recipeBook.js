// 비법노트. "어떻게 만드는지"를 언제든 다시 펼쳐 볼 수 있는 곳.
//
// 조립 순서는 화면 위 안내(receipts)가 알려주지만, 그 안내는 처음 만드는 메뉴에만 뜬다.
// 한 번 익힌 뒤에도 잊었을 때 찾아볼 데가 있어야 해서 이 노트를 둔다.
//
// 수치를 여기서 다시 정의하지 않는다. 레시피는 config/recipe.js, 굽기 임계는 COOK_THRESHOLDS_SEC,
// 따르기 목표는 drinkStation의 DRINK가 정본이고 이 모듈은 읽어서 문장으로 바꾸기만 한다.

import { COOK_THRESHOLDS_SEC, DONENESS, EARLY_CAMPAIGN_RECIPES } from '../config/recipe.js';
import { DRINK } from './drinkStation.js';

export const INGREDIENT_LABEL = Object.freeze({
  chicken: '닭다리살',
  leek: '대파',
  foldedChickenSkin: '접은 닭껍질',
});

export const MENU_LABEL = Object.freeze({
  negima: '네기마',
  momo: '모모',
  kawa: '토리카와',
  beer: '생맥주',
  highball: '하이볼',
  'cabbage-salad': '양배추 사라다',
});

const round1 = (value) => Number(value.toFixed(1));

// 꼬치는 앞뒤 두 면을 각각 굽는다. 적정 구간은 [perfect, over)이다.
function grillLines(thresholds) {
  const perfect = round1(thresholds[DONENESS.PERFECT]);
  const over = round1(thresholds[DONENESS.OVER]);
  const burnt = round1(thresholds[DONENESS.BURNT]);
  return [
    `한 면당 ${perfect}~${over}초가 적정입니다. 양면 모두 구워야 완성됩니다.`,
    `${over}초를 넘기면 과다, ${burnt}초를 넘기면 탑니다.`,
  ];
}

// 타레는 조립대에서 바르는 순간 같은 꼬치가 다른 메뉴가 된다. 절차보다 그 결과를 먼저 말한다.
function tareLines(menuId) {
  const label = MENU_LABEL[menuId] ?? menuId;
  return [
    `타레를 바르면 타레 ${label}가 됩니다. 바르지 않으면 소금 ${label}입니다.`,
    '타레는 조립을 마친 뒤 조립대의 소스통을 선택해 꼬치 위를 좌우로 한 번 고르게 칠한 다음 그릴 재고로 보냅니다.',
  ];
}

function skewerEntry(menuId, recipe, thresholds, tareAvailable = false) {
  const steps = recipe.map((ingredient) => INGREDIENT_LABEL[ingredient] ?? ingredient);
  // 같은 재료만 반복하는 레시피는 순서를 나열해 봐야 읽기 어렵다. 개수로 알려준다.
  const uniform = new Set(steps).size === 1;
  return {
    menuId,
    label: MENU_LABEL[menuId] ?? menuId,
    steps,
    lines: [
      uniform
        ? `${steps[0]} ${steps.length}조각을 차례로 끼웁니다.`
        : `끼우는 순서 · ${steps.join(' → ')}`,
      ...(tareAvailable ? tareLines(menuId) : []),
      ...grillLines(thresholds),
    ],
  };
}

function kawaEntry(recipe) {
  return {
    menuId: 'kawa',
    label: MENU_LABEL.kawa,
    steps: recipe.map(() => INGREDIENT_LABEL.foldedChickenSkin),
    lines: [
      '접은 닭껍질 5조각을 빈 자리부터 차례로 끼웁니다.',
      ...tareLines('kawa'),
      '소금은 양면을 구운 뒤 회수합니다. 닭껍질은 모모보다 빨리 타므로 색을 더 자주 살피세요.',
    ],
  };
}

function beerEntry(drink) {
  const [beerLow, beerHigh] = drink.beerRange;
  const [foamLow, foamHigh] = drink.foamRange;
  return {
    menuId: 'beer',
    label: MENU_LABEL.beer,
    steps: ['빈 잔', '맥주', '거품'],
    lines: [
      '빈 잔을 노즐 아래에 놓고 레버를 내려 맥주를, 올려 거품을 받습니다.',
      `맥주 ${beerLow}~${beerHigh}초(목표 ${drink.beerTargetSec.toFixed(1)}) · 거품 ${foamLow}~${foamHigh}초(목표 ${drink.foamTargetSec.toFixed(1)})`,
      `합쳐서 ${drink.totalCap}초를 넘기면 넘칩니다.`,
    ],
  };
}

function highballEntry() {
  return {
    menuId: 'highball',
    label: MENU_LABEL.highball,
    steps: ['빈 잔', '얼음', '위스키', '탄산수', '레몬'],
    lines: [
      '빈 잔에 얼음을 넣고 위스키와 탄산수를 병을 눌러 직접 따릅니다.',
      '위스키 1 : 탄산수 3의 비율을 감으로 맞춘 뒤 레몬을 올립니다.',
      '넘치기 직전에는 낮은 품질로 계속하거나 잔을 폐기할 수 있습니다.',
    ],
  };
}

function cabbageSaladEntry() {
  return {
    menuId: 'cabbage-salad',
    label: MENU_LABEL['cabbage-salad'],
    steps: ['접시', '양배추 사라다'],
    lines: [
      '사이드 메뉴 스테이션에서 사라다 카드를 2.5초 동안 누릅니다.',
      '한 번 완성할 때 한 접시가 공용 준비 목록에 추가됩니다.',
      '사라다는 무료지만 주문 수량만큼 반드시 제공해야 합니다.',
    ],
  };
}

export function recipeBookEntries({
  menuIds = ['negima', 'momo', 'beer'],
  recipes = EARLY_CAMPAIGN_RECIPES,
  thresholds = COOK_THRESHOLDS_SEC,
  drink = DRINK,
  tareAvailable = false,
} = {}) {
  return menuIds
    .map((menuId) => {
      if (menuId === 'beer') return beerEntry(drink);
      if (menuId === 'highball') return highballEntry();
      if (menuId === 'cabbage-salad') return cabbageSaladEntry();
      const recipe = recipes[menuId];
      if (menuId === 'kawa' && recipe) return kawaEntry(recipe);
      return recipe ? skewerEntry(menuId, recipe, thresholds, tareAvailable) : null;
    })
    .filter(Boolean);
}

// 화면 위 조립 안내는 **처음 만드는 메뉴에만** 띄운다. 이미 만들어 본 메뉴까지 매번 단계를
// 짚어주면 잔소리가 되고, 잊었을 때는 비법노트가 있다.
export function shouldShowAssemblyTutorial(menuId, learnedMenuIds) {
  if (!menuId) return false;
  const learned = learnedMenuIds instanceof Set ? learnedMenuIds : new Set(learnedMenuIds ?? []);
  return !learned.has(menuId);
}
