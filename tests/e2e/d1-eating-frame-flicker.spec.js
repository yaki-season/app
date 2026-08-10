// 식사 프레임(먹기 ↔ 마시기)이 rAF마다 뒤바뀌어 지지직거리던 회귀를 막는다.
//
// 프레임은 D1_RECEIVED_EATING_FRAME_INTERVAL_MS(1200ms)마다 한 번만 바뀐다. 화면 갱신 경로가
// 두 개(rAF의 연출 시계, render()의 벽시계)라 창 blur로 두 시계가 어긋나면 프레임마다 서로 다른
// 그림을 덮어써 깜빡였다.
import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, name, ...args) => page.evaluate(
  ({ debugName, values }) => window.__d1GameDebug[debugName](...values),
  { debugName: name, values: args },
);

// 실제로 화면에 걸린 텍스처를 rAF마다 읽어 바뀐 횟수를 센다.
function sampleFrameSwaps(page, durationMs) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const urlOf = () => {
      const image = window.__d1GameDebug.renderer.artMesh.custTsukioka?.material?.map?.image;
      return image?.currentSrc ?? image?.src ?? null;
    };
    const started = performance.now();
    let previous = urlOf();
    let swaps = 0;
    let samples = 0;
    const step = () => {
      const current = urlOf();
      samples += 1;
      if (current !== previous) {
        swaps += 1;
        previous = current;
      }
      if (performance.now() - started < duration) requestAnimationFrame(step);
      else resolve({ swaps, samples });
    };
    requestAnimationFrame(step);
  }), durationMs);
}

test('창 포커스를 잃었다 돌아와도 식사 프레임이 1.2초에 한 번만 바뀐다', async ({ page }) => {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'businessAdvance', 6_000);

  const view = await D(page, 'businessView');
  const seat = view.seats.find(({ customerId }) => customerId === 'REGULAR_TSUKIOKA');
  expect(seat).toBeTruthy();
  await D(page, 'businessClickSeat', seat.seatId);

  // 맥주 + 꼬치를 모두 받아야 먹기/마시기 두 프레임이 번갈아 도는 상태가 된다.
  expect(await D(page, 'businessDispatch', {
    type: 'serve-item',
    intentId: 'eating-flicker:beer',
    customerId: 'REGULAR_TSUKIOKA',
    menuId: 'beer',
    quality: 'Perfect',
  })).toMatchObject({ ok: true, applied: true });
  for (let index = 0; index < 2; index += 1) {
    expect(await D(page, 'businessDispatch', {
      type: 'serve-item',
      intentId: `eating-flicker:negima:${index}`,
      customerId: 'REGULAR_TSUKIOKA',
      menuId: 'negima',
      quality: 'Perfect',
    })).toMatchObject({ ok: true, applied: true });
  }
  await expect.poll(() => D(page, 'tsukiokaVisual').then((visual) => visual.artId))
    .toBe('D1-TSUKIOKA-RECEIVED-EATING');

  // 창 blur는 연출 시계를 멈춰 세운다. 이 정지 구간이 곧 두 시계의 어긋남이 된다.
  await D(page, 'setRuntimeSuspended', 'window-blur', true);
  await page.waitForTimeout(1_200);
  await D(page, 'setRuntimeSuspended', 'window-blur', false);

  const { swaps, samples } = await sampleFrameSwaps(page, 1_000);
  expect(samples).toBeGreaterThan(20);
  // 1초 구간이면 프레임 경계는 많아야 한 번 지난다.
  expect(swaps).toBeLessThanOrEqual(1);
});
