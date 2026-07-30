// 직원 자동 제조 종단 검증. 드링크 직원을 고용하면 생맥주가 선반에 자동으로 올라가고, 정산에서 일당이
// 차감된다.
import { test, expect } from '@playwright/test';

const beerCount = (p) => p.evaluate(() => window.__prodDebug.dockItems().filter((i) => i.menu === '생맥주').length);
const gold = (p) => p.evaluate(() => window.__prodDebug.wallet().gold);

async function boot(page) {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
}

test('직원 자동 제조: 드링크 직원 고용→생맥주 자동 제조·정산 일당 차감', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.setWallet(99999, 99));

  // 정산 → 구매 → 직원 탭에서 고용
  await page.getByTestId('end-day').click();
  await page.getByTestId('open-purchase').click();
  await page.getByTestId('cat-staff').click();
  await expect(page.getByTestId('item-staff-drink')).toHaveAttribute('data-state', 'hireable');
  await page.getByTestId('hire-staff-drink').click();
  await expect(page.getByTestId('item-staff-drink')).toHaveAttribute('data-state', 'owned');
  expect(await page.evaluate(() => window.__prodDebug.staffOwned())).toContain('staff-drink');

  await page.getByTestId('purchase-close').click();
  await page.getByTestId('next-day').click();
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(false); window.__prodDebug.opsClear(); });

  // 자동 제조: 생맥주가 선반에 올라간다
  expect(await beerCount(page)).toBe(0);
  await page.evaluate(() => window.__prodDebug.autoProduceOnce());
  await expect.poll(() => beerCount(page)).toBe(1);

  // 정산에서 일당(300G) 차감
  const before = await gold(page);
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('settlement')).toBeVisible();
  await expect(page.locator('#settlement [data-f="wage"]')).toHaveText('300');
  expect(await gold(page)).toBe(before - 300); // 매출 0 + 팁 0 - 일당 300
});
