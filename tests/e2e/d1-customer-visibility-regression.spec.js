import { expect, test } from '@playwright/test';

// 고정 인물 츠키오카는 승인 아트 레이어(custTsukioka)가 렌더하고 일반 좌석 액터는 숨는다.
// 액체/VFX 가시성 갱신이 빈 좌석 액터를 되살리지 않는지, 그리고 아트 레이어가 점유를 따르는지 함께 본다.
test('액체/VFX 가시성 갱신이 빈 좌석 손님을 다시 표시하지 않는다', async ({ page }) => {
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessReady())).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-CUSTOMERS'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
  await page.waitForTimeout(1_000); // 여러 rAF·영업 render 주기를 통과한다.

  const snapshot = await page.evaluate(() => {
    const debug = window.__d1GameDebug;
    const seats = debug.businessView().seats;
    const occupied = seats.filter((seat) => seat.occupied).map((seat) => seat.seatId).sort();
    const ghostActors = Object.entries(debug.renderer.seatActorMesh)
      .filter(([seatId, mesh]) => mesh.visible && !occupied.includes(seatId))
      .map(([seatId]) => seatId);
    const tsukiokaSeat = seats.find((seat) => seat.customerId === 'REGULAR_TSUKIOKA');
    return {
      ghostActors,
      tsukiokaOccupied: !!tsukiokaSeat?.occupied,
      tsukiokaArtVisible: debug.renderer.artMesh.custTsukioka.visible,
    };
  });
  expect(snapshot.ghostActors).toEqual([]);
  expect(snapshot.tsukiokaArtVisible).toBe(snapshot.tsukiokaOccupied);
});

test('120개 연속 프레임에서 유령 손님과 빈 그릴 네기마가 나타나지 않는다', async ({ page }) => {
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessReady())).toBe(true);

  const customerGhosts = await page.evaluate(async () => {
    const debug = window.__d1GameDebug;
    const violations = [];
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise(requestAnimationFrame);
      const occupied = new Set(debug.businessView().seats.filter((seat) => seat.occupied).map((seat) => seat.seatId));
      const ghosts = Object.entries(debug.renderer.seatActorMesh)
        .filter(([seatId, mesh]) => mesh.visible && !occupied.has(seatId))
        .map(([seatId]) => seatId);
      if (ghosts.length) violations.push({ frame, ghosts });
    }
    return violations;
  });
  expect(customerGhosts).toEqual([]);

  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-GRILL'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
  const grillGhosts = await page.evaluate(async () => {
    const debug = window.__d1GameDebug;
    const violations = [];
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise(requestAnimationFrame);
      const slots = debug.cookSlots();
      const ghosts = slots.flatMap((slot, index) => (
        debug.renderer.objectMesh[`pgSlot${index}`]?.visible && slot.status === 'empty' ? [index] : []
      ));
      if (ghosts.length) violations.push({ frame, ghosts });
    }
    return violations;
  });
  expect(grillGhosts).toEqual([]);
});

test('D1 ?reset=1 새로고침은 진행 중 영업을 초기 구간으로 되돌린다', async ({ page }) => {
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessReady())).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.businessAdvance(6_000));
  const elapsedBeforeReset = await page.evaluate(
    () => window.__d1GameDebug.businessView().clock.elapsedMs,
  );
  expect(elapsedBeforeReset).toBeGreaterThanOrEqual(6_000);

  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessReady())).toBe(true);
  const elapsedAfterReset = await page.evaluate(
    () => window.__d1GameDebug.businessView().clock.elapsedMs,
  );
  // businessReady 관찰 뒤에도 실제 영업 루프는 계속 흐른다. 정확히 0ms를 요구하면
  // 브라우저 프레임 타이밍에 따라 실패하므로 첫 1초 이내로 복귀했는지를 검증한다.
  expect(elapsedAfterReset).toBeLessThan(1_000);
  expect(elapsedAfterReset).toBeLessThan(elapsedBeforeReset);
});

// 좌석 손님은 츠키오카와 같은 z(LAYER_Z.actor)에 놓인 풀프레임 레이어다. 깊이 버퍼를 켜두면
// 완전히 겹친 투명 평면들이 GPU마다 다른 정밀도로 z-fighting을 일으켜 손님이 지지직거린다.
// 츠키오카 아트 레이어와 같은 계약(깊이 미사용 + 고정 renderOrder)인지 고정한다.
test('좌석 손님 레이어는 아트 레이어와 같은 깊이 계약을 쓴다', async ({ page }) => {
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessReady())).toBe(true);

  const layers = await page.evaluate(() => {
    const { renderer } = window.__d1GameDebug;
    const tsukioka = renderer.artMesh.custTsukioka;
    return {
      tsukioka: {
        depthTest: tsukioka.material.depthTest,
        depthWrite: tsukioka.material.depthWrite,
        renderOrder: tsukioka.renderOrder,
      },
      actors: Object.entries(renderer.seatActorMesh).map(([seatId, mesh]) => ({
        seatId,
        depthTest: mesh.material.depthTest,
        depthWrite: mesh.material.depthWrite,
        renderOrder: mesh.renderOrder,
      })),
    };
  });

  expect(layers.tsukioka).toMatchObject({ depthTest: false, depthWrite: false });
  for (const actor of layers.actors) {
    expect(actor.depthTest, `${actor.seatId} depthTest`).toBe(false);
    expect(actor.depthWrite, `${actor.seatId} depthWrite`).toBe(false);
    // 의자 등받이(10) 뒤가 아니라 앞, 카운터 상판(50) 뒤를 유지한다.
    expect(actor.renderOrder).toBeGreaterThanOrEqual(layers.tsukioka.renderOrder);
    expect(actor.renderOrder).toBeLessThan(50);
  }
  // 손님끼리의 그리기 순서도 프레임 정렬에 맡기지 않고 좌석마다 고정한다.
  const orders = layers.actors.map(({ renderOrder }) => renderOrder);
  expect(new Set(orders).size).toBe(orders.length);
});
