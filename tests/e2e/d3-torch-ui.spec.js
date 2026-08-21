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

test('D3 타레 모모 토치 UI는 진행 상태를 저장하고 회수한다', async ({ page }) => {
  await installD3Save(page);
  await page.goto('/src/d1-game.html?day=d3');
  await expect.poll(() => page.evaluate(() => !!window.__d1GameDebug)).toBe(true);

  await page.evaluate(() => window.__d1GameDebug.d3TorchStage());
  await expect(page.getByTestId('d3-torch-panel')).toBeVisible();
  await expect(page.getByTestId('d3-torch-cursor')).toBeHidden();
  await page.getByTestId('d3-apply-tare').click();
  await page.getByTestId('d3-reheat-tare').click();
  await page.getByTestId('d3-apply-tare').click();
  await page.getByTestId('d3-reheat-tare').click();
  await expect(page.getByTestId('d3-torch-state')).toContainText('토치 선택 가능');
  await expect(page.getByTestId('d3-torch-track')).toBeHidden();
  await page.getByTestId('d3-select-torch').click();

  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-GRILL'));
  await page.waitForTimeout(350);
  await expect.poll(() => page.evaluate(() => (
    window.__d1GameDebug.momoRuntime().slots.some((slot) => slot.visible && slot.stage === 'proper')
  ))).toBe(true);
  await expect(page.getByTestId('d3-torch-cursor')).toBeVisible();
  const viewport = page.viewportSize();
  await page.mouse.move(viewport.width * 0.29, viewport.height * 0.52);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(210);
  for (const x of [0.38, 0.47, 0.56, 0.65, 0.71]) {
    await page.waitForTimeout(210);
    await page.mouse.move(viewport.width * x, viewport.height * 0.52);
  }
  await page.mouse.up({ button: 'left' });
  await expect(page.getByTestId('d3-torch-state')).toContainText('작동 중');
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(80);
  await page.mouse.move(viewport.width * 0.47, viewport.height * 0.52);
  await page.mouse.up({ button: 'left' });
  await page.getByTestId('d3-finish-torch').click();
  await expect(page.getByTestId('d3-torch-state')).toContainText('Perfect');
  const stationPreservation = await page.evaluate(async () => {
    const debug = window.__d1GameDebug;
    const torchBefore = debug.d3TorchView().finish.torchCoverage;
    const drinkBefore = debug.pourExact(2.4, 0.8);
    debug.requestScreen('SCR-SVC-DRINK');
    await new Promise((resolve) => setTimeout(resolve, 350));
    debug.requestScreen('SCR-SVC-GRILL');
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      torchBefore,
      torchAfter: debug.d3TorchView().finish.torchCoverage,
      drinkBefore,
      drinkAfter: debug.drinkState(),
    };
  });
  expect(stationPreservation.torchAfter).toBe(stationPreservation.torchBefore);
  expect(stationPreservation.drinkAfter).toMatchObject({
    beerSec: stationPreservation.drinkBefore.beerSec,
    foamSec: stationPreservation.drinkBefore.foamSec,
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!window.__d1GameDebug)).toBe(true);
  await expect(page.getByTestId('d3-torch-panel')).toBeVisible();
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-GRILL'));
  await page.waitForTimeout(350);
  await expect.poll(() => page.evaluate(() => (
    window.__d1GameDebug.momoRuntime().slots.some((slot) => slot.visible && slot.stage === 'proper')
  ))).toBe(true);
  expect(await page.evaluate(() => window.__d1GameDebug.d3TorchView().finish.torchCoverage)).toBeGreaterThanOrEqual(0.8);

  await expect(page.getByTestId('d3-torch-state')).toContainText('Perfect');
  await page.getByTestId('d3-retrieve-momo').click();
  await expect.poll(() => page.evaluate(() => (
    window.__d1GameDebug.momoRuntime().slots.every((slot) => !slot.visible)
  ))).toBe(true);
  await expect(page.getByTestId('dock-shelf')).toContainText('모모');
});

test('타레 도포·재가열은 토치 선택 없이 별도 완료하고 회수한다', async ({ page }) => {
  await installD3Save(page);
  await page.goto('/src/d1-game.html?day=d3');
  await expect.poll(() => page.evaluate(() => !!window.__d1GameDebug)).toBe(true);
  await page.evaluate(() => window.__d1GameDebug.d3TorchStage());

  await page.getByTestId('d3-apply-tare').click();
  await expect(page.getByTestId('d3-reheat-tare')).toBeEnabled();
  await expect(page.getByTestId('d3-select-torch')).toBeDisabled();
  await page.getByTestId('d3-reheat-tare').click();
  await page.getByTestId('d3-apply-tare').click();
  await page.getByTestId('d3-reheat-tare').click();

  await expect(page.getByTestId('d3-select-torch')).toBeEnabled();
  await expect(page.getByTestId('d3-torch-track')).toBeHidden();
  await page.getByTestId('d3-retrieve-momo').click();
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.dockItems()
    .some((item) => item.menu === '타레 모모' && item.label === 'Perfect'))).toBe(true);
});

