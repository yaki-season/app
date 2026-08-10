// 자리를 치우는 순간 앉아 있던 손님이 옆으로 순간이동하던 회귀를 막는다.
//
// 좌석 배치(tsukioka ↔ centered-guests)를 바꾸면 여섯 자리 좌표가 전부 다시 잡힌다.
// 츠키오카가 빠지는 순간 배치를 갈아 끼우면, 그때 앉아 있던 손님들이 그 자리에서 밀려난다.
import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, name, ...args) => page.evaluate(
  ({ debugName, values }) => window.__d1GameDebug[debugName](...values),
  { debugName: name, values: args },
);

const seatPositions = (page) => page.evaluate(() => {
  const renderer = window.__d1GameDebug.renderer;
  const view = window.__d1GameDebug.businessView();
  return view.seats
    .filter((seat) => seat.occupied)
    .map((seat) => {
      const actor = renderer.seatActorMesh[seat.seatId];
      return { seatId: seat.seatId, x: actor.position.x, y: actor.position.y };
    });
});

test('앉아 있는 손님은 다른 자리를 치워도 움직이지 않는다', async ({ page }) => {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'requestScreen', 'SCR-SVC-CUSTOMERS');

  // 츠키오카를 먹여 보내면 다음 무리가 들어온다. 이때 츠키오카 자리는 정리 대기가 된다.
  await D(page, 'businessAdvance', 6_000);
  const tsukioka = (await D(page, 'businessView')).seats
    .find(({ customerId }) => customerId === 'REGULAR_TSUKIOKA');
  await D(page, 'businessClickSeat', tsukioka.seatId);
  await D(page, 'businessDispatch', {
    type: 'serve-item', intentId: 'layout:beer', customerId: 'REGULAR_TSUKIOKA', menuId: 'beer', quality: 'Perfect',
  });
  for (let index = 0; index < 2; index += 1) {
    await D(page, 'businessDispatch', {
      type: 'serve-item', intentId: `layout:negima:${index}`, customerId: 'REGULAR_TSUKIOKA', menuId: 'negima', quality: 'Perfect',
    });
  }
  await D(page, 'businessAdvance', 40_000);

  // 다음 손님들이 앉은 뒤의 위치를 기록한다.
  await expect.poll(() => seatPositions(page).then((seats) => seats.length)).toBeGreaterThan(0);
  const before = await seatPositions(page);

  // 츠키오카 자리를 정리한다.
  await D(page, 'businessBeginCleanup', tsukioka.seatId);
  await D(page, 'businessAdvance', 5_000);

  const after = await seatPositions(page);
  expect(after.map(({ seatId }) => seatId)).toEqual(before.map(({ seatId }) => seatId));
  for (const [index, seat] of after.entries()) {
    expect(seat.x).toBeCloseTo(before[index].x, 5);
    expect(seat.y).toBeCloseTo(before[index].y, 5);
  }
});

test('첫 손님이 자리에 있는 동안에는 다른 손님이 겹쳐 앉지 않는다', async ({ page }) => {
  // 츠키오카는 좌석 액터가 아니라 화면 가운데를 채우는 전용 구도로 그려진다. 그 사람이 앉아
  // 있는데 다음 무리를 들이면 두 그림이 겹친다.
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'requestScreen', 'SCR-SVC-CUSTOMERS');

  await D(page, 'businessAdvance', 6_000);
  const tsukioka = (await D(page, 'businessView')).seats
    .find(({ customerId }) => customerId === 'REGULAR_TSUKIOKA');
  await D(page, 'businessClickSeat', tsukioka.seatId);
  await D(page, 'businessDispatch', {
    type: 'serve-item', intentId: 'overlap:beer', customerId: 'REGULAR_TSUKIOKA', menuId: 'beer', quality: 'Perfect',
  });
  for (let index = 0; index < 2; index += 1) {
    await D(page, 'businessDispatch', {
      type: 'serve-item', intentId: `overlap:negima:${index}`, customerId: 'REGULAR_TSUKIOKA', menuId: 'negima', quality: 'Perfect',
    });
  }

  // 주문을 다 받고 식사하는 동안에도 다른 손님이 그려지지 않아야 한다.
  for (let step = 0; step < 6; step += 1) {
    await D(page, 'businessAdvance', 2_000);
    const visible = await page.evaluate(() => {
      const renderer = window.__d1GameDebug.renderer;
      return {
        tsukioka: renderer.artMesh.custTsukioka.visible,
        actors: Object.entries(renderer.seatActorMesh)
          .filter(([, mesh]) => mesh.visible)
          .map(([seatId]) => seatId),
      };
    });
    if (visible.tsukioka) expect(visible.actors).toEqual([]);
  }

  // 자리를 뜬 뒤에는 다음 무리가 좌석에 나타난다.
  await expect.poll(async () => {
    await D(page, 'businessAdvance', 2_000);
    return page.evaluate(() => Object.values(window.__d1GameDebug.renderer.seatActorMesh)
      .filter((mesh) => mesh.visible).length);
  }, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__d1GameDebug.renderer.artMesh.custTsukioka.visible)).toBe(false);
});

