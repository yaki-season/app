import { test, expect } from '@playwright/test';

const D = (page, fn, ...args) => page.evaluate(
  ({ name, values }) => window.__d1GameDebug[name](...values),
  { name: fn, values: args },
);

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const releaseResponse = await page.request.get('/content/releases/d1-business-day-definition.v1.json');
  expect(releaseResponse.status()).toBe(200);
  expect(releaseResponse.headers()['content-type'] ?? '').toContain('application/json');
  await page.goto('/src/d1-game.html?reset=1');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  expect(await D(page, 'businessSession')).toMatchObject({ ok: true, startedFromS0: true });
  return errors;
}

async function goCustomers(page) {
  await D(page, 'requestScreen', 'SCR-SVC-CUSTOMERS');
  await expect.poll(() => D(page, 'activeScreen')).toBe('SCR-SVC-CUSTOMERS');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
}

async function clickSeat(page, seatId, { holdMs = 0 } = {}) {
  const position = await D(page, 'screenPosOf', `seatServe:${seatId}`);
  if (!position) throw new Error(`조작할 수 없는 좌석: ${seatId}`);
  if (!holdMs) {
    await page.mouse.click(position.x, position.y);
    return;
  }
  await page.mouse.move(position.x, position.y);
  await page.mouse.down();
  await D(page, 'businessAdvance', holdMs);
  await page.mouse.up();
}

async function customerSeat(page, customerId) {
  return expect.poll(async () => {
    const seat = (await D(page, 'businessView')).seats.find(
      (item) => item.customerId === customerId,
    );
    return seat?.seatId ?? null;
  }).not.toBeNull().then(async () => {
    const view = await D(page, 'businessView');
    return view.seats.find((item) => item.customerId === customerId).seatId;
  });
}

async function accept(page, customerId) {
  const seatId = await customerSeat(page, customerId);
  await page.waitForTimeout(230);
  await clickSeat(page, seatId);
  await expect.poll(async () => {
    const seat = (await D(page, 'businessView')).seats.find((item) => item.seatId === seatId);
    return seat?.canServe ?? false;
  }).toBe(true);
  return seatId;
}

async function serve(page, seatId, menu, index) {
  const id = await D(page, 'dockAdd', {
    menu,
    label: 'Perfect',
    good: true,
  });
  await page.getByTestId(`dock-item-${id}`).click();
  await page.waitForTimeout(230);
  await clickSeat(page, seatId);
  await expect(page.getByTestId('serve-quantity')).toBeVisible();
  await page.getByTestId('serve-one').click();
  await expect.poll(() => D(page, 'dockItems').then(
    (items) => !items.some((item) => item.id === id),
  )).toBe(true);
  return index;
}

async function cleanup(page, seatIds) {
  for (const seatId of seatIds) {
    await expect.poll(async () => {
      const seat = (await D(page, 'businessView')).seats.find((item) => item.seatId === seatId);
      return seat?.cleanupNeeded ?? false;
    }).toBe(true);
    await clickSeat(page, seatId, { holdMs: 3000 });
  }
}

