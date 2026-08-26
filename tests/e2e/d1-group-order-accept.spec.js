import { expect, test } from '@playwright/test';

const D = (page, name, ...args) => page.evaluate(({ n, v }) => window.__d1GameDebug[n](...v), { n: name, v: args });

// 동행(그룹) 손님은 말풍선·주문·접수가 그룹 하나로 묶여 있다. 예전에는 생각 시간이 각자
// 굴러가 먼저 준비된 쪽만 눌리는 것처럼 보였는데 접수는 전원 준비를 요구해서, 최대
// (thinkMax - thinkMin)만큼 "눌러도 아무 일도 안 일어나는" 구간이 있었다.
async function seatGroup(page) {
  await page.goto('/src/d1-game.html?day=d4&devUnlock=1&reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  let seq = 0;
  for (let round = 0; round < 6; round += 1) {
    await D(page, 'businessAdvance', 6000);
    const view = await D(page, 'businessView');
    if (view.seats.filter((seat) => seat.occupied && seat.groupId).length >= 2) return;
    for (const order of view.orders) {
      seq += 1;
      await D(page, 'businessDispatch', { type: 'accept-order', intentId: `g:${seq}`, orderId: order.orderId });
      for (const line of order.lines) {
        for (let i = 0; i < (line.quantity ?? 1) - (line.served ?? 0); i += 1) {
          seq += 1;
          await D(page, 'businessDispatch', {
            type: 'serve-item',
            intentId: `g:${seq}`,
            customerId: order.customerIds?.[0] ?? order.customerId,
            menuId: line.menuId,
            quality: 'Perfect',
          });
        }
      }
    }
    await D(page, 'businessAdvance', 20_000);
    for (const seat of (await D(page, 'businessView')).seats.filter((s) => s.cleanupNeeded)) {
      seq += 1;
      await D(page, 'businessDispatch', { type: 'begin-cleanup', intentId: `g:${seq}`, seatId: seat.seatId });
      await D(page, 'businessAdvance', 4000);
    }
  }
  throw new Error('그룹 손님이 등장하지 않았다');
}

const groupSeats = async (page) => (await D(page, 'businessView')).seats
  .filter((seat) => seat.occupied && seat.groupId);

test('동행 손님은 함께 주문 준비를 마치고, 둘 중 아무나 한 번 눌러도 그룹 주문이 접수된다', async ({ page }) => {
  test.setTimeout(180_000);
  await seatGroup(page);

  // 1초씩 진행하며, 한 명이라도 접수 가능해지는 순간 전원이 함께 가능해야 한다.
  let ready = [];
  for (let step = 0; step < 15 && ready.length === 0; step += 1) {
    await D(page, 'businessAdvance', 1000);
    const seats = await groupSeats(page);
    if (seats.some((seat) => seat.canOrder)) {
      ready = seats;
      expect(seats.every((seat) => seat.canOrder), '동행 중 일부만 주문 준비된 구간').toBe(true);
    }
  }
  expect(ready.length, '주문 준비된 동행').toBeGreaterThanOrEqual(2);

  // 두 입력 경로(손님 인물 히트존 · 요리 서빙대 UI 버튼)가 동시에 열려 있어야 한다.
  for (const seat of ready) {
    expect(await D(page, 'screenPosOf', `seatServe:${seat.seatId}`), `${seat.seatId} 손님 히트존`).not.toBeNull();
    await expect(page.getByTestId(`serve-target-${seat.seatId}`)).toBeEnabled();
  }

  // 동행 중 한 명만 눌러도 그룹 주문 전체가 접수된다.
  const position = await D(page, 'screenPosOf', `seatServe:${ready[0].seatId}`);
  await page.mouse.click(position.x, position.y);
  await expect.poll(async () => (await groupSeats(page)).every((seat) => seat.phase === 'waiting'))
    .toBe(true);
  expect((await groupSeats(page)).every((seat) => seat.canOrder === false)).toBe(true);
});