test('퇴장 컷신이 도는 동안에도 다음 손님이 겹쳐 그려지지 않는다', async ({ page }) => {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'requestScreen', 'SCR-SVC-CUSTOMERS');

  await D(page, 'businessAdvance', 6_000);
  const tsukioka = (await D(page, 'businessView')).seats
    .find(({ customerId }) => customerId === 'REGULAR_TSUKIOKA');
  await D(page, 'businessClickSeat', tsukioka.seatId);
  await D(page, 'businessDispatch', {
    type: 'serve-item', intentId: 'cutscene:beer', customerId: 'REGULAR_TSUKIOKA', menuId: 'beer', quality: 'Perfect',
  });
  for (let index = 0; index < 2; index += 1) {
    await D(page, 'businessDispatch', {
      type: 'serve-item', intentId: `cutscene:negima:${index}`, customerId: 'REGULAR_TSUKIOKA', menuId: 'negima', quality: 'Perfect',
    });
  }

  const noOverlap = async () => {
    const visible = await page.evaluate(() => {
      const renderer = window.__d1GameDebug.renderer;
      return {
        tsukioka: renderer.artMesh.custTsukioka.visible,
        actors: Object.entries(renderer.seatActorMesh)
          .filter(([, mesh]) => mesh.visible)
          .map(([seatId]) => seatId),
      };
    });
    if (visible.tsukioka) expect(visible.actors).toEqual([]);
    return visible;
  };

  // 식사가 끝나고 퇴장 컷신이 뜨는 순간까지 한 번에 진행한다(컷신 발동은 진행 간격에 민감하다).
  await D(page, 'businessAdvanceWithCutscene', 15_000);
  await noOverlap();
  expect((await D(page, 'departureCutscene')).active).toBe(true);
  expect(await page.evaluate(() => window.__d1GameDebug.renderer.artMesh.custTsukioka.visible)).toBe(true);

  // 컷신을 닫으면 첫 손님은 사라지고 다음 손님이 자리에 나타난다.
  await page.getByTestId('departure-cutscene-continue').click();
  await expect.poll(async () => {
    await D(page, 'businessAdvance', 1_000);
    const visible = await noOverlap();
    return visible.actors.length;
  }, { timeout: 15_000 }).toBeGreaterThan(0);
});

test('첫 손님의 말풍선과 접시는 그 사람이 그려진 자리에 놓인다', async ({ page }) => {
  // 첫 손님 그림은 좌석 좌표가 아니라 화면 전체를 쓰는 전용 구도다. 좌석 배치가 어긋나면
  // 몸은 저기 있는데 말풍선·접시만 옆자리에 놓인다.
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'requestScreen', 'SCR-SVC-CUSTOMERS');
  await D(page, 'businessAdvance', 6_000);

  const tsukioka = (await D(page, 'businessView')).seats
    .find(({ customerId }) => customerId === 'REGULAR_TSUKIOKA');
  await D(page, 'businessClickSeat', tsukioka.seatId);
  await D(page, 'businessDispatch', {
    type: 'serve-item', intentId: 'align:negima', customerId: 'REGULAR_TSUKIOKA', menuId: 'negima', quality: 'Perfect',
  });

  const placement = await page.evaluate((seatId) => {
    const renderer = window.__d1GameDebug.renderer;
    const width = renderer.renderer.domElement.getBoundingClientRect().width;
    return {
      bubble: renderer.projectToScreen(renderer.seatBubbleWorld[seatId]).x / width,
      plate: renderer.projectToScreen(renderer.seatBaseMesh[seatId].position).x / width,
      plateVisible: renderer.seatBaseMesh[seatId].visible,
    };
  }, tsukioka.seatId);

  // 승인 아트에서 첫 손님이 앉아 있는 자리(1108.7 / 1920).
  expect(placement.bubble).toBeCloseTo(0.5774, 3);
  expect(placement.plate).toBeCloseTo(0.5774, 3);
  expect(placement.plateVisible).toBe(true);
});
