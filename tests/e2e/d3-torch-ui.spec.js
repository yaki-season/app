import { test, expect } from '@playwright/test';
import {
  CampaignRuntime, CampaignSaveRepository, MemoryStorageAdapter, SAVE_STORAGE_KEYS,
  validateCampaignState,
} from '../../src/campaign-runtime.js';
import {
  S0_D3_CONTENT_VERSION, S0_D3_STORAGE_PREFIX, createS0D3CampaignDefinition,
} from '../../src/scenario/s0-d3-campaign.js';

async function d3PreOpenSave() {
  const storage = new MemoryStorageAdapter();
  const definition = createS0D3CampaignDefinition();
  const repository = new CampaignSaveRepository({
    storage,
    validatePayload: (payload) => validateCampaignState(payload, definition),
    acceptsContentVersion: (version) => version === S0_D3_CONTENT_VERSION,
  });
  const runtime = new CampaignRuntime({ definition, saveRepository: repository });
  runtime.startNewCampaign({ campaignId: 'd3-e2e', contentVersion: S0_D3_CONTENT_VERSION, seed: 3 });
  runtime.finishPrologue();
  for (const dayId of ['d1', 'd2']) {
    await runtime.startDay();
    runtime.closeDayForSettlement();
    await runtime.completeDay({ dayId, completionId: `d3-e2e:${dayId}`, reward: {} });
  }
  return storage.get(SAVE_STORAGE_KEYS.ACTIVE);
}

async function installD3Save(page) {
  const save = await d3PreOpenSave();
  await page.goto('/src/d1-game.html');
  await page.evaluate(({ prefix, key, value }) => {
    localStorage.clear();
    localStorage.setItem(`${prefix}${key}`, value);
  }, { prefix: S0_D3_STORAGE_PREFIX, key: SAVE_STORAGE_KEYS.ACTIVE, value: save });
}

async function bootD3Grill(page) {
  await installD3Save(page);
  await page.goto('/src/d1-game.html?day=d3');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-GRILL'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-GRILL');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
  await page.waitForTimeout(350);
}

async function bootD3Assembly(page) {
  await installD3Save(page);
  await page.goto('/src/d1-game.html?day=d3');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-ASSEMBLY'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-ASSEMBLY');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
  await page.waitForTimeout(350);
}

async function assembleNegima(page) {
  await page.evaluate(() => {
    const D = window.__d1GameDebug;
    for (const ingredient of ['chicken', 'leek', 'chicken', 'leek', 'chicken']) {
      D.cookClickIngredient(ingredient);
    }
  });
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.cookAssemblyProgress())).toMatchObject({
    menuId: 'negima',
    complete: true,
  });
}

test('D3 조립대에서만 소스통을 골라 한 번 좌우로 칠하면 타레 생꼬치가 된다', async ({ page }) => {
  await bootD3Assembly(page);
  const panel = page.getByTestId('assembly-tare-panel');
  const pot = page.getByTestId('assembly-tare-pot');
  await expect(panel).toBeVisible();
  await expect(pot).toBeDisabled();
  await assembleNegima(page);
  await expect(pot).toBeEnabled();

  await pot.click();
  await expect(pot).toHaveAttribute('aria-pressed', 'true');
  await expect(pot.locator('img')).toHaveAttribute('src', '/assets/campaign/d3/prop-tare-sauce-pot-open-r2-b1.png');
  await expect(page.getByTestId('assembly-tare-cursor')).toBeVisible();

  let bounds = await page.evaluate(() => window.__d1GameDebug.assemblyTareTargetBounds());
  let y = (bounds.top + bounds.bottom) / 2;
  await page.mouse.move(bounds.left + 4, y);
  await page.mouse.down();
  await page.mouse.move(bounds.left + (bounds.right - bounds.left) * 0.3, y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.cookAssemblyProgress().tarePrepared)).toBe(false);
  await expect(pot).toHaveAttribute('aria-pressed', 'true');

  bounds = await page.evaluate(() => window.__d1GameDebug.assemblyTareTargetBounds());
  y = (bounds.top + bounds.bottom) / 2;
  await page.mouse.move(bounds.left + 4, y);
  await page.mouse.down();
  await page.mouse.move(bounds.left + 4, bounds.top - 24);
  await page.mouse.move(bounds.right - 4, bounds.top - 24, { steps: 14 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.cookAssemblyProgress().tarePrepared)).toBe(false);
  await expect(pot).toHaveAttribute('aria-pressed', 'true');

  bounds = await page.evaluate(() => window.__d1GameDebug.assemblyTareTargetBounds());
  y = (bounds.top + bounds.bottom) / 2;
  await page.mouse.move(bounds.left + 4, y);
  await page.mouse.down();
  await page.mouse.move(bounds.right - 4, y, { steps: 14 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.cookAssemblyProgress())).toMatchObject({
    seasoning: 'tare',
    tarePrepared: true,
    tareCoverage: 1,
  });
  await expect(page.getByTestId('assembly-tare-cursor')).toBeHidden();
  await expect(pot.locator('img')).toHaveAttribute('src', '/assets/campaign/d3/prop-tare-sauce-pot-r2-b1.png');

  await page.evaluate(() => window.__d1GameDebug.cookTransferAssembly());
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.cookWaitingProducts())).toContainEqual(
    expect.objectContaining({ menuId: 'negima', seasoning: 'tare', tarePrepared: true }),
  );
});

