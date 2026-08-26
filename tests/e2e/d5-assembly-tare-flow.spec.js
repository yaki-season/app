import { expect, test } from '@playwright/test';
import {
  CampaignRuntime,
  CampaignSaveRepository,
  MemoryStorageAdapter,
  SAVE_STORAGE_KEYS,
  validateCampaignState,
} from '../../src/campaign-runtime.js';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY } from '../../src/d1/firstOrderRuntimeStorage.js';
import {
  S0_D3_CONTENT_VERSION,
  S0_D3_STORAGE_PREFIX,
  createS0D3CampaignDefinition,
} from '../../src/scenario/s0-d3-campaign.js';

test.describe.configure({ retries: 0 });

async function d5PreOpenSave() {
  const storage = new MemoryStorageAdapter();
  const definition = createS0D3CampaignDefinition();
  const repository = new CampaignSaveRepository({
    storage,
    validatePayload: (payload) => validateCampaignState(payload, definition),
    acceptsContentVersion: (version) => version === S0_D3_CONTENT_VERSION,
  });
  const runtime = new CampaignRuntime({ definition, saveRepository: repository });
  runtime.startNewCampaign({
    campaignId: 'd5-tare-e2e',
    contentVersion: S0_D3_CONTENT_VERSION,
    seed: 5,
  });
  runtime.finishPrologue();
  for (const dayId of ['d1', 'd2', 'd3', 'd4']) {
    await runtime.startDay();
    runtime.closeDayForSettlement();
    await runtime.completeDay({
      dayId,
      completionId: `d5-tare-e2e:${dayId}`,
      reward: {},
    });
  }
  return storage.get(SAVE_STORAGE_KEYS.ACTIVE);
}

async function installD5Save(page) {
  const save = await d5PreOpenSave();
  await page.goto('/src/single-customer-harness.html');
  await page.evaluate(({ prefix, key, value }) => {
    localStorage.clear();
    localStorage.setItem(`${prefix}${key}`, value);
  }, { prefix: S0_D3_STORAGE_PREFIX, key: SAVE_STORAGE_KEYS.ACTIVE, value: save });
}

const D = (page, name, ...values) => page.evaluate(
  ({ debugName, args }) => window.__d1GameDebug[debugName](...args),
  { debugName: name, args: values },
);

async function waitForScreen(page, screenId) {
  await expect.poll(() => D(page, 'activeScreen')).toBe(screenId);
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
  await page.waitForTimeout(350);
}

async function clickObject(page, key) {
  const position = await D(page, 'screenPosOf', key);
  if (!position) throw new Error(`보이지 않는 조작 대상: ${key}`);
  await page.mouse.click(position.x, position.y);
}

async function bootD5Assembly(page) {
  await installD5Save(page);
  await page.goto('/src/d1-game.html?day=d5');
  await expect.poll(() => page.evaluate(() => (
    window.__d1GameDebug?.businessSession?.().ok ?? false
  ))).toBe(true);
  await expect.poll(() => D(page, 'kawaRuntime').then(({ status }) => status), {
    timeout: 15_000,
  }).toBe('approved');
  await page.getByRole('button', { name: '조립', exact: true }).click();
  await waitForScreen(page, 'SCR-SVC-ASSEMBLY');
  await page.getByRole('button', { name: '토리카와', exact: true }).click();
  await expect.poll(() => D(page, 'cookAssemblyProgress')).toMatchObject({
    menuId: 'kawa',
    index: 0,
    complete: false,
  });
}

async function assembleKawa(page) {
  for (let index = 1; index <= 5; index += 1) {
    // 토리카와 선택 중에는 같은 닭 재료 통이 접힌 닭껍질 한 조각을 공급한다.
    await clickObject(page, 'binTorikawa');
    await expect.poll(() => D(page, 'cookAssemblyProgress').then(({ index: value }) => value)).toBe(index);
    await expect.poll(() => D(page, 'assemblyArtRuntime').then(({ kawa }) => (
      kawa.build.ingredientCount
    ))).toBe(index);
    await page.waitForTimeout(230);
  }
  await expect.poll(() => D(page, 'cookAssemblyProgress')).toMatchObject({
    menuId: 'kawa',
    index: 5,
    complete: true,
  });
}

async function sweepAssemblySkewer(page, endRatio = 1) {
  const bounds = await D(page, 'assemblyTareTargetBounds');
  const y = (bounds.top + bounds.bottom) / 2;
  const width = bounds.right - bounds.left;
  await page.mouse.move(bounds.left + 4, y);
  await page.mouse.down();
  await page.mouse.move(bounds.left + width * endRatio - 4, y, { steps: 12 });
  await page.mouse.up();
}

