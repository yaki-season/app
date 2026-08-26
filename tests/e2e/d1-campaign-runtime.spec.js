import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const campaignRecords = JSON.parse(readFileSync(fileURLToPath(
  new URL('../fixtures/campaign/s0-d5-preview.json', import.meta.url),
), 'utf8'));
const d1Record = JSON.parse(readFileSync(fileURLToPath(
  new URL('../fixtures/business-days/d1-full-day.json', import.meta.url),
), 'utf8'));

test('브라우저 localStorage에서 D1 전체 영업·정산·D2 저장 복구가 이어진다', async ({ page }) => {
  await page.goto('/src/single-customer-harness.html');
  const result = await page.evaluate(async ({ campaignRecords: campaignFixture, d1Record: d1Fixture }) => {
    const api = await import('/src/campaign-runtime.js');
    window.localStorage.clear();

    const campaignDefinition = api.assertEarlyCampaignDefinition(
      api.createCampaignDefinition(campaignFixture),
    );
    const d1Definition = api.createD1BusinessDayDefinition(d1Fixture);
    let clockTick = 0;
    const repository = new api.CampaignSaveRepository({
      storage: new api.LocalStorageAdapter(window.localStorage),
      clock: () => new Date(Date.UTC(2026, 6, 30, 2, clockTick++)),
      validatePayload: (payload) => api.validateCampaignState(payload, campaignDefinition),
      acceptsContentVersion: (version) => version === 'content-s0-d3-r1',
    });
    const campaign = new api.CampaignRuntime({
      definition: campaignDefinition,
      saveRepository: repository,
    });
    campaign.startNewCampaign({
      campaignId: 'browser-d1-campaign',
      contentVersion: 'content-s0-d3-r1',
      seed: 31,
    });
    campaign.finishPrologue();
    const d1 = new api.D1BusinessDayRuntime({
      definition: d1Definition,
      campaignRuntime: campaign,
    });
    const ui = new api.D1BusinessDayUiPort({
      runtime: d1,
      definition: d1Definition,
    });
    await ui.start({ runId: 'browser-d1-campaign:d1:run-1' });

    const dispatch = (intentId, type, fields = {}) => ui.dispatch({ intentId, type, ...fields });
    const accept = (orderId) => dispatch(`accept:${orderId}`, 'accept-order', { orderId });
    const serve = (customerId, menuId, index) => dispatch(
      `serve:${customerId}:${menuId}:${index}`,
      'serve-item',
      { customerId, menuId, quality: api.D1_QUALITY.PERFECT },
    );
    const advanceTo = (elapsedMs) => ui.advance(
      Math.max(0, elapsedMs - ui.getViewModel().clock.elapsedMs),
    );
    const cleanupAll = (prefix) => {
      ui.getViewModel().seats
        .filter((seat) => seat.cleanupNeeded)
        .forEach((seat) => dispatch(`${prefix}:${seat.seatId}`, 'begin-cleanup', {
          seatId: seat.seatId,
        }));
      ui.advance(3_000);
    };

    ui.advance(6_000);
    accept('D1-ORDER-001');
    serve('REGULAR_TSUKIOKA', 'beer', 1);
    serve('REGULAR_TSUKIOKA', 'negima', 1);
    serve('REGULAR_TSUKIOKA', 'negima', 2);
    ui.advance(16_000);
    cleanupAll('cleanup:tsukioka');

    advanceTo(100_000);
    ui.advance(6_000);
    accept('D1-ORDER-002-A');
    accept('D1-ORDER-002-B');
    serve('D1-OFFICE-A', 'beer', 1);
    serve('D1-OFFICE-A', 'negima', 1);
    serve('D1-OFFICE-B', 'beer', 1);
    serve('D1-OFFICE-B', 'negima', 1);
    ui.advance(16_000);
    cleanupAll('cleanup:office');

    advanceTo(220_000);
    ui.advance(6_000);
    accept('D1-ORDER-003');
    serve('D1-SOLO-A', 'negima', 1);
    ui.advance(16_000);
    cleanupAll('cleanup:solo');

    advanceTo(420_000);
    dispatch('charcoal', 'lower-charcoal');
    api.D1_SETTLEMENT_STEPS.forEach((_, index) => {
      dispatch(`settlement:${index}`, 'reveal-settlement-step');
    });
    const completed = await ui.finalize();

    const reloaded = new api.CampaignRuntime({
      definition: campaignDefinition,
      saveRepository: repository,
    });
    await reloaded.loadCampaign();
    return {
      completed: {
        ok: completed.ok,
        phase: completed.view.phase,
        summary: completed.settlement,
      },
      campaign: reloaded.getState(),
    };
  }, { campaignRecords, d1Record });

  expect(result.completed).toMatchObject({
    ok: true,
    phase: 'complete',
    summary: {
      customers: { visited: 4, lost: 0, cleanedSeats: 4 },
      orders: { accepted: 4, completed: 4, abandoned: 0 },
      economy: { revenue: 33, tip: 8, total: 41, reputation: 12 },
    },
  });
  expect(result.campaign).toMatchObject({
    campaign: {
      nodeId: 'd2',
      phase: 'pre-open',
      completedDayIds: ['d1'],
    },
    economy: {
      balance: 41,
      reputation: 12,
    },
  });
});

test('D4 후일담의 마지막 장면에서 실제 D5 토리카와 영업으로 이어진다', async ({ page }) => {
  await page.goto('/src/single-customer-harness.html');
  await page.evaluate(async () => {
    window.localStorage.clear();
    const { S0D3CampaignBridge } = await import('/src/scenario/s0-d3-campaign.js');
    const bridge = new S0D3CampaignBridge({ browserStorage: window.localStorage });
    bridge.newCampaign();
    bridge.finishPrologue();
    await bridge.startDay();
    for (let day = 1; day <= 4; day += 1) {
      bridge.enterSettlement();
      await bridge.completeDay(`D${day}`);
      if (day < 4) await bridge.startDay();
    }
  });

  await page.goto('/src/s0-d3.html?post=d4');
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D4-POST');
  await page.getByRole('button', { name: '이 장면 건너뛰기' }).click();
  await page.getByRole('button', { name: '이어서' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'D4-epilogue-1');
  await page.getByRole('button', { name: '다음 장면' }).click();
  await page.getByRole('button', { name: 'D5 영업으로' }).click();

  await expect(page).toHaveURL(/\/src\/d1-game\.html\?day=d5$/);
  await page.getByRole('button', { name: '조립', exact: true }).click();
  await expect(page.getByRole('button', { name: '토리카와', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '그릴', exact: true }).click();
  await expect(page.getByRole('button', { name: /소금 토리카와/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /타레 토리카와/ })).toBeVisible();
});
