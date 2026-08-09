import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, name, ...args) => page.evaluate(
  ({ debugName, values }) => window.__d1GameDebug[debugName](...values),
  { debugName: name, values: args },
);

async function servingPropSnapshot(page, seatId) {
  return page.evaluate((id) => {
    const runtime = window.__d1GameDebug.renderer;
    const rectOf = (mesh) => {
      mesh.updateWorldMatrix(true, false);
      const positions = mesh.geometry.attributes.position;
      const canvas = document.querySelector('[data-testid="scene-canvas"]').getBoundingClientRect();
      const points = Array.from({ length: positions.count }, (_, index) => {
        const point = new runtime.camera.position.constructor(
          positions.getX(index),
          positions.getY(index),
          positions.getZ(index),
        ).applyMatrix4(mesh.matrixWorld).project(runtime.camera);
        return {
          x: canvas.left + (point.x * 0.5 + 0.5) * canvas.width,
          y: canvas.top + (-point.y * 0.5 + 0.5) * canvas.height,
        };
      });
      const xs = points.map(({ x }) => x);
      const ys = points.map(({ y }) => y);
      return {
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      };
    };
    const food = runtime.seatBaseMesh[id];
    const beer = runtime.seatBeerMesh[id];
    return {
      foodVisible: food.visible,
      beerVisible: beer.visible,
      foodRect: rectOf(food),
      beerRect: rectOf(beer),
    };
  }, seatId);
}

test('제공된 음식·맥주만 표시하고 음용 프레임에서는 테이블 잔을 숨긴다', async ({ page }) => {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'businessAdvance', 6_000);

  const view = await D(page, 'businessView');
  const seat = view.seats.find(({ customerId }) => customerId === 'REGULAR_TSUKIOKA');
  expect(seat).toBeTruthy();
  await D(page, 'businessClickSeat', seat.seatId);

  let props = await page.evaluate((seatId) => {
    const renderer = window.__d1GameDebug.renderer;
    return {
      foodVisible: renderer.seatBaseMesh[seatId].visible,
      beerVisible: renderer.seatBeerMesh[seatId].visible,
    };
  }, seat.seatId);
  expect(props).toEqual({ foodVisible: false, beerVisible: false });

  expect(await D(page, 'businessDispatch', {
    type: 'serve-item',
    intentId: 'customer-props:beer',
    customerId: 'REGULAR_TSUKIOKA',
    menuId: 'beer',
    quality: 'Perfect',
  })).toMatchObject({ ok: true, applied: true });
  props = await page.evaluate((seatId) => {
    const renderer = window.__d1GameDebug.renderer;
    return {
      foodVisible: renderer.seatBaseMesh[seatId].visible,
      beerVisible: renderer.seatBeerMesh[seatId].visible,
    };
  }, seat.seatId);
  expect(props).toEqual({ foodVisible: false, beerVisible: false });

  for (let index = 0; index < 2; index += 1) {
    expect(await D(page, 'businessDispatch', {
      type: 'serve-item',
      intentId: `customer-props:negima:${index}`,
      customerId: 'REGULAR_TSUKIOKA',
      menuId: 'negima',
      quality: 'Perfect',
    })).toMatchObject({ ok: true, applied: true });
  }

  await expect.poll(async () => (
    await page.evaluate((seatId) => window.__d1GameDebug.renderer.seatBaseMesh[seatId].visible, seat.seatId)
  )).toBe(true);
  await expect.poll(async () => (
    await page.evaluate((seatId) => window.__d1GameDebug.renderer.seatBeerMesh[seatId].visible, seat.seatId)
  ), { timeout: 2_500 }).toBe(true);
  const visibleProps = await servingPropSnapshot(page, seat.seatId);
  expect(visibleProps.foodRect.width / visibleProps.foodRect.canvasWidth).toBeCloseTo(260 / 1920, 2);
  expect(visibleProps.foodRect.height / visibleProps.foodRect.canvasHeight).toBeCloseTo(156 / 1080, 2);
  expect(visibleProps.beerRect.width / visibleProps.beerRect.canvasWidth).toBeCloseTo(165 / 1920, 2);
  expect(visibleProps.beerRect.height / visibleProps.beerRect.canvasHeight).toBeCloseTo(165 / 1080, 2);
  await expect.poll(async () => (
    await page.evaluate((seatId) => window.__d1GameDebug.renderer.seatBeerMesh[seatId].visible, seat.seatId)
  ), { timeout: 2_500 }).toBe(false);
});
