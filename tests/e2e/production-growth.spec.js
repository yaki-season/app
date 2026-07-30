// 성장·구매 종단 검증 (SCR-META-PURCHASE, GPL-005, 증분 8).
import { test, expect } from '@playwright/test';

const view = (p, id) => p.evaluate((s) => window.__prodDebug.seatViews().find((v) => v.seatId === s), id);
const wallet = (p) => p.evaluate(() => window.__prodDebug.wallet());

async function boot(page) {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(false); window.__prodDebug.opsClear(); });
}
async function clickSeat(page, seatId) {
  const pos = await page.evaluate((s) => window.__prodDebug.screenPosOf(`seatServe:${s}`), seatId);
  if (!pos) throw new Error(`좌석 대상이 보이지 않음: ${seatId}`);
  await page.mouse.click(pos.x, pos.y);
}

test('정산이 매출·명성을 지갑에 누적한다', async ({ page }) => {
  await boot(page);
  // 좋은 서빙 1건 → 명성 +3
  await page.evaluate(() => window.__prodDebug.forceSpawn('seat-02', 'solo', 0));
  await page.evaluate(() => window.__prodDebug.opsElapse(1));
  await expect.poll(() => view(page, 'seat-02').then((v) => v.phase)).toBe('ordering');
  await clickSeat(page, 'seat-02');
  await expect.poll(() => view(page, 'seat-02').then((v) => v.canServe)).toBe(true);
  await page.evaluate(() => window.__prodDebug.dockAdd({ menu: '네기마', label: '좋음', good: true }));
  await page.waitForTimeout(230);
  await clickSeat(page, 'seat-02');
  await expect.poll(() => view(page, 'seat-02').then((v) => v.phase)).toBe('eating');

  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('settlement')).toBeVisible();
  const w = await wallet(page);
  expect(w.reputation).toBe(3); // 좋음 서빙 1건
  expect(w.gold).toBeGreaterThan(0); // 매출+팁 누적
});

test('구매: 골드 차감·소유·판매가 효과 반영', async ({ page }) => {
  await boot(page);
  const content = await page.evaluate(() => window.__prodDebug.contentContract());
  const upgrade = content.upgrades.find((item) => item.id === 'ingredient-chicken-t2');
  const startGold = upgrade.costGold + 2000;
  const expectedPrice = Math.round(content.day.economy.basePrice * upgrade.effect.value);
  expect(content.urls.day).toBe('/content/campaign/day-d1.json');
  expect(content.applied.economy).toEqual(content.day.economy);
  await page.evaluate(
    ({ gold, reputation }) => window.__prodDebug.setWallet(gold, reputation),
    { gold: startGold, reputation: Math.max(3, upgrade.reputationReq) },
  );
  expect(await page.evaluate(() => window.__prodDebug.economyBasePrice())).toBe(content.day.economy.basePrice);

  await page.getByTestId('end-day').click();
  await page.getByTestId('open-purchase').click();
  await expect(page.getByTestId('purchase')).toBeVisible();
  await expect(page.getByTestId('wallet-gold')).toHaveText(String(startGold));

  await page.getByTestId('buy-ingredient-chicken-t2').click();
  const w = await wallet(page);
  expect(w.gold).toBe(startGold - upgrade.costGold);
  expect(w.owned).toContain('ingredient-chicken-t2');
  expect(await page.evaluate(() => window.__prodDebug.economyBasePrice())).toBe(expectedPrice);
});

test('D1 그릴은 처음부터 고정 6칸이며 구형 grillSlots 구매를 노출·소비하지 않는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.setWallet(9999, 9));
  expect(await page.evaluate(() => window.__prodDebug.cookSlots().length)).toBe(6);

  await page.getByTestId('end-day').click();
  await page.getByTestId('open-purchase').click();
  await expect(page.getByTestId('cat-equipment')).toHaveCount(0);
  await expect(page.getByTestId('item-equipment-grill-slots-2')).toHaveCount(0);
  expect(await page.evaluate(() => window.__prodDebug.cookSlots().length)).toBe(6);

  await page.getByTestId('purchase-close').click(); // 구매 닫고 정산으로
  await page.getByTestId('next-day').click();
  await page.evaluate(() => {
    for (let index = 0; index < 3; index += 1) window.__prodDebug.cookFillAssembly();
    window.__prodDebug.cookPlace();
    window.__prodDebug.cookPlace();
  });
  expect((await page.evaluate(() => window.__prodDebug.cookSlots())).slice(0, 2)).toEqual([
    expect.objectContaining({ status: 'staged', contactFace: null, frontElapsedSec: 0 }),
    expect.objectContaining({ status: 'staged', contactFace: null, frontElapsedSec: 0 }),
  ]);
  await page.evaluate(() => window.__prodDebug.cookPlace());
  const started = (await page.evaluate(() => window.__prodDebug.cookSlots())).slice(0, 3);
  expect(started.every((slot) => slot.status === 'front' && slot.contactFace === 'front')).toBe(true);
  expect(new Set(started.map((slot) => slot.frontElapsedSec)).size).toBe(1);
});

test('게이팅: 명성·선행 조건이 구매를 막는다', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.setWallet(9999, 0)); // 골드 충분, 명성 0
  await page.getByTestId('end-day').click();
  await page.getByTestId('open-purchase').click();

  // 재료 탭: 닭 등급은 명성 1 필요 → 명성 0이면 잠금
  await expect(page.getByTestId('item-ingredient-chicken-t2')).toHaveAttribute('data-state', 'locked-rep');

  // 인테리어 탭: 12석은 8석 선행 필요
  await page.getByTestId('cat-interior').click();
  await expect(page.getByTestId('item-interior-seats-12')).toHaveAttribute('data-state', 'locked-prereq');

  // 명성 충족 후 8석 구매 → 12석 구매 가능
  await page.evaluate(() => window.__prodDebug.setWallet(9999, 9));
  await page.getByTestId('cat-interior').click(); // 재렌더
  await page.getByTestId('buy-interior-seats-8').click();
  await expect(page.getByTestId('item-interior-seats-12')).toHaveAttribute('data-state', 'buyable');
});
