import { test, expect } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, fn, ...args) => page.evaluate(
  ({ name, values }) => window.__d1GameDebug[name](...values),
  { name: fn, values: args },
);

test('D1 통합 정지는 중첩 원인이 해제될 때까지 영업·그릴·VFX·렌더 시간을 멈춘다', async ({ page }) => {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);

  await page.getByTestId('business-phase').click();
  await expect(page.getByTestId('runtime-pause')).toBeVisible();
  await expect(page.getByTestId('business-phase')).toHaveAttribute('aria-pressed', 'true');
  const manualPauseClock = (await D(page, 'businessView')).clock.elapsedMs;
  await page.waitForTimeout(250);
  expect((await D(page, 'businessView')).clock.elapsedMs).toBe(manualPauseClock);
  await page.getByTestId('runtime-pause-resume').click();
  await expect(page.getByTestId('runtime-pause')).toBeHidden();
  await expect.poll(() => D(page, 'businessView').then((view) => view.clock.elapsedMs))
    .toBeGreaterThan(manualPauseClock);

  await D(page, 'cookFillAssembly', 'negima');
  await D(page, 'cookTransferAssembly');
  await D(page, 'cookPlace', 'negima');
  await page.waitForTimeout(180);

  await D(page, 'requestScreen', 'SCR-SVC-DRINK');
  await expect.poll(() => D(page, 'activeScreen')).toBe('SCR-SVC-DRINK');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
  const glass = await D(page, 'screenPosOf', 'glassRack');
  const lever = await D(page, 'screenPosOf', 'drinkLeverDrag');
  await page.mouse.click(glass.x, glass.y);
  await page.mouse.move(lever.x, lever.y);
  await page.mouse.down();
  await page.mouse.move(lever.x, lever.y + 60, { steps: 4 });
  await page.waitForTimeout(180);

  await D(page, 'setRuntimeSuspended', 'e2e-primary', true);
  await D(page, 'setRuntimeSuspended', 'e2e-overlap', true);
  await page.mouse.up();
  const pausedBusiness = (await D(page, 'businessView')).clock.elapsedMs;
  const pausedCook = (await D(page, 'cookSlots'))[0].frontElapsedSec;
  const pausedDrink = await D(page, 'drinkState');
  const pausedLiquidTime = (await D(page, 'beerLiquidState')).time;
  const pausedCoreTime = (await D(page, 'beerCoreVfxState')).time;
  const pausedFrameCount = (await D(page, 'rendererStats')).frameCount;
  expect(await D(page, 'runtimeSuspension')).toMatchObject({
    paused: true,
    reasons: ['e2e-overlap', 'e2e-primary'],
    frameScheduled: false,
    cookPaused: true,
    drinkPaused: true,
    smokePaused: true,
    renderPaused: true,
  });
  expect(pausedDrink).toMatchObject({ active: null, paused: true });

  await page.waitForTimeout(650);
  expect((await D(page, 'businessView')).clock.elapsedMs).toBe(pausedBusiness);
  expect((await D(page, 'cookSlots'))[0].frontElapsedSec).toBeCloseTo(pausedCook, 5);
  expect((await D(page, 'drinkState')).beerSec).toBeCloseTo(pausedDrink.beerSec, 5);
  expect((await D(page, 'beerLiquidState')).time).toBe(pausedLiquidTime);
  expect((await D(page, 'beerCoreVfxState')).time).toBe(pausedCoreTime);
  expect((await D(page, 'rendererStats')).frameCount).toBe(pausedFrameCount);

  await D(page, 'setRuntimeSuspended', 'e2e-primary', false);
  expect(await D(page, 'runtimeSuspension')).toMatchObject({ paused: true, frameScheduled: false });
  await page.waitForTimeout(250);
  expect((await D(page, 'businessView')).clock.elapsedMs).toBe(pausedBusiness);

  await D(page, 'setRuntimeSuspended', 'e2e-overlap', false);
  await expect.poll(() => D(page, 'runtimeSuspension')).toMatchObject({
    paused: false,
    reasons: [],
    frameScheduled: true,
  });
  await expect.poll(() => D(page, 'businessView').then((view) => view.clock.elapsedMs))
    .toBeGreaterThan(pausedBusiness);
  await expect.poll(() => D(page, 'cookSlots').then((slots) => slots[0].frontElapsedSec))
    .toBeGreaterThan(pausedCook);
  await expect.poll(() => D(page, 'beerLiquidState').then((state) => state.time))
    .toBeGreaterThan(pausedLiquidTime);
  await expect.poll(() => D(page, 'rendererStats').then((stats) => stats.frameCount))
    .toBeGreaterThan(pausedFrameCount);
  expect(await D(page, 'drinkState')).toMatchObject({ active: null, paused: false });
  expect((await D(page, 'drinkState')).beerSec).toBeCloseTo(pausedDrink.beerSec, 2);
});
