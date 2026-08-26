import { expect, test } from '@playwright/test';
import {
  CampaignRuntime,
  CampaignSaveRepository,
  MemoryStorageAdapter,
  SAVE_STORAGE_KEYS,
  validateCampaignState,
} from '../../src/campaign-runtime.js';
import {
  S0_D3_CONTENT_VERSION,
  S0_D3_STORAGE_PREFIX,
  createS0D3CampaignDefinition,
} from '../../src/scenario/s0-d3-campaign.js';

async function d4PreOpenSave() {
  const storage = new MemoryStorageAdapter();
  const definition = createS0D3CampaignDefinition();
  const repository = new CampaignSaveRepository({
    storage,
    validatePayload: (payload) => validateCampaignState(payload, definition),
    acceptsContentVersion: (version) => version === S0_D3_CONTENT_VERSION,
  });
  const runtime = new CampaignRuntime({ definition, saveRepository: repository });
  runtime.startNewCampaign({
    campaignId: 'd4-upgrade-e2e',
    contentVersion: S0_D3_CONTENT_VERSION,
    seed: 4,
  });
  runtime.finishPrologue();
  for (const dayId of ['d1', 'd2', 'd3']) {
    await runtime.startDay();
    runtime.closeDayForSettlement();
    await runtime.completeDay({
      dayId,
      completionId: `d4-upgrade-e2e:${dayId}`,
      reward: dayId === 'd3'
        ? { reputation: 10, unlockIds: ['day-d4'] }
        : {},
    });
  }
  return storage.get(SAVE_STORAGE_KEYS.ACTIVE);
}

async function installD4Save(page) {
  const save = await d4PreOpenSave();
  await page.goto('/src/s0-d3.html');
  await page.evaluate(({ prefix, key, value }) => {
    localStorage.clear();
    localStorage.setItem(`${prefix}${key}`, value);
  }, { prefix: S0_D3_STORAGE_PREFIX, key: SAVE_STORAGE_KEYS.ACTIVE, value: save });
  await page.goto('/src/s0-d3.html');
}

async function skipD4PreOpenStory(page) {
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D4-PREOPEN');
  await page.getByRole('button', { name: '이 장면 건너뛰기' }).click();
  await expect(page.getByRole('heading', { name: '잠시 돌아보며' })).toBeVisible();
  await page.getByRole('button', { name: '이어서' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-screen-id', 'SCR-DAY-BRIEFING');
}

test('D4 프리오픈 뒤 명성 10으로 그릴 3칸을 수동 적용하고 재접속해 유지한다', async ({ page }) => {
  await installD4Save(page);
  await skipD4PreOpenStory(page);

  await expect(page.getByTestId('d4-current-reputation')).toHaveText('10');
  await expect(page.getByTestId('d4-required-reputation')).toHaveText('10');
  await expect(page.getByTestId('d4-grill-current-slots')).toHaveText('2칸');
  await expect(page.getByTestId('d4-claim-grill-upgrade')).toBeEnabled();
  await expect(page.getByTestId('d4-start-business-day')).toHaveText('2칸으로 넷째 영업 시작');

  await page.getByTestId('d4-claim-grill-upgrade').click();
  await expect(page.getByTestId('d4-grill-upgrade-status')).toContainText('명성과 골드는 그대로');
  await expect(page.getByTestId('d4-grill-current-slots')).toHaveText('3칸');
  await expect(page.getByTestId('d4-claim-grill-upgrade')).toBeDisabled();
  expect(await page.evaluate(() => window.__s0d3Debug.campaignState())).toMatchObject({
    economy: { reputation: 10, balance: 0 },
    progression: { claimedGrillSlots: 3 },
  });

  await page.reload();
  await skipD4PreOpenStory(page);
  await expect(page.getByTestId('d4-grill-current-slots')).toHaveText('3칸');
  await expect(page.getByTestId('d4-start-business-day')).toHaveText('3칸으로 넷째 영업 시작');
});

test('적용한 업그레이드는 D4 실제 그릴을 첫 프레임부터 3칸으로 열고 세 꼬치를 받는다', async ({ page }) => {
  await installD4Save(page);
  await skipD4PreOpenStory(page);
  await page.getByTestId('d4-claim-grill-upgrade').click();
  await expect(page.getByTestId('d4-grill-current-slots')).toHaveText('3칸');
  await page.getByTestId('d4-start-business-day').click();

  await expect(page).toHaveURL(/\/src\/d1-game\.html\?day=d4$/);
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-grill-slot-count', '3');
  await page.evaluate(() => window.__d1GameDebug.requestScreen('SCR-SVC-GRILL'));
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.activeScreen())).toBe('SCR-SVC-GRILL');

  const result = await page.evaluate(() => {
    const D = window.__d1GameDebug;
    const placements = [];
    for (let index = 0; index < 3; index += 1) {
      const seasoning = index === 1 ? 'tare' : 'salt';
      placements.push({
        staged: D.cookFillAssembly('negima', seasoning),
        placed: D.cookPlace('negima', seasoning),
      });
    }
    return {
      contract: D.grillContract(),
      placements,
      slots: D.cookSlots(),
      waiting: D.cookWaiting(),
    };
  });
  expect(result.contract).toMatchObject({
    contractId: 'D4-REPUTATION-THREE-SLOTS-R1',
    initialPlacementSlots: [1, 2, 3],
  });
  expect(result.placements).toEqual([
    { staged: true, placed: expect.objectContaining({ ok: true, slot: 0, seasoning: 'salt' }) },
    { staged: true, placed: expect.objectContaining({ ok: true, slot: 1, seasoning: 'tare' }) },
    { staged: true, placed: expect.objectContaining({ ok: true, slot: 2, seasoning: 'salt' }) },
  ]);
  expect(result.slots).toHaveLength(3);
  expect(result.slots.map(({ status }) => status)).toEqual(['front', 'front', 'front']);
  expect(result.slots.map(({ seasoning }) => seasoning)).toEqual(['salt', 'tare', 'salt']);
  expect(result.waiting).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.rawNegimaRuntime().status)).toBe('ready');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.rawNegimaRuntime().slots
    .map(({ approvedRawVisible }) => approvedRawVisible))).toEqual([true, true, true]);
});
