import { expect, test } from '@playwright/test';

async function hold(page, locator, durationMs) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
}

test('D4 첫 주문은 실제 사라다 홀드와 하이볼 병 홀드로 완료된다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/src/d1-game.html?day=d4&devUnlock=1&reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await expect(page.getByTestId('quicknav-SCR-SVC-INSTANT')).toBeVisible();
  await expect(page.getByTestId('instant-station-badge')).toHaveCount(0);

  await page.evaluate(() => window.__d1GameDebug.businessAdvance(6_000));
  const first = await page.evaluate(() => {
    const view = window.__d1GameDebug.businessView();
    const order = view.orders.find((item) => item.orderId === 'D4-ORDER-001');
    const seat = view.seats.find((item) => item.orderId === order.orderId);
    window.__d1GameDebug.businessDispatch({
      type: 'accept-order', intentId: 'd4:e2e:accept', orderId: order.orderId,
    });
    return { customerId: seat.customerId, seatId: seat.seatId };
  });

  await page.getByTestId('quicknav-SCR-SVC-INSTANT').click();
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-INSTANT');
  await expect(page.getByTestId('cabbage-salad-prepare')).toBeVisible();
  await hold(page, page.getByTestId('cabbage-salad-prepare'), 2_650);
  const saladCard = page.locator('.dock-card[data-menu-id="cabbage-salad"]');
  await expect(saladCard).toHaveCount(1);
  await expect(saladCard.locator('.dock-quality')).toHaveCount(0);
  await expect(saladCard.locator('.dock-item-art--food')).toHaveCSS(
    'background-image',
    /pr-cabbage-salad-plate-r1-b1\.png/,
  );

  await page.getByTestId('quicknav-SCR-SVC-DRINK').click();
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-DRINK');
  // D4는 기존 3D 생맥주 잔을 정본으로 쓰며 DOM 미니 잔을 중복 표시하지 않는다.
  await expect(page.getByTestId('drink-glass')).toBeHidden();
  await expect(page.getByTestId('highball-worktop')).toBeVisible();
  await expect(page.getByTestId('highball-glass')).toBeVisible();
  await expect(page.locator('[data-drink-mode]')).toHaveCount(0);
  await expect(page.locator('#highballVisual')).toBeHidden();
  await page.getByTestId('highball-glass').click();
  await expect(page.locator('#highballVisual')).toBeVisible();
  await page.getByTestId('highball-ice').click();
  await expect(page.locator('#highballVisual')).toHaveClass(/has-ice/);
  await expect(page.locator('#highballIceVisual')).toHaveCSS('opacity', '1');
  await hold(page, page.getByTestId('highball-whiskey'), 1_000);
  await hold(page, page.getByTestId('highball-soda'), 3_000);
  await page.getByTestId('highball-lemon').click();
  await expect(page.locator('.dock-card[data-menu-id="highball"]')).toContainText('Perfect');

  await page.getByTestId('quicknav-SCR-SVC-CUSTOMERS').click();
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-CUSTOMERS');
  await saladCard.click();
  await page.getByTestId(`serve-target-${first.seatId}`).click();
  await page.getByTestId('serve-one').click();
  await expect.poll(() => page.evaluate((seatId) => {
    const salad = window.__d1GameDebug.renderer.seatSaladMesh[seatId];
    return {
      visible: salad?.visible === true,
      textureUrl: salad?.material?.map?.image?.currentSrc ?? salad?.material?.map?.image?.src ?? null,
    };
  }, first.seatId)).toEqual({
    visible: true,
    textureUrl: expect.stringContaining('pr-cabbage-salad-plate-r1-b1.png'),
  });
  await page.locator('.dock-card[data-menu-id="highball"]').click();
  await page.getByTestId(`serve-target-${first.seatId}`).click();
  await page.getByTestId('serve-one').click();

  const result = await page.evaluate(({ customerId }) => {
    const view = window.__d1GameDebug.businessView();
    const order = view.orders.find((item) => item.orderId === 'D4-ORDER-001');
    return { order, customer: view.seats.find((item) => item.customerId === customerId) };
  }, first);
  expect(result.order).toMatchObject({ status: 'completed' });
  expect(result.order.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ menuId: 'cabbage-salad', served: 1 }),
    expect.objectContaining({ menuId: 'highball', served: 1, qualities: ['Perfect'] }),
  ]));
  expect(errors).toEqual([]);
});

