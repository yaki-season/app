import { test, expect } from '@playwright/test';

// D3는 앞선 이틀을 마쳐야 열린다. 런타임에 이미 있는 개발 해금 경로(?devUnlock=1)로 그 상태를
// 만들어 들어간다 — 저장 파일을 손으로 빚어 넣는 것보다 실제 경로에 가깝다.
async function openD3(page) {
  await page.goto('/src/d1-game.html?day=d3&devUnlock=1&reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
}

test('D3 8명·7주문·16항목을 정리와 정산까지 완주한다', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openD3(page);

  // 첫 손님의 타레 모모는 이야기가 걸려 있어 뽑기에서 제외된다.
  const firstOrder = await page.evaluate(() => window.__d1GameDebug.businessView().orders[0]);
  expect(firstOrder.lines[0]).toMatchObject({ menuId: 'momo' });

  const result = await page.evaluate(async () => {
    const D = window.__d1GameDebug;
    let event = 0;
    const dispatch = (type, fields) => D.businessDispatch({ type, intentId: `d3:e2e:${event += 1}`, ...fields });

    const allDone = () => {
      const view = D.businessView();
      return view.orders.length > 0
        && view.orders.every((order) => ['completed', 'failed', 'abandoned'].includes(order.status))
        && view.seats.every((seat) => !seat.occupied && !seat.cleanupNeeded);
    };

    for (let step = 0; step < 60; step += 1) {
      D.businessAdvance(6_000);
      const view = D.businessView();
      for (const order of view.orders) {
        if (order.status === 'unaccepted') dispatch('accept-order', { orderId: order.orderId });
      }
      for (const order of view.orders) {
        const seat = view.seats.find((item) => item.orderId === order.orderId && item.customerId);
        if (!seat) continue;
        for (const line of order.lines) {
          for (let index = 0; index < line.remaining; index += 1) {
            dispatch('serve-item', { customerId: seat.customerId, menuId: line.menuId, quality: 'Perfect' });
          }
        }
      }
      // UI 홀드 대신 도메인 명령으로 치운다. 화면 쪽 홀드는 한 자리씩만 잡혀 여러 자리가
      // 동시에 더러워지는 D3에서는 진행이 막힌다.
      for (const seat of D.businessView().seats) {
        if (seat.cleanupNeeded) dispatch('begin-cleanup', { seatId: seat.seatId });
      }
      D.businessAdvance(3_000);
      if (allDone() && D.businessView().clock.arrivalsClosed) break;
    }

    D.businessAdvanceTo(420_000);
    for (let guard = 0; guard < 12 && D.businessView().seats.some((item) => item.cleanupNeeded); guard += 1) {
      for (const seat of D.businessView().seats) {
        if (seat.cleanupNeeded) dispatch('begin-cleanup', { seatId: seat.seatId });
      }
      D.businessAdvance(3_000);
    }
    await D.businessPostAction();
    for (let index = 0; index < 5; index += 1) await D.businessPostAction();
    return { view: D.businessView(), audio: D.audioState() };
  });

  expect(result.view.phase, JSON.stringify(result.view.settlement)).toBe('settlement');
  expect(result.view.settlement.summary).toMatchObject({
    customers: { visited: 8 },
    orders: { accepted: 7, completed: 7 },
  });
  expect(result.view.settlement.ready).toBe(true);
  expect(errors).toEqual([]);
});
