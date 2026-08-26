import { expect, test } from '@playwright/test';

async function openDrinkStation(page) {
  await page.goto('/src/d1-game.html?day=d4&devUnlock=1&reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-DRINK'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-DRINK');
  await expect(page.getByTestId('highball-panel')).toHaveClass(/is-art-ready/);
  await expect(page.getByTestId('highball-panel')).not.toHaveClass(/is-scene-moving/, { timeout: 2_000 });
}

test('D4 드링크 안내는 같은 정보 구조와 기준선으로 배치되고 글자를 자르지 않는다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openDrinkStation(page);

  await expect(page.locator('#beerStationTitle')).toHaveText('생맥주');
  await expect(page.locator('#beerPanel .drink-guide-recipe')).toHaveText('빈 잔 → 맥주 7 : 거품 3');
  await expect(page.locator('#beerHint')).toHaveText('빈 잔을 놓으세요');
  await expect(page.locator('#highballStationTitle')).toHaveText('하이볼');
  await expect(page.locator('#highballGuide .drink-guide-recipe'))
    .toHaveText('빈 잔 → 얼음 → 위스키 1 : 탄산수 3 → 레몬');
  await expect(page.locator('#highballHint')).toHaveText('빈 잔을 가져오세요');
  await expect(page.getByTestId('drink-overflow')).toBeHidden();
  await expect(page.getByTestId('highball-overflow')).toBeHidden();

  const layout = await page.evaluate(() => {
    const beer = document.getElementById('beerPanel').getBoundingClientRect();
    const highball = document.getElementById('highballGuide').getBoundingClientRect();
    const visible = (element) => {
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (current.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    };
    const clipped = [...document.querySelectorAll([
      '#beerPanel .drink-guide-heading > *',
      '#beerHint',
      '#beerPanel [data-act="finish"]',
      '#highballGuide .drink-guide-heading > *',
      '#highballHint',
    ].join(','))]
      .filter(visible)
      .filter((element) => element.scrollWidth > element.clientWidth + 1
        || element.scrollHeight > element.clientHeight + 1)
      .map((element) => element.id || element.textContent.trim());
    const glassLabel = getComputedStyle(document.getElementById('highballGlass'), '::after')
      .content.replace(/["']/g, '');
    return {
      bottomGap: Math.abs(beer.bottom - highball.bottom),
      heightGap: Math.abs(beer.height - highball.height),
      horizontalGap: highball.left - beer.right,
      clipped,
      glassLabel,
    };
  });

  expect(layout.bottomGap).toBeLessThanOrEqual(1);
  expect(layout.heightGap).toBeLessThanOrEqual(1);
  expect(layout.horizontalGap).toBeGreaterThanOrEqual(4);
  expect(layout.clipped).toEqual([]);
  expect(layout.glassLabel).toBe('빈 잔');
  await expect(page.getByTestId('label-glassRack')).toHaveText('빈 잔');
  await expect(page.getByTestId('label-drinkLeverDrag')).toHaveText('레버');
  expect(errors).toEqual([]);
});
