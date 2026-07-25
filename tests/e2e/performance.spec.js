import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

test('단일 렌더러가 장면 성능 예산 안에서 동작한다', async ({ page }) => {
  await boot(page);
  await expect.poll(
    () => page.evaluate(() => window.__sceneDebug.performanceStats().sampledFrames),
  ).toBeGreaterThanOrEqual(30);

  const stats = await page.evaluate(() => window.__sceneDebug.performanceStats());
  expect(stats.canvasCount).toBe(1);
  expect(stats.renderLoopCount).toBe(1);
  expect(stats.calls).toBeLessThanOrEqual(30);
  expect(stats.triangles).toBeLessThanOrEqual(50000);
  expect(stats.dpr).toBeLessThanOrEqual(1.5);
  expect(stats.fps).toBeGreaterThanOrEqual(30);
});
