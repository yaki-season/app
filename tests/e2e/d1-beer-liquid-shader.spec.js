import { expect, test } from '@playwright/test';

test('D1 맥주·거품 양이 GPU 액체 셰이더 uniform에 연결된다', async ({ page }) => {
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessReady())).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-DRINK'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-DRINK');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.beerLiquidState())).not.toBeNull();

  const rack = await page.evaluate(() => window.__d1GameDebug.screenPosOf('glassRack'));
  await page.mouse.click(rack.x, rack.y);

  await page.evaluate(() => window.__d1GameDebug.pourExact(1.5, 0.5));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.beerLiquidState()?.beerFill))
    .toBeCloseTo(1.5 / 4, 5);
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.beerLiquidState()?.foamFill))
    .toBeCloseTo(0.5 / 4, 5);

  await page.evaluate(() => window.__d1GameDebug.pourExact(3, 1));

  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.beerLiquidState()?.beerFill))
    .toBeCloseTo(3 / 4, 5);
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.beerLiquidState()?.foamFill))
    .toBeCloseTo(1 / 4, 5);
  expect(await page.evaluate(() => window.__d1GameDebug.beerLiquidState()?.overflow)).toBe(false);
  const rendererState = await page.evaluate(() => {
    const mesh = window.__d1GameDebug.renderer.objectMesh.drinkBeerLiquid;
    const vfx = window.__d1GameDebug.renderer.objectMesh.drinkBeerVfx;
    return {
      visible: mesh.visible,
      shader: mesh.material.isShaderMaterial === true,
      vfxVisible: vfx.visible,
      vfxShader: vfx.material.isShaderMaterial === true,
    };
  });
  expect(rendererState).toEqual({ visible: true, shader: true, vfxVisible: true, vfxShader: true });
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.beerCoreVfxState())).toMatchObject({
    pourBeer: false,
    pourFoam: false,
    overflow: false,
    finished: true,
  });
  // 완성 뒤 포말 blob은 사라지고, 잔 내부 foam layer만 남는다.
  expect((await page.evaluate(() => window.__d1GameDebug.beerCoreVfxState())).foamCrown).toBe(0);
});

test('D1 중립 레버는 위·아래 드래그 방향에 따라 거품·맥주를 따른다', async ({ page }) => {
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessReady())).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-DRINK'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-DRINK');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);

  const rack = await page.evaluate(() => window.__d1GameDebug.screenPosOf('glassRack'));
  await page.mouse.click(rack.x, rack.y);
  const lever = await page.evaluate(() => window.__d1GameDebug.screenPosOf('drinkLeverDrag'));

  await page.mouse.move(lever.x, lever.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__d1GameDebug.drinkState())).toMatchObject({
    beerSec: 0,
    foamSec: 0,
    active: null,
  });
  await page.mouse.move(lever.x, lever.y + 60, { steps: 4 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  expect((await page.evaluate(() => window.__d1GameDebug.drinkState())).beerSec).toBeGreaterThan(0.1);

  await page.evaluate(() => window.__d1GameDebug.pourExact(0, 0));
  await page.mouse.move(lever.x, lever.y);
  await page.mouse.down();
  await page.mouse.move(lever.x, lever.y - 60, { steps: 4 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  expect((await page.evaluate(() => window.__d1GameDebug.drinkState())).foamSec).toBeGreaterThan(0.1);
});