test('D3 8명·7주문은 마지막 정리 뒤 정산하고 후일담 종착 저장으로 전환한다', async ({ page }) => {
  await installD3Save(page);
  await page.goto('/src/d1-game.html?day=d3');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);

  const result = await page.evaluate(async () => {
    const D = window.__d1GameDebug;
    const waves = [
      [0, [['D3-ORDER-001', 'REGULAR_TSUKIOKA', [['momo', 1], ['beer', 1]]]]],
      [90000, [['D3-ORDER-002', 'D3-OFFICE-A', [['beer', 2], ['negima', 2]]]]],
      [210000, [['D3-ORDER-003', 'D3-SOLO-A', [['momo', 1], ['beer', 1]]], ['D3-ORDER-004', 'D3-COMMUTER-A', [['negima', 2]]]]],
      [270000, [['D3-ORDER-005', 'D3-SOLO-B', [['momo', 1], ['beer', 1]]]]],
      [330000, [['D3-ORDER-006', 'D3-COMMUTER-B', [['negima', 1], ['beer', 1]]], ['D3-ORDER-007', 'D3-SOLO-C', [['momo', 1], ['negima', 1]]]]],
    ];
    let event = 0;
    for (const [atMs, orders] of waves) {
      D.businessAdvanceTo(atMs);
      D.businessAdvance(6000);
      for (const [orderId, customerId, lines] of orders) {
        D.businessDispatch({ type: 'accept-order', intentId: `e2e:${event++}`, orderId });
        for (const [menu, quantity] of lines) for (let i = 0; i < quantity; i += 1) {
          D.businessDispatch({ type: 'serve-item', intentId: `e2e:${event++}`, customerId, menuId: menu, quality: 'Perfect' });
        }
      }
      D.businessAdvance(16000);
      while (D.businessView().seats.some((item) => item.cleanupNeeded)) {
        const seat = D.businessView().seats.find((item) => item.cleanupNeeded);
        D.businessBeginCleanup(seat.seatId);
        D.businessAdvance(3000);
      }
    }
    D.businessAdvanceTo(420000);
    while (D.businessView().seats.some((item) => item.cleanupNeeded)) {
      const seat = D.businessView().seats.find((item) => item.cleanupNeeded);
      D.businessBeginCleanup(seat.seatId);
      D.businessAdvance(3000);
    }
    await D.businessPostAction();
    for (let i = 0; i < 5; i += 1) await D.businessPostAction();
    await D.businessPostAction();
    return { view: D.businessView(), campaign: D.campaignState() };
  });
  expect(result.view.phase).toBe('complete');
  expect(result.campaign.campaign).toMatchObject({ nodeId: 'd4-preview', phase: 'preview' });

  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await expect(page.getByTestId('continue-button')).toHaveText('후일담으로 계속');
  await page.getByTestId('continue-button').click();
  await expect(page).toHaveURL(/\/src\/s0-d3\.html\?post=d3$/);
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D3-POST');

  for (let line = 0; line < 3; line += 1) {
    await page.locator('#actions .primary').click();
  }
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'D3-epilogue-1');
  await expect(page.getByRole('heading', { name: '불은 금세 식지 않았다' })).toBeVisible();

  for (let pageIndex = 1; pageIndex < 4; pageIndex += 1) {
    await page.getByRole('button', { name: '다음 장면' }).click();
  }
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'D3-epilogue-4');
  await expect(page.getByText('YAKI SEASON의 다음 이야기는 차후 공개됩니다.')).toBeVisible();

  await page.getByRole('button', { name: '메인 화면으로' }).click();
  await expect(page).toHaveURL(/\/src\/public-shell\.html$/);
  await expect(page.getByRole('button', { name: '후일담 다시 보기' })).toBeVisible();
  await expect(page.getByText('사흘의 영업을 마쳤습니다')).toBeVisible();
});

test('D3가 개방되지 않은 저장에서는 직접 URL로 기능 UI를 열 수 없다', async ({ page }) => {
  await page.goto('/src/d1-game.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/src/d1-game.html?day=d3');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessReady?.())).toBe(true);
  await expect(page.getByTestId('assembly-recipe-picker')).toBeHidden();
  await expect(page.getByTestId('d3-torch-panel')).toBeHidden();
  expect(await page.evaluate(() => window.__d1GameDebug.businessSession().ok)).toBe(false);
});

test('개발용 링크는 저장 없이 D3 토치 영업을 바로 연다', async ({ page }) => {
  await page.goto('/src/d1-game.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/src/d1-game.html?day=d3&devUnlock=1&reset=1');

  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await expect(page.getByTestId('d3-torch-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    window.__d1GameDebug.momoRuntime().slots.some((slot) => slot.visible && slot.stage === 'proper')
  ))).toBe(true);
  expect(await page.evaluate(() => window.__d1GameDebug.campaignState().campaign)).toMatchObject({
    nodeId: 'd3',
    phase: 'business',
  });
});