test('실제 정적 release 무주입 6석 조작으로 7분 D1 전체 영업→정산 5단계→단일 저장→D2를 완주한다', async ({ page }) => {
  const errors = await boot(page);
  await goCustomers(page);

  const initial = await D(page, 'businessView');
  expect(initial.clock.targetMs).toBe(420_000);
  expect(initial.clock.targetMs).toBeLessThanOrEqual(480_000);
  expect(initial.seats).toHaveLength(6);

  // 츠키오카: 주문 접수 → 생맥주 부분 제공 → 네기마 최종 제공 → 식사·퇴장 → 3초 정리.
  await D(page, 'businessAdvance', 6000);
  const tsukioka = await accept(page, 'REGULAR_TSUKIOKA');
  await serve(page, tsukioka, '생맥주', 1);
  await expect.poll(() => D(page, 'businessView').then((view) => (
    view.orders.find((order) => order.orderId === 'D1-ORDER-001').lines[0].served
  ))).toBe(1);
  await serve(page, tsukioka, '네기마', 1);
  await serve(page, tsukioka, '네기마', 2);
  await D(page, 'businessAdvance', 16_000);
  await cleanup(page, [tsukioka]);

  // 100초 파동: 두 엑스트라가 동시에 입장·주문한다. 정식 아트 전 stable ID placeholder를 명시한다.
  await D(page, 'businessAdvanceTo', 100_000);
  await D(page, 'businessAdvance', 6000);
  const officeA = await accept(page, 'D1-OFFICE-A');
  const officeB = await accept(page, 'D1-OFFICE-B');
  for (const seatId of [officeA, officeB]) {
    const bubble = page.getByTestId(`bubble-${seatId}`);
    await expect(bubble).not.toHaveAttribute('data-placeholder');
    await expect(bubble).toHaveAttribute('data-required-asset-id', 'CH-EXTRA-COMMUTER-SERVICE');
    await expect.poll(() => page.evaluate((id) => {
      const actor = window.__d1GameDebug.renderer.seatActorMesh[id];
      return {
        visible: actor?.visible ?? false,
        src: actor?.material?.map?.image?.currentSrc ?? actor?.material?.map?.image?.src ?? '',
      };
    }, seatId)).toMatchObject({
      visible: true,
      src: expect.stringContaining('ch-extra-commuter-service-r4-b1.png'),
    });
    await serve(page, seatId, '생맥주', 1);
    await serve(page, seatId, '네기마', 1);
  }
  await D(page, 'businessAdvance', 16_000);
  await cleanup(page, [officeA, officeB]);

  // 220초 파동: 혼자 온 엑스트라.
  await D(page, 'businessAdvanceTo', 220_000);
  await D(page, 'businessAdvance', 6000);
  const solo = await accept(page, 'D1-SOLO-A');
  await expect(page.getByTestId(`bubble-${solo}`))
    .toHaveAttribute('data-required-asset-id', 'CH-EXTRA-SOLO-SERVICE');
  await serve(page, solo, '네기마', 1);
  await D(page, 'businessAdvance', 16_000);
  await cleanup(page, [solo]);

  // 7분 마감 뒤 잔여 주문 drain 완료 상태에서만 숯불을 낮출 수 있다.
  await D(page, 'businessAdvanceTo', 420_000);
  await expect.poll(() => D(page, 'businessView').then((view) => view.phase)).toBe('charcoal-down');
  await expect(page.getByTestId('post-business-panel')).toBeVisible();
  await expect(page.getByTestId('post-business-action')).toHaveText('숯불 낮추기');
  await page.getByTestId('post-business-action').click();
  await expect.poll(() => D(page, 'businessView').then((view) => view.phase)).toBe('settlement');
  const golden = (await D(page, 'businessView')).settlement.summary;
  expect(golden).toMatchObject({
    customers: { visited: 4, lost: 0, cleanedSeats: 4 },
    orders: { accepted: 4, completed: 4, abandoned: 0 },
    quality: { Perfect: 8, Good: 0, OK: 0, Fail: 0 },
    economy: { revenue: 33, tip: 8, total: 41, reputation: 12 },
  });
  expect(golden.operations.elapsedMs).toBeGreaterThanOrEqual(245_000);
  expect(golden.operations.elapsedMs).toBeLessThan(250_000);

  // 같은 intent가 두 번 도착해도 첫 단계가 중복 공개되지 않는다.
  const duplicateIntent = {
    type: 'reveal-settlement-step',
    intentId: 'e2e:duplicate:settlement-step-1',
  };
  expect(await D(page, 'businessDispatch', duplicateIntent)).toMatchObject({
    ok: true,
    applied: true,
  });
  expect(await D(page, 'businessDispatch', duplicateIntent)).toMatchObject({
    ok: true,
    applied: false,
    duplicate: true,
  });
  expect((await D(page, 'businessView')).settlement.revealedSteps).toHaveLength(1);

  for (let step = 1; step < 5; step += 1) {
    await page.getByTestId('post-business-action').click();
  }
  await expect.poll(() => D(page, 'businessView').then(
    (view) => view.settlement.revealedSteps.length,
  )).toBe(5);
  await expect(page.getByTestId('post-business-action')).toContainText('D1 보상 저장');
  await page.getByTestId('post-business-action').click();

  await expect.poll(() => D(page, 'businessView').then((view) => view.phase)).toBe('complete');
  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await expect(page.getByTestId('result-message')).toContainText('D2 저장 완료');
  expect(await D(page, 'campaignState')).toMatchObject({
    campaign: {
      nodeId: 'd2',
      phase: 'pre-open',
      completedDayIds: ['d1'],
    },
    economy: {
      balance: 41,
      reputation: 12,
      settlements: [expect.objectContaining({ completionId: expect.any(String) })],
    },
  });

  // 완료 버튼/transport 재입력도 같은 보상을 두 번 commit하지 않는다.
  expect(await D(page, 'businessFinalize')).toMatchObject({ ok: true, duplicate: true });
  expect((await D(page, 'campaignState')).economy.settlements).toHaveLength(1);

  await page.goto('/src/d1-game.html?resume=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  expect(await D(page, 'businessSession')).toMatchObject({
    ok: true,
    completed: true,
    resumed: true,
  });
  expect(await D(page, 'campaignState')).toMatchObject({
    campaign: { nodeId: 'd2', completedDayIds: ['d1'] },
    economy: { balance: 41, reputation: 12 },
  });
  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await page.getByTestId('continue-button').click();
  await expect(page).toHaveURL(/\/src\/s0-d3\.html$/);
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D2-PREOPEN');
  await expect.poll(() => page.evaluate(() => window.__s0d3Debug?.campaignState?.()?.campaign?.nodeId)).toBe('d2');
  for (let index = 0; index < 3; index += 1) {
    await page.locator('#actions button.primary').click();
  }
  await expect(page).toHaveURL(/\/src\/d1-game\.html\?day=d2$/);
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessReady?.())).toBe(true);
  await expect(page.getByTestId('momo-prep')).toBeVisible();
  await page.getByTestId('momo-prep').click();
  await expect(page.getByTestId('dock-shelf')).toContainText('모모');
  expect(errors).toEqual([]);
});

