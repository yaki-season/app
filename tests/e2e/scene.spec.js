// SYS-002 / 작업 005 — 2.5D 영업 장면 (더미) 종단 검증.
// 별도 진입점 /src/scene/index.html. 아트 없이 더미 도형으로 조립→굽기→서빙 루프와
// 셰프측 카메라 프리셋, 츠키오카 반응을 검증한다.
import { test, expect } from '@playwright/test';

const st = (page) => page.evaluate(() => window.__sceneDebug.getState());
const doneness = (page) => page.evaluate(() => window.__sceneDebug.doneness());

async function clickHotspot(page, key) {
  const pos = await page.evaluate((k) => window.__sceneDebug.screenPosOf(k), key);
  if (!pos) throw new Error(`핫스팟이 보이지 않음: ${key}`);
  await page.mouse.click(pos.x, pos.y);
}

async function waitPerfect(page) {
  await expect.poll(() => doneness(page), { timeout: 15000 }).toBe('perfect');
}

async function boot(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  await page.goto('/src/index.html');
  await page.waitForTimeout(400);
  return errs;
}

test('장면이 오류 없이 렌더된다', async ({ page }) => {
  const errs = await boot(page);
  await expect(page.locator('#scene')).toBeVisible();
  // 조립 프리셋으로 시작, 손님은 대기 상태
  expect((await st(page)).process).toBe('assembly');
  expect(errs).toEqual([]);
});

test('조립 조작 대상이 최소 클릭 영역(44px)을 만족한다', async ({ page }) => {
  await boot(page);
  for (const key of ['ingredient-chicken', 'ingredient-leek']) {
    const rect = await page.evaluate((k) => window.__sceneDebug.screenRectOf(k), key);
    expect(rect, `${key} 보임`).not.toBeNull();
    expect(rect.width, `${key} 너비`).toBeGreaterThanOrEqual(44);
    expect(rect.height, `${key} 높이`).toBeGreaterThanOrEqual(44);
  }
});

test('클릭만으로 조립→굽기→서빙 루프가 돈다', async ({ page }) => {
  const errs = await boot(page);
  const recipe = ['ingredient-chicken', 'ingredient-leek', 'ingredient-chicken', 'ingredient-leek', 'ingredient-chicken'];
  for (let i = 0; i < recipe.length; i++) {
    await clickHotspot(page, recipe[i]);
    await expect.poll(() => st(page).then((s) => s.assemblyIndex)).toBe(i + 1);
    await expect.poll(
      () => page.evaluate((key) => window.__sceneDebug.motionActive(key), recipe[i]),
    ).toBe(false);
    await page.waitForTimeout(220); // 대상별 입력 잠금
  }

  await clickHotspot(page, 'assembled-skewer');
  await expect.poll(() => st(page).then((s) => s.process)).toBe('grill');
  await clickHotspot(page, 'waiting-skewer');
  await expect.poll(() => st(page).then((s) => s.status)).toBe('grillFront');

  await waitPerfect(page);
  await clickHotspot(page, 'grill-skewer');
  await expect.poll(() => st(page).then((s) => s.status)).toBe('grillBack');
  await waitPerfect(page);
  await clickHotspot(page, 'grill-skewer');
  await expect.poll(() => st(page).then((s) => s.status)).toBe('plated');

  await page.waitForTimeout(600);
  await clickHotspot(page, 'plate');
  await clickHotspot(page, 'order-mat');
  await expect.poll(() => st(page).then((s) => s.status)).toBe('served');

  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await expect(page.getByTestId('result-message')).toContainText('만족');

  // 다시 만들기로 초기화
  await page.getByTestId('restart-button').click();
  await expect.poll(() => st(page).then((s) => s.status)).toBe('assembly');
  expect(errs).toEqual([]);
});

test('탄 상태면 츠키오카가 retry 반응을 보인다', async ({ page }) => {
  await boot(page);
  const recipe = ['ingredient-chicken', 'ingredient-leek', 'ingredient-chicken', 'ingredient-leek', 'ingredient-chicken'];
  for (let i = 0; i < recipe.length; i++) {
    await clickHotspot(page, recipe[i]);
    await expect.poll(() => st(page).then((s) => s.assemblyIndex)).toBe(i + 1);
    await expect.poll(
      () => page.evaluate((key) => window.__sceneDebug.motionActive(key), recipe[i]),
    ).toBe(false);
    await page.waitForTimeout(220);
  }
  await clickHotspot(page, 'assembled-skewer');
  await clickHotspot(page, 'waiting-skewer');
  // 방치 → 탄 상태 (결과 오버레이가 나타날 때까지)
  await expect.poll(
    () => page.evaluate(() => window.__sceneDebug.tickNow().status),
    { timeout: 15000 },
  ).toBe('failed');
  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await expect(page.getByTestId('result-message')).toContainText('타버렸습니다');
});
