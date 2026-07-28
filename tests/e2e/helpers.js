// 종단 테스트 공용 헬퍼 (2.5D 장면 뷰).
//
// 원칙: 벽시계 고정 대기 대신 **상태를 보고 기다린다**. 조리 판정은 실제 경과 시간 기준이라
// (`GPL-004 §25-1`) 고정 대기는 병렬 부하에서 적정 구간(8~16초)을 넘겨 `과다`가 된다.
//
// 장면 뷰는 DOM 버튼이 아니라 단일 캔버스 + 레이캐스트다. 조작 대상은 `__sceneDebug.screenPosOf(key)`가
// 돌려주는 화면 좌표를 클릭한다. 상태·익힘도 같은 디버그 훅으로 관측한다.
import { expect } from '@playwright/test';

export const RECIPE = ['chicken', 'leek', 'chicken', 'leek', 'chicken'];

// `main.js`의 대상별 입력 잠금(UI-001 §17). 같은 핫스팟을 이 시간 안에 다시 누르면 무시된다.
const INPUT_LOCK_MS = 200;

export const getState = (page) => page.evaluate(() => window.__sceneDebug.getState());
export const doneness = (page) => page.evaluate(() => window.__sceneDebug.doneness());

export async function boot(page) {
  await page.goto('/src/index.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => getState(page).then((s) => s.process)).toBe('assembly');
}

/** 핫스팟 화면 좌표를 클릭한다. 보이지 않으면 실패. */
export async function clickHotspot(page, key) {
  const pos = await page.evaluate((k) => window.__sceneDebug.screenPosOf(k), key);
  if (!pos) throw new Error(`핫스팟이 보이지 않음: ${key}`);
  await page.mouse.click(pos.x, pos.y);
}

/**
 * 네기마 5단계를 조립한다.
 *
 * 각 클릭 뒤 대상별 입력 잠금(200ms)이 풀리도록 잠깐 기다린 다음 진행한다. 잠금이 안 풀린 채
 * 다음 재료를 누르면 캔버스 레이캐스트 입력이 유실돼 조립이 멈춘다.
 */
export async function assembleSkewer(page) {
  for (const [i, ingredient] of RECIPE.entries()) {
    await clickHotspot(page, `ingredient-${ingredient}`);
    await expect.poll(() => getState(page).then((s) => s.assemblyIndex)).toBe(i + 1);
    await expect.poll(
      () => page.evaluate((key) => window.__sceneDebug.motionActive(key), `ingredient-${ingredient}`),
    ).toBe(false);
    await page.waitForTimeout(INPUT_LOCK_MS + 30);
  }
}

/** 조립 완료 꼬치를 그릴에 올린다. */
export async function placeOnGrill(page) {
  await clickHotspot(page, 'assembled-skewer');
  await expect.poll(() => getState(page).then((s) => s.process)).toBe('grill');
  await clickHotspot(page, 'waiting-skewer');
  await expect.poll(() => getState(page).then((s) => s.status)).toBe('grillFront');
}

/** 익힘이 적정 구간에 들면 꼬치를 클릭하고 다음 상태를 기다린다. */
export async function flipWhenPerfect(page, expectNext) {
  await expect.poll(() => doneness(page), { timeout: 15000 }).toBe('perfect');
  await clickHotspot(page, 'grill-skewer');
  await expect.poll(() => getState(page).then((s) => s.status)).toBe(expectNext);
}

/** 조립부터 접시에 담기까지. 양면 모두 적정으로 굽는다. */
export async function cookToPlate(page) {
  await assembleSkewer(page);
  await placeOnGrill(page);
  await flipWhenPerfect(page, 'grillBack');
  await flipWhenPerfect(page, 'plated');
}

/** 접시를 골라 손님에게 낸다. 접시가 카운터에 나타난 뒤 클릭한다. */
export async function serve(page) {
  await expect.poll(() => page.evaluate(() => !!window.__sceneDebug.screenPosOf('plate'))).toBe(true);
  await clickHotspot(page, 'plate');
  await clickHotspot(page, 'order-mat');
  await expect.poll(() => getState(page).then((s) => s.status)).toBe('served');
}

/** 한 주문을 처음부터 끝까지 처리한다. */
export async function cookAndServe(page) {
  await cookToPlate(page);
  await serve(page);
}
