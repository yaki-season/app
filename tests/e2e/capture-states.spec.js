import path from 'node:path';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  boot,
  getState,
  doneness,
  clickHotspot,
  assembleSkewer,
  placeOnGrill,
  flipWhenPerfect,
  cookToPlate,
} from './helpers.js';

test.skip(!process.env.CAPTURE_STATES, 'CAPTURE_STATES=1일 때 검수 캡처를 생성한다.');
test.setTimeout(120000);

const captureRoot = path.resolve('art/review/developer-1-005/captures');

async function capture(page, projectName, name) {
  await page.evaluate(() => window.__sceneDebug.renderer.renderFrame(performance.now()));
  await page.waitForTimeout(50);
  const buffer = await page.screenshot({
    path: path.join(captureRoot, projectName, `${name}.png`),
    fullPage: true,
  });
  expect(buffer.byteLength).toBeGreaterThan(10000);
  return createHash('sha256').update(buffer).digest('hex');
}

async function serveAndWait(page, expectedMood) {
  await expect.poll(() => page.evaluate(() => !!window.__sceneDebug.screenPosOf('plate'))).toBe(true);
  await page.evaluate(() => window.__sceneDebug.selectPlateNow());
  expect((await getState(page)).plateSelected).toBe(true);
  expect(await page.evaluate(() => window.__sceneDebug.startServiceNow())).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.__sceneDebug.motionActive('plate')),
  ).toBe(false);
  await page.evaluate(() => window.__sceneDebug.completeServiceNow());
  await expect.poll(() => getState(page).then((state) => state.status)).toBe('served');
  await page.evaluate(() => window.__sceneDebug.completeCustomerReactionNow());
  expect(await page.evaluate(() => window.__sceneDebug.customerState())).toBe(expectedMood);
}

async function restartAndSettle(page) {
  await page.getByTestId('restart-button').click();
  await expect.poll(() => getState(page).then((state) => state.status)).toBe('assembly');
  await page.waitForTimeout(500);
}

test('두 기준 뷰포트의 8개 핵심 상태를 캡처한다', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const hashes = new Set();
  await boot(page);
  hashes.add(await capture(page, project, '01-assembly-start'));

  await assembleSkewer(page);
  hashes.add(await capture(page, project, '02-assembly-complete'));

  await placeOnGrill(page);
  await expect.poll(() => doneness(page), { timeout: 15000 }).toBe('perfect');
  hashes.add(await capture(page, project, '03-grill-perfect'));

  await clickHotspot(page, 'grill-skewer');
  await flipWhenPerfect(page, 'plated');
  await expect.poll(() => page.evaluate(() => !!window.__sceneDebug.screenPosOf('plate'))).toBe(true);
  await page.evaluate(() => window.__sceneDebug.selectPlateNow());
  hashes.add(await capture(page, project, '04-plate-selected'));

  expect(await page.evaluate(() => window.__sceneDebug.startServiceNow())).toBe(true);
  await expect.poll(
    () => page.evaluate(() => window.__sceneDebug.motionActive('plate')),
  ).toBe(false);
  await page.evaluate(() => window.__sceneDebug.completeServiceNow());
  await expect.poll(
    () => page.evaluate(() => window.__sceneDebug.customerState()),
  ).toBe('tasting');
  hashes.add(await capture(page, project, '05-tasting'));
  await page.evaluate(() => window.__sceneDebug.completeCustomerReactionNow());
  expect(await page.evaluate(() => window.__sceneDebug.customerState())).toBe('satisfied');
  hashes.add(await capture(page, project, '06-satisfied'));

  await restartAndSettle(page);
  await assembleSkewer(page);
  await placeOnGrill(page);
  await expect.poll(() => doneness(page), { timeout: 15000 }).toBe('over');
  await clickHotspot(page, 'grill-skewer');
  await expect.poll(() => doneness(page), { timeout: 15000 }).toBe('over');
  await clickHotspot(page, 'grill-skewer');
  await serveAndWait(page, 'neutral');
  hashes.add(await capture(page, project, '07-low-quality'));

  await restartAndSettle(page);
  await assembleSkewer(page);
  await placeOnGrill(page);
  await expect.poll(
    () => page.evaluate(() => window.__sceneDebug.tickNow().status),
    { timeout: 30000 },
  ).toBe('failed');
  await expect(page.getByTestId('result-overlay')).toBeVisible();
  expect((await getState(page)).status).toBe('failed');
  hashes.add(await capture(page, project, '08-burnt-failure'));
  expect(hashes.size).toBe(8);
});
