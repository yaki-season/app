import { expect, test } from '@playwright/test';

async function meshScreenRect(page, meshName, seatId) {
  return page.evaluate(({ meshName: targetName, seatId: targetSeatId }) => {
    const renderer = window.__d1GameDebug.renderer;
    const mesh = renderer[targetName][targetSeatId];
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    const points = [
      [bounds.min.x, bounds.min.y],
      [bounds.min.x, bounds.max.y],
      [bounds.max.x, bounds.min.y],
      [bounds.max.x, bounds.max.y],
    ].map(([x, y]) => {
      const point = bounds.min.clone().set(x, y, 0);
      mesh.localToWorld(point);
      return renderer.projectToScreen(point);
    });
    const xs = points.map(({ x }) => x);
    const ys = points.map(({ y }) => y);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      viewportWidth: window.innerWidth,
      visible: mesh.visible,
    };
  }, { meshName, seatId });
}

test('사라다는 단독일 때 작게 놓이고 꼬치와 동시 제공되면 꼬치 아래·잔 왼쪽에 놓인다', async ({ page }) => {
  await page.goto('/src/d1-game.html?day=d4&devUnlock=1&reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);

  const firstSeatId = await page.evaluate(() => {
    const debug = window.__d1GameDebug;
    debug.businessAdvance(6_000);
    const view = debug.businessView();
    const seat = view.seats.find((item) => item.orderId === 'D4-ORDER-001');
    debug.businessDispatch({ type: 'accept-order', intentId: 'd4:layout:1', orderId: 'D4-ORDER-001' });
    debug.businessDispatch({
      type: 'serve-item', intentId: 'd4:layout:2',
      customerId: seat.customerId, menuId: 'cabbage-salad', quality: null,
    });
    return seat.seatId;
  });
  await expect.poll(() => page.evaluate((seatId) => (
    window.__d1GameDebug.renderer.seatSaladMesh[seatId]?.visible === true
  ), firstSeatId)).toBe(true);

  const singleSalad = await meshScreenRect(page, 'seatSaladMesh', firstSeatId);
  expect(singleSalad.visible).toBe(true);
  expect(singleSalad.width / singleSalad.viewportWidth).toBeGreaterThan(120 / 1920);
  expect(singleSalad.width / singleSalad.viewportWidth).toBeLessThan(140 / 1920);

  await page.evaluate(() => {
    window.__d1GameDebug.businessDispatch({
      type: 'serve-item', intentId: 'd4:layout:3',
      customerId: 'REGULAR_TSUKIOKA', menuId: 'highball', quality: 'Perfect',
    });
  });
  await expect.poll(() => page.evaluate((seatId) => {
    const mesh = window.__d1GameDebug.renderer.seatBeerMesh[seatId];
    return mesh?.material?.map?.image?.currentSrc || mesh?.material?.map?.image?.src || '';
  }, firstSeatId)).toContain('/assets/campaign/d4/pr-served-highball-glass-r2-b1.png');

  const pairSeatId = await page.evaluate(() => {
    const debug = window.__d1GameDebug;
    debug.businessAdvance(90_000);
    const view = debug.businessView();
    const seat = view.seats.find((item) => item.orderId === 'D4-ORDER-002');
    debug.businessDispatch({ type: 'accept-order', intentId: 'd4:layout:4', orderId: 'D4-ORDER-002' });
    debug.businessDispatch({
      type: 'serve-item', intentId: 'd4:layout:5',
      customerId: seat.customerId, menuId: 'momo', quality: 'Perfect',
    });
    debug.businessDispatch({
      type: 'serve-item', intentId: 'd4:layout:6',
      customerId: seat.customerId, menuId: 'cabbage-salad', quality: null,
    });
    return seat.seatId;
  });
  await expect.poll(() => page.evaluate((seatId) => {
    const renderer = window.__d1GameDebug.renderer;
    return renderer.seatSaladMesh[seatId]?.visible === true
      && renderer.seatBaseMesh[seatId]?.visible === true;
  }, pairSeatId)).toBe(true);

  const [pairedSalad, pairedSkewer, pairedBeer] = await Promise.all([
    meshScreenRect(page, 'seatSaladMesh', pairSeatId),
    meshScreenRect(page, 'seatBaseMesh', pairSeatId),
    meshScreenRect(page, 'seatBeerMesh', pairSeatId),
  ]);
  const saladCenterY = (pairedSalad.top + pairedSalad.bottom) / 2;
  const skewerCenterY = (pairedSkewer.top + pairedSkewer.bottom) / 2;
  const saladCenterX = (pairedSalad.left + pairedSalad.right) / 2;
  const beerCenterX = (pairedBeer.left + pairedBeer.right) / 2;
  expect(saladCenterY).toBeGreaterThan(skewerCenterY);
  expect(pairedSalad.top).toBeGreaterThan(pairedSkewer.top + (pairedSkewer.height * 0.65));
  expect(saladCenterX).toBeLessThan(beerCenterX);
  expect(pairedSalad.width).toBeLessThan(pairedSkewer.width);
  expect(pairedSkewer.width / pairedSalad.width).toBeLessThan(1.6);
  expect(pairedSalad.width).toBeLessThan(singleSalad.width);
});
