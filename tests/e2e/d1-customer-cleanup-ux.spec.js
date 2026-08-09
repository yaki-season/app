import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, name, ...args) => page.evaluate(
  ({ debugName, values }) => window.__d1GameDebug[debugName](...values),
  { debugName: name, values: args },
);

async function serveTsukiokaOrder(page) {
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
        intentId: `cleanup-ux:${menuId}:${index}`,
        customerId: 'REGULAR_TSUKIOKA',
        menuId,
        quality: 'Perfect',
      })).toMatchObject({ ok: true, applied: true });
    }
  }
  return seat.seatId;
}

test('퇴장한 손님은 사라지고 식기 위 정리 홀드가 원형 게이지로 진행된다', async ({ page }) => {
  const seatId = await serveTsukiokaOrder(page);

  await D(page, 'businessAdvance', 15_000);
  await expect.poll(() => D(page, 'businessView').then(
    (view) => view.seats.find((seat) => seat.seatId === seatId).phase,
  )).toBe('leaving');
  await expect.poll(() => page.evaluate((id) => {
    const debug = window.__d1GameDebug;
    const seat = debug.businessView().seats.find((item) => item.seatId === id);
    return {
      occupied: seat.occupied,
      tsukiokaVisible: debug.renderer.artMesh.custTsukioka.visible,
      actorVisible: debug.renderer.seatActorMesh[id].visible,
      emptyDishesVisible: debug.renderer.seatEmptyDishMesh[id].visible,
    };
  }, seatId)).toEqual({
    occupied: false,
    tsukiokaVisible: false,
    actorVisible: false,
    emptyDishesVisible: true,
  });

  await D(page, 'businessAdvance', 1_000);
  await expect.poll(() => D(page, 'businessView').then(
    (view) => view.seats.find((seat) => seat.seatId === seatId).cleanupNeeded,
  )).toBe(true);

  const ring = page.getByTestId(`cleanup-progress-${seatId}`);
  await expect(ring).toBeVisible();
  await expect(ring).toHaveAttribute('role', 'progressbar');
  await expect(ring).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByTestId(`bubble-${seatId}`)).toBeHidden();

  const target = page.getByTestId(`serve-target-${seatId}`);
  const box = await target.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await D(page, 'businessAdvance', 1_500);

  await expect(ring).toHaveAttribute('data-active', 'true');
  await expect(ring).toHaveAttribute('aria-valuenow', '50');
  const cleanupOverlay = await page.evaluate((id) => {
    const debug = window.__d1GameDebug;
    const mesh = debug.renderer.seatCleanupOverlayMesh[id];
    mesh.updateWorldMatrix(true, false);
    const canvas = document.querySelector('[data-testid="scene-canvas"]').getBoundingClientRect();
    const positions = mesh.geometry.attributes.position;
    const ys = Array.from({ length: positions.count }, (_, index) => {
      const point = new debug.renderer.camera.position.constructor(
        positions.getX(index),
        positions.getY(index),
        positions.getZ(index),
      ).applyMatrix4(mesh.matrixWorld).project(debug.renderer.camera);
      return canvas.top + (-point.y * 0.5 + 0.5) * canvas.height;
    });
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    return {
      visible: mesh.visible,
      normalizedCenterY: (centerY - canvas.top) / canvas.height,
    };
  }, seatId);
  expect(cleanupOverlay.visible).toBe(true);
  expect(cleanupOverlay.normalizedCenterY).toBeCloseTo(774 / 1080, 3);

  await D(page, 'businessAdvance', 1_500);
  await page.mouse.up();
  await expect.poll(() => D(page, 'businessView').then(
    (view) => view.seats.find((seat) => seat.seatId === seatId).phase,
  )).toBe('empty');
  await expect(ring).toBeHidden();
  expect(await page.evaluate((id) => {
    const renderer = window.__d1GameDebug.renderer;
    return {
      emptyDishesVisible: renderer.seatEmptyDishMesh[id].visible,
      cleanupOverlayVisible: renderer.seatCleanupOverlayMesh[id].visible,
    };
  }, seatId)).toEqual({ emptyDishesVisible: false, cleanupOverlayVisible: false });
});
