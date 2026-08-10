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
});

export const MENU_LABEL = Object.freeze({
  negima: '네기마',
  momo: '모모',
  beer: '생맥주',
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

function skewerEntry(menuId, recipe, thresholds) {
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
      ...grillLines(thresholds),
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
      `맥주 ${beerLow}~${beerHigh}초(목표 3.0) · 거품 ${foamLow}~${foamHigh}초(목표 1.0)`,
      `합쳐서 ${drink.totalCap}초를 넘기면 넘칩니다.`,
    ],
  };
}

export function recipeBookEntries({
  menuIds = ['negima', 'momo', 'beer'],
  recipes = EARLY_CAMPAIGN_RECIPES,
  thresholds = COOK_THRESHOLDS_SEC,
  drink = DRINK,
} = {}) {
  return menuIds
    .map((menuId) => {
      if (menuId === 'beer') return beerEntry(drink);
      const recipe = recipes[menuId];
      return recipe ? skewerEntry(menuId, recipe, thresholds) : null;
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