test('영업 중 새로고침은 day-start D1로 복구하고 중복 제공 입력을 한 번만 반영한다', async ({ page }) => {
  const errors = await boot(page);
  await goCustomers(page);
  await D(page, 'businessAdvance', 6000);
  const tsukioka = await accept(page, 'REGULAR_TSUKIOKA');
  await serve(page, tsukioka, '생맥주', 1);

  const duplicateServe = {
    type: 'serve-item',
    intentId: 'e2e:duplicate:serve',
    seatId: tsukioka,
    menu: '네기마',
    quality: 'Perfect',
  };
  expect(await D(page, 'businessDispatch', duplicateServe)).toMatchObject({ ok: true, applied: true });
  expect(await D(page, 'businessDispatch', duplicateServe)).toMatchObject({
    ok: true,
    applied: false,
    duplicate: true,
  });
  expect((await D(page, 'businessView')).orders[0].lines[1].served).toBe(1);

  await page.reload();
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  const restored = await D(page, 'businessView');
  expect(restored).toMatchObject({
    phase: 'open',
    clock: { elapsedMs: expect.any(Number) },
    orders: [{
      orderId: 'D1-ORDER-001',
      status: 'unaccepted',
      lines: [
        { menuId: 'beer', served: 0 },
        { menuId: 'negima', served: 0 },
      ],
    }],
  });
  expect(restored.clock.elapsedMs).toBeLessThan(1000);
  expect(errors).toEqual([]);
});
