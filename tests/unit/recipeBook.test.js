import { describe, expect, it } from 'vitest';
import { COOK_THRESHOLDS_SEC, DONENESS, EARLY_CAMPAIGN_RECIPES } from '../../src/config/recipe.js';
import { DRINK } from '../../src/application/gameplay/drinkStation.js';
import { recipeBookEntries, shouldShowAssemblyTutorial } from '../../src/application/gameplay/recipeBook.js';

const entryOf = (menuId) => recipeBookEntries().find((entry) => entry.menuId === menuId);

describe('비법노트', () => {
  it('오늘 만들 수 있는 메뉴를 모두 싣는다', () => {
    expect(recipeBookEntries().map(({ menuId }) => menuId)).toEqual(['negima', 'momo', 'beer']);
  });

  it('네기마는 끼우는 순서를 그대로 보여준다', () => {
    const negima = entryOf('negima');
    expect(negima.steps).toEqual(EARLY_CAMPAIGN_RECIPES.negima.map((ingredient) => (
      ingredient === 'chicken' ? '닭다리살' : '대파'
    )));
    expect(negima.lines[0]).toBe('끼우는 순서 · 닭다리살 → 대파 → 닭다리살 → 대파 → 닭다리살');
  });

  it('같은 재료만 쓰는 모모는 순서 대신 개수로 알려준다', () => {
    expect(entryOf('momo').lines[0]).toBe('닭다리살 5조각을 차례로 끼웁니다.');
  });

  it('굽기 기준은 임계값 정본을 그대로 읽는다', () => {
    const line = entryOf('negima').lines[1];
    expect(line).toBe(
      `한 면당 ${COOK_THRESHOLDS_SEC[DONENESS.PERFECT]}~${COOK_THRESHOLDS_SEC[DONENESS.OVER]}초가`
      + ' 적정입니다. 양면 모두 구워야 완성됩니다.',
    );
    expect(entryOf('negima').lines[2])
      .toContain(`${COOK_THRESHOLDS_SEC[DONENESS.BURNT]}초를 넘기면 탑니다`);
  });

  it('생맥주는 적정 구간과 넘침 임계를 알려준다', () => {
    const beer = entryOf('beer');
    expect(beer.lines[1]).toContain(`맥주 ${DRINK.beerRange[0]}~${DRINK.beerRange[1]}`);
    expect(beer.lines[2]).toContain(`${DRINK.totalCap}초`);
  });

  it('없는 메뉴는 조용히 건너뛴다', () => {
    expect(recipeBookEntries({ menuIds: ['negima', 'unknown'] }).map(({ menuId }) => menuId))
      .toEqual(['negima']);
  });
});

describe('조립 안내 표시 조건', () => {
  it('처음 만드는 메뉴에만 띄운다', () => {
    expect(shouldShowAssemblyTutorial('negima', [])).toBe(true);
    expect(shouldShowAssemblyTutorial('negima', ['negima'])).toBe(false);
  });

  it('메뉴마다 따로 센다', () => {
    expect(shouldShowAssemblyTutorial('momo', ['negima'])).toBe(true);
  });

  it('고른 메뉴가 없으면 띄우지 않는다', () => {
    expect(shouldShowAssemblyTutorial(null, [])).toBe(false);
  });

  it('Set으로 줘도 같게 판단한다', () => {
    expect(shouldShowAssemblyTutorial('negima', new Set(['negima']))).toBe(false);
  });
});