test('그릴은 한 행의 소금·타레 재고를 구분해 소비하고 별도 소스통·토치를 표시하지 않는다', async ({ page }) => {
  await bootD3Assembly(page);
  await assembleNegima(page);
  await page.evaluate(() => window.__d1GameDebug.cookTransferAssembly());
  await assembleNegima(page);
  await page.evaluate(() => {
    const D = window.__d1GameDebug;
    D.cookSelectAssemblySeasoning('tare');
    D.cookBrushAssemblyTare(1);
    D.cookTransferAssembly();
    D.requestScreen('SCR-SVC-GRILL');
  });
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-GRILL');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
  await page.waitForTimeout(350);

  const row = page.getByTestId('grill-waiting-negima');
  const salt = row.getByRole('button', { name: /소금 네기마/ });
  const tare = row.getByRole('button', { name: /타레 네기마/ });
  await expect(row).toBeVisible();
  await expect(salt).toBeEnabled();
  await expect(tare).toBeEnabled();
  await expect(salt).toContainText('× 1');
  await expect(tare).toContainText('× 1');
  await expect(page.getByTestId('assembly-tare-panel')).toBeHidden();
  await expect(page.locator('[data-testid="grill-tare-pot"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="grill-tare-cursor"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="d3-torch"]')).toHaveCount(0);

  await tare.click();
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.cookSlots()[0])).toMatchObject({
    menuId: 'negima', seasoning: 'tare', tarePrepared: true,
  });
  await expect(tare).toBeDisabled();
  await expect(tare).toContainText('× 0');
  await expect(salt).toBeEnabled();
  await salt.click();
  await expect(page.getByTestId('grill-status-0')).toContainText('타레 네기마');
  await expect(page.getByTestId('grill-status-0')).toHaveAttribute('aria-label', /타레 네기마/);
  await expect(page.getByTestId('grill-status-1')).toContainText('소금 네기마');
  await expect(page.getByTestId('grill-status-1')).toHaveAttribute('aria-label', /소금 네기마/);
});

