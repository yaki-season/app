import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, name, ...args) => page.evaluate(
  ({ debugName, values }) => window.__d1GameDebug[debugName](...values),
  { debugName: name, values: args },
);

async function bootAndServeTsukioka(page) {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'businessAdvance', 6_000);
  const seat = (await D(page, 'businessView')).seats
    .find(({ customerId }) => customerId === 'REGULAR_TSUKIOKA');
  await D(page, 'businessClickSeat', seat.seatId);
  for (const [menuId, count] of [['beer', 1], ['negima', 2]]) {
    for (let index = 0; index < count; index += 1) {
      expect(await D(page, 'businessDispatch', {
        type: 'serve-item',
        intentId: `wave-transition:${menuId}:${index}`,
        customerId: 'REGULAR_TSUKIOKA',
        menuId,
        quality: 'Perfect',
      })).toMatchObject({ ok: true, applied: true });
    }
  }
  return seat.seatId;
}

test('투명 좌석 포커스 박스 대신 머리 위 주문 표식만 강조한다', async ({ page }) => {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'businessAdvance', 6_000);
  const seat = (await D(page, 'businessView')).seats
    .find(({ customerId }) => customerId === 'REGULAR_TSUKIOKA');
  const target = page.getByTestId(`serve-target-${seat.seatId}`);
  await target.focus();

  expect(await target.evaluate((node) => ({
    outlineStyle: getComputedStyle(node).outlineStyle,
    backgroundColor: getComputedStyle(node).backgroundColor,
  }))).toEqual({ outlineStyle: 'none', backgroundColor: 'rgba(0, 0, 0, 0)' });
  await expect(page.getByTestId(`bubble-${seat.seatId}`)).toHaveAttribute('data-seat-focus', 'true');
});

test('츠키오카 퇴장 장면 뒤 직장인 둘은 이전 식기 없이 중앙 인접 좌석에 나타난다', async ({ page }) => {
  const tsukiokaSeatId = await bootAndServeTsukioka(page);

  await D(page, 'businessAdvanceWithCutscene', 15_000);
  await expect(page.getByTestId('departure-cutscene')).toBeVisible();
  await expect(page.getByTestId('departure-cutscene')).toHaveAttribute(
    'data-scene-id',
    'SCN-D1-TSUKIOKA-DEPARTURE',
  );
  await expect(page.getByTestId('departure-cutscene')).toContainText('뭐, 나쁘지 않군');
  expect((await D(page, 'businessView')).clock.paused).toBe(true);
  expect(await page.evaluate(() => window.__d1GameDebug.renderer.artMesh.custTsukioka.visible)).toBe(true);

  await page.getByTestId('departure-cutscene-continue').click();
  await expect(page.getByTestId('departure-cutscene')).toBeHidden();
  expect((await D(page, 'businessView')).clock.paused).toBe(false);
  expect(await page.evaluate(() => window.__d1GameDebug.renderer.artMesh.custTsukioka.visible)).toBe(false);

  await D(page, 'businessAdvance', 1_000);
  expect(await D(page, 'businessDispatch', {
    type: 'begin-cleanup',
    intentId: 'wave-transition:cleanup',
    seatId: tsukiokaSeatId,
  })).toMatchObject({ ok: true, applied: true });
  await D(page, 'businessAdvance', 3_000);
  await D(page, 'businessAdvanceTo', 100_000);
  await D(page, 'businessAdvance', 6_000);

  const officeSeats = (await D(page, 'businessView')).seats
    .filter(({ customerId }) => customerId?.startsWith('D1-OFFICE'));
  expect(officeSeats).toHaveLength(2);
  const visual = await page.evaluate((seatIds) => {
    const renderer = window.__d1GameDebug.renderer;
    return seatIds.map((seatId) => ({
      seatId,
      x: renderer.projectToScreen(renderer.seatBubbleWorld[seatId]).x,
      actorScaleX: renderer.seatActorMesh[seatId].scale.x,
      actorRenderOrder: renderer.seatActorMesh[seatId].renderOrder,
      seatingRenderOrder: renderer.artMesh.custSeating.renderOrder,
      counterRenderOrder: renderer.artMesh.custCounter.renderOrder,
      foodVisible: renderer.seatBaseMesh[seatId].visible,
      beerVisible: renderer.seatBeerMesh[seatId].visible,
      emptyDishesVisible: renderer.seatEmptyDishMesh[seatId].visible,
    }));
  }, officeSeats.map(({ seatId }) => seatId));

  expect(visual[0].x).toBeLessThan(visual[1].x);
  expect(visual[1].x - visual[0].x).toBeLessThan(360);
  expect(visual.map(({ actorScaleX }) => actorScaleX)).toEqual([1, 1]);
  expect(visual.every(({ seatingRenderOrder, actorRenderOrder, counterRenderOrder }) => (
    seatingRenderOrder < actorRenderOrder && actorRenderOrder < counterRenderOrder
  ))).toBe(true);
  expect(visual.every(({ foodVisible, beerVisible, emptyDishesVisible }) => (
    !foodVisible && !beerVisible && !emptyDishesVisible
  ))).toBe(true);
});
