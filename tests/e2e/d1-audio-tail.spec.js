// 상황이 끝났는데 소리가 남는 회귀를 막는다.
//
// 납품된 상태음 몇 개는 파일이 20~120초로 길다(공명 45초, 적정 진입 22초, 탄내 2분). 상태를 벗어나면
// 소리도 같이 끝나야 한다. 그렇지 않으면 잔을 이미 회수했는데 공명이 계속 울고, 꼬치를 회수했는데
// 그릴 소리가 남는다.
import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, name, ...args) => page.evaluate(
  ({ debugName, values }) => window.__d1GameDebug[debugName](...values),
  { debugName: name, values: args },
);

const activeOneShots = (page) => D(page, 'audioState').then((state) => state?.activeOneShots ?? []);
const activeLoops = (page) => D(page, 'audioState').then((state) => state?.loops ?? []);

async function bootD1(page) {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await page.mouse.click(10, 10); // 자동재생 잠금 해제
}

test('잔을 완성하면 채움 소리와 공명이 함께 끝난다', async ({ page }) => {
  await bootD1(page);
  await D(page, 'requestScreen', 'SCR-SVC-DRINK');
  await page.waitForTimeout(600);
  const rack = await D(page, 'screenPosOf', 'glassRack');
  await page.mouse.click(rack.x, rack.y);

  const lever = await D(page, 'screenPosOf', 'drinkLeverDrag');
  await page.mouse.move(lever.x, lever.y);
  await page.mouse.down();
  await page.mouse.move(lever.x, lever.y + 60, { steps: 6 });
  // 70%를 넘기면 공명이 운다. 붓는 동안 들어오는 순간을 잡는다(신호는 짧게 잘려 있다).
  await expect.poll(() => activeOneShots(page), { timeout: 8_000 })
    .toContain('SFX-DRINK-GLASS-RESONANCE');
  await page.mouse.up();

  await D(page, 'drinkFinish');
  await expect.poll(() => D(page, 'drinkState').then((s) => s.phase)).toBe('idle');

  await expect.poll(() => activeOneShots(page), { timeout: 2_000 })
    .not.toContain('SFX-DRINK-GLASS-RESONANCE');
  expect(await activeLoops(page)).not.toContain('SFX-DRINK-FILL-PITCH');
  expect(await activeLoops(page)).not.toContain('SFX-DRINK-BEER-FLOW');
});

// 좌석 수에 따른 앰비언스 규칙 자체는 interiorAmbienceId·crowdAmbienceId 단위 테스트가 지킨다.
// (빈 가게는 D1 영업 중에는 도달하지 않아 종단으로 재현할 수 없다.)
// 여기서는 그 규칙이 실제 재생에 연결돼 있는지만 본다.
test('한 손님은 조용하고 둘 이상부터 낮은 군중음을 재생한다', async ({ page }) => {
  await bootD1(page);
  // 33MB 실내 앰비언스는 디코딩이 오래 걸린다. 재생 대기까지 포함해서 본다.
  const ambienceQueued = async () => {
    const state = await D(page, 'audioState');
    return [...(state?.loops ?? []), ...(state?.pendingLoops ?? [])];
  };
  const occupiedSeats = () => D(page, 'businessView').then((view) => (
    view?.seats?.filter((seat) => seat.occupied).length ?? 0
  ));

  // 츠키오카 혼자: 실내 앰비언스는 돌고 군중음은 꺼져 있다.
  await expect.poll(occupiedSeats).toBe(1);
  await expect.poll(ambienceQueued, { timeout: 5_000 }).toContain('AMB-SHOP-INTERIOR');
  const alone = await ambienceQueued();
  expect(alone).not.toContain('AMB-CROWD-L1');
  expect(alone).not.toContain('AMB-CROWD-L2');

  // 다음 손님 무리는 시간이 아니라 츠키오카를 보내야 들어온다. 주문을 채우고 자리를 치운다.
  await D(page, 'businessAdvance', 6_000); // 주문이 올라올 때까지
  const seat = (await D(page, 'businessView')).seats
    .find(({ customerId }) => customerId === 'REGULAR_TSUKIOKA');
  await D(page, 'businessClickSeat', seat.seatId);
  expect(await D(page, 'businessDispatch', {
    type: 'serve-item', intentId: 'ambience:beer', customerId: 'REGULAR_TSUKIOKA', menuId: 'beer', quality: 'Perfect',
  })).toMatchObject({ ok: true, applied: true });
  for (let index = 0; index < 2; index += 1) {
    expect(await D(page, 'businessDispatch', {
      type: 'serve-item', intentId: `ambience:negima:${index}`, customerId: 'REGULAR_TSUKIOKA', menuId: 'negima', quality: 'Perfect',
    })).toMatchObject({ ok: true, applied: true });
  }
  await D(page, 'businessAdvance', 40_000);
  await D(page, 'businessBeginCleanup', seat.seatId);
  await D(page, 'businessAdvance', 5_000);

  // 둘 이상 앉으면 낮은 군중음이 실내 앰비언스와 함께 돈다.
  await expect.poll(occupiedSeats, { timeout: 10_000 }).toBeGreaterThan(1);
  await expect.poll(ambienceQueued, { timeout: 5_000 }).toContain('AMB-CROWD-L1');
  const group = await ambienceQueued();
  expect(group).toContain('AMB-SHOP-INTERIOR');
  expect(group).not.toContain('AMB-CROWD-L2');
});

test('꼬치를 회수하면 그릴 상태음도 함께 끝난다', async ({ page }) => {
  await bootD1(page);
  await D(page, 'requestScreen', 'SCR-SVC-GRILL');
  await D(page, 'cookSelectRecipe', 'negima');
  await D(page, 'cookFillAssembly', 'negima');
  await D(page, 'cookPlace');
  await D(page, 'cookClickSlot', 0);

  // 앞뒤로 구워 회수까지 간다. 적정 진입 신호(22초짜리 파일)가 이 사이에 울린다.
  for (let guard = 0; guard < 12; guard += 1) {
    const slot = (await D(page, 'cookSlots'))[0];
    if (slot.status === 'empty') break;
    if (slot.doneness === 'perfect') {
      await D(page, 'cookClickSlot', 0);
      await page.waitForTimeout(250);
      continue;
    }
    await D(page, 'cookElapse', 2);
    await page.waitForTimeout(120);
  }
  expect((await D(page, 'cookSlots'))[0].status).toBe('empty');

  await expect.poll(() => activeOneShots(page), { timeout: 2_000 })
    .not.toContain('SFX-GRILL-PROPER-ENTER');
  const loops = await activeLoops(page);
  expect(loops).not.toContain('SFX-GRILL-COOK-LOOP');
  expect(loops).not.toContain('AMB-CHARCOAL-BED');
});