test('D3 8명·7주문은 마지막 정리 뒤 정산하고 D4 프리오픈으로 전환한다', async ({ page }) => {
  await installD3Save(page);
  await page.goto('/src/d1-game.html?day=d3');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);

  const result = await page.evaluate(async () => {
    const D = window.__d1GameDebug;
    let event = 0;
    const acceptAndServeVisibleOrders = () => {
      let view = D.businessView();
      for (const order of view.orders.filter(({ status }) => status === 'unaccepted')) {
        D.businessDispatch({ type: 'accept-order', intentId: `e2e:${event++}`, orderId: order.orderId });
      }
      view = D.businessView();
      for (const order of view.orders.filter(({ status }) => ['accepted', 'partial'].includes(status))) {
        for (const line of order.lines) {
          for (let i = 0; i < line.remaining; i += 1) {
            D.businessDispatch({
              type: 'serve-item',
              intentId: `e2e:${event++}`,
              customerId: order.customerId,
              menuId: line.menuId,
              seasoning: line.seasoning,
              quality: 'Perfect',
            });
          }
        }
      }
    };
    const cleanSeats = () => {
      while (D.businessView().seats.some((item) => item.cleanupNeeded)) {
        const seat = D.businessView().seats.find((item) => item.cleanupNeeded);
        D.businessBeginCleanup(seat.seatId);
        D.businessAdvance(3000);
      }
    };
    // 개인 손님은 도메인 내부 100ms step에서 최소 4초 간격으로 들어온다. 고정 고객·메뉴
    // 순서를 가정하지 않고 현재 화면에 도착한 주문을 주기적으로 처리해 추첨 결과와 독립시킨다.
    for (let guard = 0; guard < 30 && D.businessView().phase === 'open'; guard += 1) {
      D.businessAdvance(20000);
      acceptAndServeVisibleOrders();
      cleanSeats();
    }
    for (let drain = 0; drain < 30 && D.businessView().phase === 'closing-drain'; drain += 1) {
      acceptAndServeVisibleOrders();
      D.businessAdvance(4000);
      cleanSeats();
    }
    await D.businessPostAction();
    for (let i = 0; i < 5; i += 1) await D.businessPostAction();
    await D.businessPostAction();
    return { view: D.businessView(), campaign: D.campaignState() };
  });
  expect(result.view.phase).toBe('complete');
  expect(result.campaign.campaign).toMatchObject({ nodeId: 'd4', phase: 'pre-open' });

  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await expect(page.getByTestId('continue-button')).toHaveText('D4로 계속');
  await page.getByTestId('continue-button').click();
  await expect(page).toHaveURL(/\/src\/s0-d3\.html\?post=d3$/);
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D3-POST');

  for (let line = 0; line < 3; line += 1) await page.locator('#actions .primary').click();
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D4-PREOPEN');
  await expect(page.getByText('기다리는 동안 먼저 낼 사라다를 준비해 두자', { exact: false })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-story-illustration-asset-id', 'IL-D4-PREOPEN-PIXEL');
  await expect(page.locator('#story-illustration')).toHaveAttribute('src', '/public/assets/core/s0/story/d4-preopen-full-scene-r4-b1.png');
  await expect(page.locator('#story-illustration')).toBeVisible();
  await expect(page.locator('#story-portrait')).toBeHidden();
  await expect(page.locator('#story-background')).toBeHidden();
});

test('D3가 개방되지 않은 저장에서는 직접 URL로 타레 기능을 열 수 없다', async ({ page }) => {
  await page.goto('/src/d1-game.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/src/d1-game.html?day=d3');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessReady?.())).toBe(true);
  await expect(page.getByTestId('assembly-recipe-picker')).toBeHidden();
  await expect(page.getByTestId('assembly-tare-panel')).toBeHidden();
  await expect(page.locator('[data-testid^="d3-torch"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__d1GameDebug.businessSession().ok)).toBe(false);
});

test('개발용 링크는 저장 없이 D3 영업과 새 타레 재고 UI를 연다', async ({ page }) => {
  await page.goto('/src/d1-game.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/src/d1-game.html?day=d3&devUnlock=1&reset=1');

  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-ASSEMBLY'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-ASSEMBLY');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
  await page.waitForTimeout(350);
  await expect(page.getByTestId('assembly-tare-panel')).toBeVisible();
  await expect(page.getByTestId('assembly-tare-pot')).toBeDisabled();
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-GRILL'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-GRILL');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.isTransitioning())).toBe(false);
  await page.waitForTimeout(350);
  await expect(page.getByTestId('assembly-tare-panel')).toBeHidden();
  await expect(page.locator('[data-testid="grill-tare-pot"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="d3-torch"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /타레 네기마/ })).toBeVisible();
  expect(await page.evaluate(() => window.__d1GameDebug.campaignState().campaign)).toMatchObject({
    nodeId: 'd3',
    phase: 'business',
  });
});