test('하이볼은 장면과 함께 진입하고 액체 혼합·탄산·넘침을 잔에서 보여준다', async ({ page }) => {
  await page.goto('/src/d1-game.html?day=d4&devUnlock=1&reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);

  const entering = await page.evaluate(async () => {
    window.__d1GameDebug.requestScreen('SCR-SVC-DRINK');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const panel = document.getElementById('highballPanel');
    const rect = panel.getBoundingClientRect();
    const worktop = panel.querySelector('.highball-worktop').getBoundingClientRect();
    return {
      moving: panel.classList.contains('is-scene-moving'),
      x: Number.parseFloat(panel.style.getPropertyValue('--highball-scene-x')),
      y: Number.parseFloat(panel.style.getPropertyValue('--highball-scene-y')),
      scale: Number.parseFloat(panel.style.getPropertyValue('--highball-scene-scale')),
      visibleWidth: Math.max(0, Math.min(window.innerWidth, rect.right) - Math.max(0, rect.left)),
      width: rect.width,
      artReady: panel.classList.contains('is-art-ready'),
    };
  });
  expect(entering.moving).toBe(true);
  expect(entering.artReady).toBe(true);
  expect(Math.hypot(entering.x, entering.y)).toBeGreaterThan(40);
  expect(entering.scale).toBeGreaterThanOrEqual(0.72);
  expect(entering.scale).toBeLessThanOrEqual(1.16);
  expect(entering.visibleWidth).toBeLessThan(entering.width * 0.9);
  await expect(page.getByTestId('highball-panel')).not.toHaveClass(/is-scene-moving/, { timeout: 2_000 });
  const settled = await page.evaluate(() => {
    const panel = document.getElementById('highballPanel');
    const worktop = panel.querySelector('.highball-worktop').getBoundingClientRect();
    const art = panel.querySelector('.highball-worktop-art');
    return {
      x: Number.parseFloat(panel.style.getPropertyValue('--highball-scene-x')),
      y: Number.parseFloat(panel.style.getPropertyValue('--highball-scene-y')),
      scale: Number.parseFloat(panel.style.getPropertyValue('--highball-scene-scale')),
      worktopBaseline: worktop.top + (worktop.height * (901 / 1024)),
      artReady: art.complete && art.naturalWidth > 0 && panel.classList.contains('is-art-ready'),
    };
  });
  expect(settled).toMatchObject({ x: 0, y: 0, scale: 1, artReady: true });

  const leaving = await page.evaluate(async () => {
    document.querySelector('[data-testid="quicknav-SCR-SVC-GRILL"]').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const panel = document.getElementById('highballPanel');
    const drinkPanel = document.getElementById('drinkPanel');
    return {
      activeScreen: window.__d1GameDebug.activeScreen(),
      panelHidden: panel.hidden,
      panelDisplay: getComputedStyle(panel).display,
      drinkPanelHidden: drinkPanel.hidden,
      drinkPanelDisplay: getComputedStyle(drinkPanel).display,
    };
  });
  expect(leaving).toEqual({
    activeScreen: 'SCR-SVC-GRILL',
    panelHidden: true,
    panelDisplay: 'none',
    drinkPanelHidden: true,
    drinkPanelDisplay: 'none',
  });
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-DRINK'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-DRINK');
  await expect(page.getByTestId('highball-panel')).toBeVisible();
  await expect(page.getByTestId('highball-panel')).not.toHaveClass(/is-scene-moving/, { timeout: 2_000 });

  const workstationTone = await page.getByTestId('highball-worktop').locator('.highball-worktop-art').evaluate(
    (image) => getComputedStyle(image).filter,
  );
  expect(workstationTone).toContain('brightness(0.92)');
  expect(workstationTone).toContain('saturate(0.82)');
  expect(workstationTone).toContain('hue-rotate(6deg)');

  await page.getByTestId('highball-glass').click();
  await page.getByTestId('highball-ice').click();
  const glass = page.locator('#highballVisual');
  const stream = page.locator('#highballPourStream');
  const grounding = await page.evaluate(() => {
    const renderer = window.__d1GameDebug.renderer;
    const deck = renderer.artMesh.drinkGlassDeck;
    deck.geometry.computeBoundingBox();
    const bounds = deck.geometry.boundingBox;
    const centerX = (bounds.min.x + bounds.max.x) / 2;
    const project = (y) => {
      const point = bounds.min.clone();
      point.set(centerX, y, 0);
      deck.localToWorld(point);
      return renderer.projectToScreen(point);
    };
    const deckTop = project(bounds.max.y).y;
    const deckBottom = project(bounds.min.y).y;
    const beerGlassDeckBaseline = deckTop + ((deckBottom - deckTop) * (796 / 941));
    const worktop = document.querySelector('.highball-worktop').getBoundingClientRect();
    const glassVisual = document.getElementById('highballVisual').getBoundingClientRect();
    const shadow = getComputedStyle(document.getElementById('highballVisual'), '::before');
    const highballWorktopBaseline = worktop.top + (worktop.height * (901 / 1024));
    return {
      baselineGap: Math.abs(beerGlassDeckBaseline - highballWorktopBaseline),
      worktopBaseline: highballWorktopBaseline,
      centerRatio: ((glassVisual.left + glassVisual.width / 2) - worktop.left) / worktop.width,
      bottomRatio: (glassVisual.bottom - worktop.top) / worktop.height,
      shadowContent: shadow.content,
      shadowOpacity: shadow.opacity,
    };
  });
  expect(grounding.baselineGap).toBeLessThanOrEqual(1);
  expect(Math.abs(settled.worktopBaseline - grounding.worktopBaseline)).toBeLessThanOrEqual(1);
  expect(grounding.centerRatio).toBeCloseTo(0.44, 2);
  expect(grounding.bottomRatio).toBeCloseTo(0.762, 2);
  expect(grounding.shadowContent).not.toBe('none');
  expect(grounding.shadowOpacity).toBe('1');

  const whiskey = page.getByTestId('highball-whiskey');
  const whiskeyBox = await whiskey.boundingBox();
  expect(whiskeyBox).not.toBeNull();
  await page.mouse.move(whiskeyBox.x + whiskeyBox.width / 2, whiskeyBox.y + whiskeyBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await expect(glass).toHaveClass(/is-pouring-whiskey/);
  await expect(stream).toHaveCSS('opacity', '1');
  const whiskeyPourGeometry = await page.evaluate(() => {
    const worktopRect = document.querySelector('.highball-worktop').getBoundingClientRect();
    const bottle = document.querySelector('.highball-bottle.whiskey');
    const bottleStyle = getComputedStyle(bottle);
    const matrix = new DOMMatrix(bottleStyle.transform);
    const [originX, originY] = bottleStyle.transformOrigin.split(' ').map(Number.parseFloat);
    const mouthPoint = new DOMPoint(
      bottle.offsetWidth / 2 - originX,
      -originY,
    ).matrixTransform(matrix);
    const mouth = {
      x: worktopRect.left + bottle.offsetLeft + originX + mouthPoint.x,
      y: worktopRect.top + bottle.offsetTop + originY + mouthPoint.y,
    };
    const streamRect = document.getElementById('highballPourStream').getBoundingClientRect();
    const glassRect = document.getElementById('highballVisual').getBoundingClientRect();
    const streamX = (streamRect.left + streamRect.right) / 2;
    const glassX = (glassRect.left + glassRect.right) / 2;
    return {
      angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
      bottomGap: Math.abs(streamRect.bottom - glassRect.top),
      centerGap: Math.abs(streamX - glassX),
      mouthGap: Math.hypot(mouth.x - streamX, mouth.y - streamRect.top),
      streamWidth: streamRect.width,
    };
  });
  expect(Math.abs(whiskeyPourGeometry.angle)).toBeGreaterThanOrEqual(82);
  expect(Math.abs(whiskeyPourGeometry.angle)).toBeLessThanOrEqual(88);
  expect(whiskeyPourGeometry.bottomGap).toBeLessThanOrEqual(3);
  expect(whiskeyPourGeometry.centerGap).toBeLessThanOrEqual(1);
  expect(whiskeyPourGeometry.mouthGap).toBeLessThanOrEqual(1.5);
  expect(whiskeyPourGeometry.streamWidth).toBeLessThanOrEqual(4.5);
  await page.mouse.up();
  await expect(glass).toHaveClass(/has-whiskey/);
  await expect(glass).not.toHaveClass(/is-mixed/);

  const soda = page.getByTestId('highball-soda');
  const sodaBox = await soda.boundingBox();
  expect(sodaBox).not.toBeNull();
  await page.mouse.move(sodaBox.x + sodaBox.width / 2, sodaBox.y + sodaBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await expect(glass).toHaveClass(/has-soda/);
  await expect(glass).toHaveClass(/is-mixed/);
  await expect(page.locator('#highballCarbonation')).toHaveCSS('opacity', '1');
  const sodaPourGeometry = await page.evaluate(() => {
    const worktopRect = document.querySelector('.highball-worktop').getBoundingClientRect();
    const bottle = document.querySelector('.highball-bottle.soda');
    const bottleStyle = getComputedStyle(bottle);
    const matrix = new DOMMatrix(bottleStyle.transform);
    const [originX, originY] = bottleStyle.transformOrigin.split(' ').map(Number.parseFloat);
    const mouthPoint = new DOMPoint(
      bottle.offsetWidth / 2 - originX,
      -originY,
    ).matrixTransform(matrix);
    const mouth = {
      x: worktopRect.left + bottle.offsetLeft + originX + mouthPoint.x,
      y: worktopRect.top + bottle.offsetTop + originY + mouthPoint.y,
    };
    const streamRect = document.getElementById('highballPourStream').getBoundingClientRect();
    const glassRect = document.getElementById('highballVisual').getBoundingClientRect();
    const streamX = (streamRect.left + streamRect.right) / 2;
    const glassX = (glassRect.left + glassRect.right) / 2;
    return {
      angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
      bottomGap: Math.abs(streamRect.bottom - glassRect.top),
      centerGap: Math.abs(streamX - glassX),
      mouthGap: Math.hypot(mouth.x - streamX, mouth.y - streamRect.top),
      streamWidth: streamRect.width,
    };
  });
  expect(Math.abs(sodaPourGeometry.angle)).toBeGreaterThanOrEqual(82);
  expect(Math.abs(sodaPourGeometry.angle)).toBeLessThanOrEqual(88);
  expect(sodaPourGeometry.bottomGap).toBeLessThanOrEqual(3);
  expect(sodaPourGeometry.centerGap).toBeLessThanOrEqual(1);
  expect(sodaPourGeometry.mouthGap).toBeLessThanOrEqual(1.5);
  expect(sodaPourGeometry.streamWidth).toBeLessThanOrEqual(4.5);

  await page.waitForTimeout(4_000);
  await expect(glass).toHaveClass(/is-overflow/);
  await expect(page.locator('#highballOverflowSpill')).toHaveCSS('opacity', '1');
  await expect(page.getByTestId('highball-overflow')).toBeVisible();
  const overflowPresentation = await page.evaluate(() => {
    const glassElement = document.getElementById('highballVisual');
    const glassRect = glassElement.getBoundingClientRect();
    const liquidRect = document.getElementById('highballLiquid').getBoundingClientRect();
    const dialogRect = document.getElementById('highballOverflow').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('#highballOverflow button')]
      .map((button) => button.getBoundingClientRect());
    return {
      liquidWidthRatio: liquidRect.width / glassRect.width,
      dialogWidth: dialogRect.width,
      buttonsShareRow: Math.abs(buttons[0].top - buttons[1].top) <= 2,
      hintHidden: document.getElementById('highballHint').hidden,
      glassFilter: getComputedStyle(glassElement).filter,
    };
  });
  expect(overflowPresentation.liquidWidthRatio).toBeGreaterThanOrEqual(0.81);
  expect(overflowPresentation.dialogWidth).toBeLessThanOrEqual(250);
  expect(overflowPresentation.buttonsShareRow).toBe(true);
  expect(overflowPresentation.hintHidden).toBe(true);
  expect(overflowPresentation.glassFilter).toBe('none');
  await page.mouse.up();
});