test('D5 토리카와를 조립해 타레를 바르고 그릴에서 완벽으로 회수한다', async ({ page }) => {
  await bootD5Assembly(page);
  await assembleKawa(page);

  const pot = page.getByTestId('assembly-tare-pot');
  await pot.click();
  await expect(pot).toHaveAttribute('aria-pressed', 'true');
  await sweepAssemblySkewer(page);
  await expect.poll(() => D(page, 'cookAssemblyProgress')).toMatchObject({
    menuId: 'kawa',
    seasoning: 'tare',
    tarePrepared: true,
    tareCoverage: 1,
  });

  await clickObject(page, 'jigSkewer');
  await expect.poll(() => D(page, 'cookWaitingProducts')).toEqual([
    expect.objectContaining({ menuId: 'kawa', seasoning: 'tare', tarePrepared: true }),
  ]);

  await page.getByRole('button', { name: '그릴', exact: true }).click();
  await waitForScreen(page, 'SCR-SVC-GRILL');
  const row = page.getByTestId('grill-waiting-kawa');
  const tare = row.getByRole('button', { name: /타레 토리카와/ });
  await expect(tare).toBeEnabled();
  await tare.click();
  await expect.poll(() => D(page, 'cookSlots').then(([slot]) => slot)).toMatchObject({
    status: 'front',
    menuId: 'kawa',
    seasoning: 'tare',
    tarePrepared: true,
  });

  await D(page, 'cookElapse', 10);
  await clickObject(page, 'pgSlot0');
  await expect.poll(() => D(page, 'cookSlots').then(([slot]) => slot.status)).toBe('back');
  await D(page, 'cookElapse', 10);
  await clickObject(page, 'pgSlot0');
  await expect.poll(() => D(page, 'cookSlots').then(([slot]) => slot.status)).toBe('empty');
  await expect.poll(() => D(page, 'dockItems')).toContainEqual(expect.objectContaining({
    menuId: 'kawa',
    menu: '타레 토리카와',
    seasoning: 'tare',
    label: 'Perfect',
  }));
});

test('타레 소스통에 포커스한 뒤 좌우 화살표로 토리카와 전체를 칠한다', async ({ page }) => {
  await bootD5Assembly(page);
  await assembleKawa(page);

  const pot = page.getByTestId('assembly-tare-pot');
  const meter = page.getByRole('progressbar', { name: '타레 도포 범위' });
  await pot.click();
  await pot.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(meter).toHaveAttribute('aria-valuenow', '50');
  await expect.poll(() => D(page, 'cookAssemblyProgress').then(({ tarePrepared }) => tarePrepared)).toBe(false);

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => D(page, 'cookAssemblyProgress')).toMatchObject({
    menuId: 'kawa',
    seasoning: 'tare',
    tarePrepared: true,
    tareCoverage: 1,
  });
  await expect(meter).toHaveAttribute('aria-valuenow', '100');
  await expect(pot).toHaveAttribute('aria-pressed', 'false');

  await clickObject(page, 'jigSkewer');
  await expect.poll(() => D(page, 'cookWaitingProducts')).toEqual([
    expect.objectContaining({ menuId: 'kawa', seasoning: 'tare', tarePrepared: true }),
  ]);
});

test('완료 전 타레 도포 범위를 저장하고 새 문서에서 토리카와 조립 상태와 함께 복원한다', async ({ page }) => {
  await bootD5Assembly(page);
  await assembleKawa(page);

  const pot = page.getByTestId('assembly-tare-pot');
  await pot.click();
  await sweepAssemblySkewer(page, 0.25);
  const partial = await D(page, 'cookAssemblyProgress');
  expect(partial).toMatchObject({
    menuId: 'kawa',
    complete: true,
    seasoning: 'tare',
    tarePrepared: false,
  });
  expect(partial.tareCoverage).toBeGreaterThan(0);
  expect(partial.tareCoverage).toBeLessThan(0.8);

  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), FIRST_ORDER_RUNTIME_STORAGE_KEY);
  expect(persisted).toMatchObject({
    dayId: 'd5',
    cook: {
      assembly: {
        menuId: 'kawa',
        complete: true,
        seasoning: 'tare',
        tarePrepared: false,
        tareCoverage: partial.tareCoverage,
      },
    },
  });

  await page.reload();
  await expect.poll(() => page.evaluate(() => (
    window.__d1GameDebug?.businessSession?.().ok ?? false
  ))).toBe(true);
  await expect.poll(() => D(page, 'kawaRuntime').then(({ status }) => status), {
    timeout: 15_000,
  }).toBe('approved');
  await page.getByRole('button', { name: '조립', exact: true }).click();
  await waitForScreen(page, 'SCR-SVC-ASSEMBLY');
  await expect.poll(() => D(page, 'cookAssemblyProgress')).toMatchObject({
    menuId: 'kawa',
    index: 5,
    complete: true,
    seasoning: 'tare',
    tarePrepared: false,
    tareCoverage: partial.tareCoverage,
  });
  await expect(page.getByRole('progressbar', { name: '타레 도포 범위' }))
    .toHaveAttribute('aria-valuenow', String(Math.round(partial.tareCoverage * 100)));
  await expect(page.getByTestId('assembly-tare-pot')).toBeEnabled();
});
