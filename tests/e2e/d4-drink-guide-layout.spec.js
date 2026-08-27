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

// 하이볼 작업대는 3D 맥주 잔 덱의 시각 기준선에 DOM으로 붙인다. 전환 중에는 패널에
// --highball-scene-scale 변형이 걸려 있어, 기준선을 변형 포함 높이로 재면 화면에 들어오는
// 순간 작업대가 한 번 튀어 오른다. 진입 첫 프레임부터 정착까지 기준선이 같아야 한다.
test('드링크로 들어올 때 하이볼 작업대 기준선이 튀지 않는다', async ({ page }) => {
  await page.goto('/src/d1-game.html?day=d4&devUnlock=1&reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-GRILL'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);

  const tops = await page.evaluate(async () => {
    const panel = document.getElementById('highballPanel');
    const seen = [];
    document.querySelector('[data-testid="quicknav-SCR-SVC-DRINK"]').click();
    for (let frame = 0; frame < 45; frame += 1) {
      await new Promise(requestAnimationFrame);
      const top = getComputedStyle(panel).getPropertyValue('--highball-panel-top').trim();
      if (top && top !== seen[seen.length - 1]) seen.push(top);
    }
    return seen;
  });

  expect(tops.length, `기준선이 여러 값으로 흔들림: ${tops.join(' → ')}`).toBe(1);
});

// 하이볼이 열리는 날에는 맥주 세트를 왼쪽으로 비켜 준다. 두 세트가 겹치면 서로를 가리고,
// 하이볼 병·얼음·잔이 좁아지면 조준이 어렵다.
test('하이볼이 열린 날에는 맥주 세트가 왼쪽으로 비켜나고 하이볼 작업대가 커진다', async ({ page }) => {
  await openDrinkStation(page);

  const layout = await page.evaluate(() => {
    const panel = document.getElementById('highballPanel').getBoundingClientRect();
    const size = (id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return Math.round(Math.min(rect.width, rect.height));
    };
    return {
      panelLeft: panel.left,
      panelWidth: panel.width,
      viewportWidth: window.innerWidth,
      beerDeck: window.__d1GameDebug.screenPosOf('glassRack').x,
      beerLever: window.__d1GameDebug.screenPosOf('drinkLeverDrag').x,
      glass: size('highballGlass'),
      ice: size('highballIce'),
      bottles: [...document.querySelectorAll('#highballPanel [data-liquid]')]
        .map((button) => {
          const rect = button.getBoundingClientRect();
          return Math.round(Math.min(rect.width, rect.height));
        }),
    };
  });

  // 맥주 세트는 하이볼 작업대 왼쪽 바깥에 있다.
  expect(layout.beerDeck).toBeLessThan(layout.panelLeft);
  expect(layout.beerLever).toBeLessThan(layout.panelLeft);
  // 조준 가능한 최소 체급을 고정한다(예전 탄산수 병은 FHD에서 짧은 변이 86px = 화면의 4.5%였다).
  // 720p에서도 성립하도록 절대 px이 아니라 화면 폭 대비 비율로 본다.
  for (const short of [layout.glass, layout.ice, ...layout.bottles]) {
    expect(short / layout.viewportWidth).toBeGreaterThanOrEqual(0.055);
  }
  // 맥주 잔 덱(화면의 약 37%)보다 커야 한다.
  expect(layout.panelWidth / layout.viewportWidth).toBeGreaterThanOrEqual(0.4);
});

test('하이볼이 없는 날에는 맥주 세트를 옮기지 않는다', async ({ page }) => {
  const beerAt = async (day) => {
    await page.goto(`/src/d1-game.html?day=${day}&devUnlock=1&reset=1`);
    await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
    await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-DRINK'));
    await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
    return page.evaluate(() => window.__d1GameDebug.screenPosOf('glassRack').x);
  };
  const d3 = await beerAt('d3');
  const d4 = await beerAt('d4');
  expect(d4).toBeLessThan(d3);
});
