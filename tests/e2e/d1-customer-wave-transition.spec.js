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

test('츠키오카 퇴장 장면 뒤 직장인 둘은 이전 식기 없이 나란히 붙은 좌석에 나타난다', async ({ page }) => {
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
      canvasWidth: renderer.renderer.domElement.getBoundingClientRect().width,
      actorScaleX: renderer.seatActorMesh[seatId].scale.x,
      actorRenderOrder: renderer.seatActorMesh[seatId].renderOrder,
      seatingRenderOrder: renderer.artMesh.custSeating.renderOrder,
      counterRenderOrder: renderer.artMesh.custCounter.renderOrder,
      foodVisible: renderer.seatBaseMesh[seatId].visible,
      beerVisible: renderer.seatBeerMesh[seatId].visible,
      emptyDishesVisible: renderer.seatEmptyDishMesh[seatId].visible,
    }));
  }, officeSeats.map(({ seatId }) => seatId));

  // 나란히 붙은 좌석에, 서로 겹치지 않게.
  //
  // 픽셀 간격도 좌우 순서도 고정하지 않는다. 좌석 배치(tsukioka ↔ centered-guests)는 자리가 다
  // 비었을 때만 갈리므로(앉아 있는 손님이 순간이동하지 않도록 — d1-seat-layout-stability.spec.js)
  // 이 무리는 앞 손님이 쓰던 배치를 물려받고, 배치마다 좌석 번호와 화면 좌우 순서의 대응이 다르다.
  const seatOrder = officeSeats.map(({ seatId }) => seatId).sort();
  expect(Number(seatOrder[1].slice(-2)) - Number(seatOrder[0].slice(-2))).toBe(1);
  const gapRatio = Math.abs(visual[1].x - visual[0].x) / visual[0].canvasWidth;
  expect(gapRatio).toBeGreaterThan(0.12); // 서로 가리지 않는다
  expect(gapRatio).toBeLessThan(0.75); // 화면 양 끝으로 흩어지지 않는다
  // 둘은 같은 유형이라 같은 크기로 선다(직장인은 전신 표시).
  expect(visual[0].actorScaleX).toBe(visual[1].actorScaleX);
  expect(visual[0].actorScaleX).toBeGreaterThan(0);
  expect(visual.every(({ seatingRenderOrder, actorRenderOrder, counterRenderOrder }) => (
    seatingRenderOrder < actorRenderOrder && actorRenderOrder < counterRenderOrder
  ))).toBe(true);
  expect(visual.every(({ foodVisible, beerVisible, emptyDishesVisible }) => (
    !foodVisible && !beerVisible && !emptyDishesVisible
  ))).toBe(true);
});
