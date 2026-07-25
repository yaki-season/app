import { test, expect } from '@playwright/test';
import {
  boot,
  getState,
  clickHotspot,
  assembleSkewer,
  cookToPlate,
} from './helpers.js';

test('손님 하체가 고정 카운터 상판 뒤에서 실제 깊이로 가려진다', async ({ page }) => {
  await boot(page);
  const report = await page.evaluate(() => window.__sceneDebug.occlusionReport());

  expect(report.customerBehindCounter).toBe(true);
  expect(report.overlapPx).toBeGreaterThan(40);
  expect(report.customerRect.top).toBeLessThan(report.counterRect.top);
  expect(report.customerRect.bottom).toBeGreaterThan(report.counterRect.top);
});

test('재료가 클릭되면 들려서 꼬치 조립점으로 이동한 뒤 복귀한다', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(450); // 최초 assembly 카메라 프리셋 이동 완료
  const before = await page.evaluate(() => window.__sceneDebug.screenPosOf('ingredient-chicken'));
  await clickHotspot(page, 'ingredient-chicken');
  await expect.poll(() => getState(page).then((state) => state.assemblyIndex)).toBe(1);
  await expect.poll(
    () => page.evaluate(() => window.__sceneDebug.motionActive('ingredient-chicken')),
  ).toBe(true);

  await expect.poll(
    () => page.evaluate(() => window.__sceneDebug.motionActive('ingredient-chicken')),
  ).toBe(false);
  expect(
    await page.evaluate(() => window.__sceneDebug.motionTravel('ingredient-chicken')),
  ).toBeGreaterThan(0.2);
  const restored = await page.evaluate(() => window.__sceneDebug.screenPosOf('ingredient-chicken'));
  expect(Math.abs(restored.x - before.x)).toBeLessThan(1);
  expect(Math.abs(restored.y - before.y)).toBeLessThan(1);
});

test('접시는 주문 매트를 지나 손님측에 도착한 뒤에만 맛보기 반응을 시작한다', async ({ page }) => {
  await boot(page);
  await cookToPlate(page);
  await expect.poll(() => page.evaluate(() => !!window.__sceneDebug.screenPosOf('plate'))).toBe(true);

  await clickHotspot(page, 'plate');
  await clickHotspot(page, 'order-mat');
  expect(await page.evaluate(() => window.__sceneDebug.lastHandledKey())).toBe('order-mat');
  expect(await page.evaluate(() => window.__sceneDebug.serviceInFlight())).toBe(true);
  expect((await getState(page)).status).toBe('plated');
  expect(await page.evaluate(() => window.__sceneDebug.customerState())).toBe('waiting');
  expect(await page.evaluate(() => window.__sceneDebug.motionActive('plate'))).toBe(true);

  await expect.poll(() => getState(page).then((state) => state.status)).toBe('served');
  expect(await page.evaluate(() => window.__sceneDebug.customerState())).toBe('tasting');
  await expect.poll(
    () => page.evaluate(() => window.__sceneDebug.customerState()),
    { timeout: 3000 },
  ).toBe('satisfied');
});
