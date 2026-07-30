// 그릴 꼬치 익힘 상태 UI 종단 검증 (기획: 2026-07-30 그릴 꼬치 익힘 상태 UI 설계 초안).
// 굽는 칸마다 면·익힘 단계·행동 힌트를 게이지로 표시하고, 빈 칸·다른 화면에선 숨는다.
import { test, expect } from '@playwright/test';

const active = (p) => p.evaluate(() => window.__prodDebug.activeScreen());
const gauge = (p) => p.getByTestId('grill-gauge-0');
const label = (p) => p.getByTestId('grill-gauge-label-0');

async function boot(page) {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
}
async function goScreen(page, id) {
  await page.evaluate((s) => window.__prodDebug.requestScreen(s), id);
  await expect.poll(() => active(page)).toBe(id);
  await expect.poll(() => page.evaluate(() => window.__prodDebug.isTransitioning())).toBe(false);
}

test('그릴 익힘 게이지: 굽는 칸에 면·단계·행동 힌트를 표시한다', async ({ page }) => {
  await boot(page);
  await goScreen(page, 'SCR-SVC-GRILL');
  await expect(gauge(page)).toBeHidden(); // 빈 칸: 표시 없음

  // 첫 3개를 모두 올린 순간 함께 시작 → 덜 익음(행동 힌트 없음)
  await page.evaluate(() => {
    for (let index = 0; index < 3; index += 1) window.__prodDebug.cookFillAssembly();
    window.__prodDebug.cookPlace();
    window.__prodDebug.cookPlace();
    window.__prodDebug.cookPlace();
  });
  await expect(gauge(page)).toBeVisible();
  await expect(label(page)).toContainText('앞면');
  await expect(label(page)).toContainText('덜 익음');

  // 적정(8~16초) → 뒤집기 힌트
  await page.evaluate(() => window.__prodDebug.cookElapse(9));
  await expect(label(page)).toContainText('적정');
  await expect(label(page)).toContainText('뒤집기');
  await expect(gauge(page)).toHaveAttribute('data-stage', 'perfect');

  // 과다(16~21초)
  await page.evaluate(() => window.__prodDebug.cookElapse(8));
  await expect(label(page)).toContainText('과다');
  await expect(gauge(page)).toHaveAttribute('data-stage', 'over');

  // 다른 화면으로 가면 게이지는 숨는다
  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  await expect(gauge(page)).toBeHidden();
});
