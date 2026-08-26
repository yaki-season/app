// 사라다는 꼬치가 아니다. 사라다만 받은 손님이 꼬치를 먹는 그림이 되면 안 된다.
// 접시는 카운터 위에 놓이고, 사람은 대기 자세로 남아야 한다.
import { expect, test } from '@playwright/test';

const D = (page, name, ...args) => page.evaluate(
  ({ n, v }) => window.__d1GameDebug[n](...v),
  { n: name, v: args },
);

const actorSource = (page, seatId) => page.evaluate((id) => {
  const mesh = window.__d1GameDebug.renderer.seatActorMesh[id];
  return (mesh?.material?.map?.image?.currentSrc ?? mesh?.material?.map?.image?.src ?? '')
    .split('/')
    .pop();
}, seatId);

// 사라다가 주문에 들어 있는 엑스트라 손님이 나올 때까지 앞 파동을 처리한다.
async function seatSaladCustomer(page) {
  let seq = 0;
  for (let round = 0; round < 8; round += 1) {
    await D(page, 'businessAdvance', 6_000);
    const view = await D(page, 'businessView');
    const saladSeat = view.seats.find((seat) => seat.occupied
      && seat.customerId !== 'REGULAR_TSUKIOKA'
      && (seat.remainingItems ?? []).some((item) => item.menuId === 'cabbage-salad'));
    if (saladSeat) {
      for (let step = 0; step < 15; step += 1) {
        const current = (await D(page, 'businessView')).seats
          .find((seat) => seat.seatId === saladSeat.seatId);
        if (current?.canOrder) break;
        await D(page, 'businessAdvance', 1_000);
      }
      seq += 1;
      await D(page, 'businessDispatch', {
        type: 'accept-order', intentId: `salad:${seq}`, orderId: saladSeat.orderId,
      });
      return saladSeat;
    }
    for (const order of view.orders) {
      seq += 1;
      await D(page, 'businessDispatch', { type: 'accept-order', intentId: `salad:${seq}`, orderId: order.orderId });
      for (const line of order.lines) {
        for (let i = 0; i < (line.quantity ?? 1) - (line.served ?? 0); i += 1) {
          seq += 1;
          await D(page, 'businessDispatch', {
            type: 'serve-item',
            intentId: `salad:${seq}`,
            customerId: order.customerIds?.[0] ?? order.customerId,
            menuId: line.menuId,
            quality: 'Perfect',
          });
        }
      }
    }
    await D(page, 'businessAdvance', 20_000);
    for (const seat of (await D(page, 'businessView')).seats.filter((item) => item.cleanupNeeded)) {
      seq += 1;
      await D(page, 'businessDispatch', { type: 'begin-cleanup', intentId: `salad:${seq}`, seatId: seat.seatId });
      await D(page, 'businessAdvance', 4_000);
    }
  }
  throw new Error('사라다를 주문한 엑스트라 손님이 나오지 않았다');
}

test('사라다만 받은 손님은 꼬치를 먹지 않고 대기 자세로 남는다', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/src/d1-game.html?day=d4&devUnlock=1&reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);

  const seat = await seatSaladCustomer(page);
  const waitingSource = await actorSource(page, seat.seatId);
  expect(waitingSource, '대기 라스터').toMatch(/-waiting-/);

  const served = await D(page, 'businessDispatch', {
    type: 'serve-item',
    intentId: 'salad:serve',
    customerId: seat.customerId,
    menuId: 'cabbage-salad',
    quality: 'Perfect',
  });
  expect(served).toMatchObject({ ok: true, applied: true });
  await D(page, 'businessAdvance', 500);

  // 사라다만 받았으니 사람은 그대로 대기 자세다.
  await expect.poll(() => actorSource(page, seat.seatId)).toBe(waitingSource);
  expect(await actorSource(page, seat.seatId)).not.toMatch(/eating/);

  // 접시는 카운터 위에 실제로 놓인다.
  expect(await page.evaluate((id) => window.__d1GameDebug.renderer.seatSaladMesh?.[id]?.visible ?? null, seat.seatId))
    .toBe(true);
});
