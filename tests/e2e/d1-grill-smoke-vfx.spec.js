import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, name, ...args) => page.evaluate(
  ({ debugName, values }) => window.__d1GameDebug[debugName](...values),
  { debugName: name, values: args },
);

async function bootAtGrill(page) {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'requestScreen', 'SCR-SVC-GRILL');
  await expect.poll(() => D(page, 'activeScreen')).toBe('SCR-SVC-GRILL');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
}

test('조리 중 잔잔한 연기와 뒤집기 단발 버스트를 6장 풀 안에서 표시한다', async ({ page }) => {
  await bootAtGrill(page);
  await D(page, 'cookFillAssembly');
  expect(await D(page, 'cookPlace')).toMatchObject({ ok: true, slot: 0 });

  await expect.poll(() => D(page, 'grillSmoke').then(({ ambient }) => ambient)).toBeGreaterThan(0);
  expect(await D(page, 'grillSmoke')).toMatchObject({ maxPuffs: 6, flip: 0 });

  await D(page, 'cookElapse', 8);
  await D(page, 'cookClickSlot', 0);
  await expect.poll(() => D(page, 'cookSlots').then(([slot]) => slot.flipping)).toBe(true);
  await expect.poll(() => D(page, 'grillSmoke').then(({ flip }) => flip)).toBe(3);
  const burst = await D(page, 'grillSmoke');
  expect(burst.active).toBeLessThanOrEqual(burst.maxPuffs);
  expect(burst.visible).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => window.__d1GameDebug.renderer.performanceStats().calls))
    .toBeLessThanOrEqual(30);

  await D(page, 'requestScreen', 'SCR-SVC-DRINK');
  await expect.poll(() => D(page, 'activeScreen')).toBe('SCR-SVC-DRINK');
  await expect.poll(() => D(page, 'grillSmoke').then(({ visible }) => visible)).toBe(0);
});
