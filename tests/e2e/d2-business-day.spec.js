import { test, expect } from '@playwright/test';
import {
  CampaignRuntime, CampaignSaveRepository, MemoryStorageAdapter, SAVE_STORAGE_KEYS,
  validateCampaignState,
} from '../../src/campaign-runtime.js';
import {
  S0_D3_CONTENT_VERSION, S0_D3_STORAGE_PREFIX, createS0D3CampaignDefinition,
} from '../../src/scenario/s0-d3-campaign.js';

async function d2PreOpenSave() {
  const storage = new MemoryStorageAdapter();
  const definition = createS0D3CampaignDefinition();
  const repository = new CampaignSaveRepository({
    storage,
    validatePayload: (payload) => validateCampaignState(payload, definition),
    acceptsContentVersion: (version) => version === S0_D3_CONTENT_VERSION,
  });
  const runtime = new CampaignRuntime({ definition, saveRepository: repository });
  runtime.startNewCampaign({ campaignId: 'd2-e2e', contentVersion: S0_D3_CONTENT_VERSION, seed: 2 });
  runtime.finishPrologue();
  await runtime.startDay();
  runtime.closeDayForSettlement();
  await runtime.completeDay({ dayId: 'd1', completionId: 'd2-e2e:d1', reward: {} });
  return storage.get(SAVE_STORAGE_KEYS.ACTIVE);
}

async function installD2Save(page) {
  const save = await d2PreOpenSave();
  await page.goto('/src/d1-game.html');
  await page.evaluate(({ prefix, key, value }) => {
    localStorage.clear();
    localStorage.setItem(`${prefix}${key}`, value);
  }, { prefix: S0_D3_STORAGE_PREFIX, key: SAVE_STORAGE_KEYS.ACTIVE, value: save });
}

test('D2 모모는 조립·독립 양면 굽기·회수까지 실제 공정을 통과한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installD2Save(page);
  await page.goto('/src/d1-game.html?day=d2');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.momoRuntime?.().status)).toBe('approved');

  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-ASSEMBLY'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
  await page.getByTestId('assembly-recipe-picker').getByRole('button', { name: '모모' }).click();
  for (let index = 0; index < 5; index += 1) {
    const position = await page.evaluate(() => window.__d1GameDebug.screenPosOf('binChicken'));
    await page.mouse.click(position.x, position.y);
    await expect.poll(() => page.evaluate(() => window.__d1GameDebug.cookAssemblyIndex())).toBe(index + 1);
    await page.waitForTimeout(230);
  }
  const jig = await page.evaluate(() => window.__d1GameDebug.screenPosOf('jigSkewer'));
  await page.mouse.click(jig.x, jig.y);
  expect(await page.evaluate(() => window.__d1GameDebug.assemblyArtRuntime().waitingItems)).toEqual(['momo']);

  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-GRILL'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
  await expect(page.getByTestId('grill-waiting-momo')).toBeEnabled();
  await page.getByTestId('grill-waiting-momo').click();
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.momoRuntime().slots[0].visible)).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.cookElapse(9));
  await page.evaluate(() => window.__d1GameDebug.cookClickSlot(0));
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__d1GameDebug.cookElapse(9));
  await page.evaluate(() => window.__d1GameDebug.cookClickSlot(0));
  await expect(page.locator('.dock-card[data-menu-id="momo"]')).toContainText('모모');
  const customerVisual = await page.evaluate(() => {
    const D = window.__d1GameDebug;
    D.businessAdvance(6000);
    D.businessDispatch({ type: 'accept-order', intentId: 'd2:momo:accept', orderId: 'D2-ORDER-001' });
    D.businessDispatch({ type: 'serve-item', intentId: 'd2:momo:serve', customerId: 'REGULAR_TSUKIOKA', menuId: 'momo', quality: 'Perfect' });
    D.requestScreen('SCR-SVC-CUSTOMERS');
    return new Promise((resolve) => setTimeout(() => resolve(D.tsukiokaVisual()), 500));
  });
  expect(customerVisual).toMatchObject({
    artId: 'D1-TSUKIOKA-RECEIVED-EATING',
    plateVisible: true,
    beerVisible: false,
  });
  expect(customerVisual.plateTextureUrl).toContain('pr-served-momo-plate-r1-b1.png');
  expect(errors).toEqual([]);
});

test('D2 6명·5주문·10항목은 정리와 정산을 거쳐 D3로 전환한다', async ({ page }) => {
  await installD2Save(page);
  await page.goto('/src/d1-game.html?day=d2');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);

  // 손님 구성은 매 판 뽑히므로(D2부터) id·메뉴를 적어 두지 않고 그때그때 화면 상태를 보고 낸다.
  const result = await page.evaluate(async () => {
    const D = window.__d1GameDebug;
    let event = 0;
    const dispatch = (type, fields) => D.businessDispatch({ type, intentId: `d2:e2e:${event += 1}`, ...fields });

    for (let step = 0; step < 90; step += 1) {
      D.businessAdvance(6_000);
      const view = D.businessView();
      for (const order of view.orders) {
        if (order.status === 'unaccepted') dispatch('accept-order', { orderId: order.orderId });
      }
      for (const order of view.orders) {
        const seat = view.seats.find((item) => item.orderId === order.orderId && item.customerId);
        if (!seat) continue;
        for (const line of order.lines) {
          for (let index = 0; index < line.remaining; index += 1) {
            dispatch('serve-item', { customerId: seat.customerId, menuId: line.menuId, quality: 'Perfect' });
          }
        }
      }
      for (const seat of D.businessView().seats) {
        if (seat.cleanupNeeded) {
          D.businessBeginCleanup(seat.seatId);
          D.businessAdvance(3_000);
        }
      }
      if (D.businessView().settlement.summary) break;
    }

    D.businessAdvanceTo(420_000);
    while (D.businessView().seats.some((item) => item.cleanupNeeded)) {
      const seat = D.businessView().seats.find((item) => item.cleanupNeeded);
      D.businessBeginCleanup(seat.seatId);
      D.businessAdvance(3_000);
    }
    await D.businessPostAction();
    for (let index = 0; index < 5; index += 1) await D.businessPostAction();
    await D.businessPostAction();
    return { view: D.businessView(), campaign: D.campaignState() };
  });

  expect(result.view.phase, JSON.stringify(result.view)).toBe('complete');
  expect(result.view.settlement.summary).toMatchObject({
    customers: { visited: 6 },
    orders: { completed: 5 },
  });
  expect(result.campaign.campaign).toMatchObject({ nodeId: 'd3', phase: 'pre-open' });
  await page.getByTestId('continue-button').click();
  await expect(page).toHaveURL(/\/src\/s0-d3\.html\?post=d2$/);
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D2-POST');
  await page.locator('#actions button.primary').click();
  await page.locator('#actions button.primary').click();
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D3-PREOPEN');
});
