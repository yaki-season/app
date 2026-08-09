import { expect, test } from '@playwright/test';

const RELEASE_URL = '/content/releases/d1-business-day-definition.v1.json';
const STORAGE_PREFIX = 'yaki-season.dev2-scenario.';
const STORAGE_KEY = Object.freeze({
  active: 'yaki-season.save.active',
  backup1: 'yaki-season.save.backup.1',
  backup2: 'yaki-season.save.backup.2',
});
const D = (page, name, ...args) => page.evaluate(
  ({ debugName, values }) => window.__d1GameDebug[debugName](...values),
  { debugName: name, values: args },
);

async function skipStory(page) {
  await page.getByRole('button', { name: '이야기 건너뛰기' }).click();
  await expect(page.getByRole('heading', { name: '이야기 요약' })).toBeVisible();
  await expect(page.locator('.summary li')).toHaveCount(3);
  await page.locator('#actions .primary').click();
}

async function readStory(page) {
  await page.locator('#actions .primary').click();
  await page.locator('#actions .primary').click();
  await page.locator('#actions .primary').click();
}

async function completeS0Interactions(page) {
  for (const label of ['열쇠 집기', '가게 문 열기']) {
    await page.getByRole('button', { name: label }).click();
  }
}

async function beginPublicNewGame(page) {
  await page.goto('/src/public-shell.html');
  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  await expect(page).toHaveURL(/\/src\/s0-d3\.html\?new=1$/);
}

async function waitForD1Boot(page) {
  await expect(page).toHaveURL(/\/src\/d1-game\.html$/);
  await expect.poll(() => page.evaluate(() => Boolean(window.__d1GameDebug))).toBe(true);
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  expect(await D(page, 'businessSession')).toMatchObject({ ok: true });
}

async function storedEnvelope(page, slot = 'active') {
  return page.evaluate(({ prefix, key }) => {
    const raw = localStorage.getItem(`${prefix}${key}`);
    return raw === null ? null : JSON.parse(raw);
  }, { prefix: STORAGE_PREFIX, key: STORAGE_KEY[slot] });
}

async function dispatch(page, intentId, type, fields = {}) {
  const result = await D(page, 'businessDispatch', { intentId, type, ...fields });
  expect(result, `${intentId}: ${JSON.stringify(result)}`).toMatchObject({ ok: true });
  return result;
}

async function serve(page, customerId, menuId, index) {
  return dispatch(page, `serve:${customerId}:${menuId}:${index}`, 'serve-item', {
    customerId,
    menuId,
    quality: 'Perfect',
  });
}

async function cleanupAll(page, prefix) {
  const view = await D(page, 'businessView');
  for (const seat of view.seats.filter((candidate) => candidate.cleanupNeeded)) {
    await dispatch(page, `${prefix}:${seat.seatId}`, 'begin-cleanup', { seatId: seat.seatId });
  }
  await D(page, 'businessAdvance', 3000);
}

async function finishD1(page) {
  await D(page, 'businessAdvance', 6000);
  await dispatch(page, 'accept:d1-1', 'accept-order', { orderId: 'D1-ORDER-001' });
  await serve(page, 'REGULAR_TSUKIOKA', 'beer', 1);
  await serve(page, 'REGULAR_TSUKIOKA', 'negima', 1);
  await serve(page, 'REGULAR_TSUKIOKA', 'negima', 2);
  await D(page, 'businessAdvance', 16000);
  await cleanupAll(page, 'cleanup:d1-1');

  await D(page, 'businessAdvanceTo', 100000);
  await D(page, 'businessAdvance', 6000);
  await dispatch(page, 'accept:d1-2a', 'accept-order', { orderId: 'D1-ORDER-002-A' });
  await dispatch(page, 'accept:d1-2b', 'accept-order', { orderId: 'D1-ORDER-002-B' });
  await serve(page, 'D1-OFFICE-A', 'beer', 1);
  await serve(page, 'D1-OFFICE-A', 'negima', 1);
  await serve(page, 'D1-OFFICE-B', 'beer', 1);
  await serve(page, 'D1-OFFICE-B', 'negima', 1);
  await D(page, 'businessAdvance', 16000);
  await cleanupAll(page, 'cleanup:d1-2');

  await D(page, 'businessAdvanceTo', 220000);
  await D(page, 'businessAdvance', 6000);
  await dispatch(page, 'accept:d1-3', 'accept-order', { orderId: 'D1-ORDER-003' });
  await serve(page, 'D1-SOLO-A', 'negima', 1);
  await D(page, 'businessAdvance', 16000);
  await cleanupAll(page, 'cleanup:d1-3');

  await D(page, 'businessAdvanceTo', 420000);
  await dispatch(page, 'charcoal:d1', 'lower-charcoal');
  for (let index = 0; index < 5; index += 1) {
    await dispatch(page, `settlement:d1:${index}`, 'reveal-settlement-step');
  }
}

test('요약 경로: 공개 새 게임은 실제 release와 공통 day-start 저장으로 D1 전체 영업을 부팅한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await beginPublicNewGame(page);
  await completeS0Interactions(page);
  await skipStory(page);
  const releaseResponsePromise = page.waitForResponse((response) => (
    response.url().endsWith(RELEASE_URL) && response.request().method() === 'GET'
  ));
  await skipStory(page);
  const releaseResponse = await releaseResponsePromise;

  expect(releaseResponse.status()).toBe(200);
  const release = await releaseResponse.json();
  expect(release).toMatchObject({
    totals: { customers: 4, orders: 4, items: 8 },
    economy: { menuPrices: { beer: 6, negima: 3 } },
  });
  expect(release.waves[0].customers[0].id).toBe('REGULAR_TSUKIOKA');

  await waitForD1Boot(page);
  const view = await D(page, 'businessView');
  expect(view.seats).toHaveLength(6);
  await D(page, 'businessAdvance', 6000);
  expect((await D(page, 'businessView')).seats.some(
    (seat) => seat.customerId === 'REGULAR_TSUKIOKA',
  )).toBe(true);
  await expect(page.locator('body')).not.toHaveAttribute('data-state-id', 'D1-business-placeholder');

  const active = await storedEnvelope(page);
  expect(active).toMatchObject({
    checkpointType: 'day-start',
    campaignId: 'scenario-s0-d3',
    contentVersion: 'content-s0-d3-r1',
    payload: {
      meta: { campaignId: 'scenario-s0-d3', contentVersion: 'content-s0-d3-r1', seed: 0 },
      campaign: { nodeId: 'd1', phase: 'pre-open' },
    },
  });
  expect(await D(page, 'campaignState')).toMatchObject({
    meta: { campaignId: 'scenario-s0-d3', contentVersion: 'content-s0-d3-r1', seed: 0 },
    campaign: { nodeId: 'd1', phase: 'business' },
  });

  await page.reload();
  await waitForD1Boot(page);
  expect(await D(page, 'businessSession')).toMatchObject({ ok: true, resumed: true });
  expect((await D(page, 'businessView')).clock.elapsedMs).toBeLessThan(2000);
  expect(await storedEnvelope(page)).toMatchObject({
    checkpointType: 'day-start',
    payload: { campaign: { nodeId: 'd1', phase: 'pre-open' } },
  });
  expect(errors).toEqual([]);
});

test('전체 대사 경로도 S0와 D1 pre-open을 읽은 뒤 실제 D1으로 이동한다', async ({ page }) => {
  await beginPublicNewGame(page);
  await completeS0Interactions(page);
  await readStory(page);
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D1-PREOPEN');
  await readStory(page);
  await waitForD1Boot(page);
});

test('키보드 S0 두 입력 뒤 점화 대사와 요약으로 실제 D1을 부팅한다', async ({ page }) => {
  await beginPublicNewGame(page);
  for (const label of ['열쇠 집기', '가게 문 열기']) {
    const action = page.getByRole('button', { name: label });
    await action.focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-S0-001');
  await expect(page.locator('.dialogue')).toHaveText('화로에 다시 불이 들었다. 숯 냄새가 먼저 기억을 깨우네.');
  await skipStory(page);
  await skipStory(page);
  await waitForD1Boot(page);
});

test('day-start 저장 실패 시 d1-game으로 이동하지 않고 campaign-error를 표시한다', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__failCampaignDayStart = false;
    Storage.prototype.setItem = function setItem(key, value) {
      if (window.__failCampaignDayStart && String(key).includes('yaki-season.save.pending')) {
        throw new DOMException('의도된 day-start 저장 실패', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    };
  });
  let releaseRequestCount = 0;
  page.on('request', (request) => {
    if (request.url().endsWith(RELEASE_URL)) releaseRequestCount += 1;
  });

  await beginPublicNewGame(page);
  await completeS0Interactions(page);
  await skipStory(page);
  await page.evaluate(() => { window.__failCampaignDayStart = true; });
  await skipStory(page);

  await expect(page).toHaveURL(/\/src\/s0-d3\.html\?new=1$/);
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'campaign-error');
  await expect(page.getByRole('heading', { name: '진행을 계속할 수 없습니다' })).toBeVisible();
  expect(await page.evaluate(() => window.__s0d3Debug.campaignState())).toMatchObject({
    campaign: { nodeId: 'd1', phase: 'pre-open' },
  });
  expect(await storedEnvelope(page)).toBeNull();
  expect(releaseRequestCount).toBe(0);
});

test('S0 진행 중 새로고침은 저장 전 안전 정책대로 첫 상호작용으로 돌아간다', async ({ page }) => {
  await beginPublicNewGame(page);
  await page.getByRole('button', { name: '열쇠 집기' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'S0-STATE-GATE');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'S0-STATE-KEY');
  expect(await storedEnvelope(page)).toBeNull();
});

test('새 게임 첫 checkpoint 전 기존 active를 보존하고 성공 뒤 backup 정책으로 남긴다', async ({ page }) => {
  await page.goto('/src/index.html');
  const existingRaw = await page.evaluate(async () => {
    localStorage.clear();
    const { S0D3CampaignBridge } = await import('/src/scenario/s0-d3-campaign.js');
    const bridge = new S0D3CampaignBridge({
      browserStorage: localStorage,
      campaignId: 'existing-before-new',
      seed: 77,
    });
    await bridge.loadOrStart();
    bridge.finishPrologue();
    await bridge.startDay();
    return localStorage.getItem(
      'yaki-season.dev2-scenario.yaki-season.save.active',
    );
  });

  await page.goto('/src/public-shell.html');
  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  await page.getByRole('button', { name: '새 게임 시작' }).click();
  await expect(page).toHaveURL(/\/src\/s0-d3\.html\?new=1$/);
  expect(await page.evaluate(
    (key) => localStorage.getItem(key),
    `${STORAGE_PREFIX}${STORAGE_KEY.active}`,
  )).toBe(existingRaw);

  await completeS0Interactions(page);
  await skipStory(page);
  await skipStory(page);
  await waitForD1Boot(page);
  expect(await storedEnvelope(page)).toMatchObject({
    campaignId: 'scenario-s0-d3',
    checkpointType: 'day-start',
  });
  const backups = await page.evaluate(({ prefix, keys }) => keys.map(
    (key) => localStorage.getItem(`${prefix}${key}`),
  ), {
    prefix: STORAGE_PREFIX,
    keys: [STORAGE_KEY.backup1, STORAGE_KEY.backup2],
  });
  expect(backups).toContain(existingRaw);
});

test('D1 완료 저장은 D2 pre-open으로 이어지고 public shell 이어하기와 재호출에 보상이 중복되지 않는다', async ({ page }) => {
  await beginPublicNewGame(page);
  await completeS0Interactions(page);
  await skipStory(page);
  await skipStory(page);
  await waitForD1Boot(page);
  await finishD1(page);

  const beforeFinalize = await D(page, 'businessView');
  expect(beforeFinalize.orders).toHaveLength(4);
  expect(beforeFinalize.orders.reduce(
    (sum, order) => sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0),
    0,
  )).toBe(8);
  expect(await D(page, 'businessFinalize')).toMatchObject({ ok: true, duplicate: false });
  expect(await D(page, 'businessFinalize')).toMatchObject({ ok: true, duplicate: true });
  expect(await D(page, 'campaignState')).toMatchObject({
    campaign: { nodeId: 'd2', phase: 'pre-open', completedDayIds: ['d1'] },
    economy: { settlements: [expect.objectContaining({ completionId: expect.any(String) })] },
  });
  expect((await D(page, 'campaignState')).economy.settlements).toHaveLength(1);
  expect(await storedEnvelope(page)).toMatchObject({
    checkpointType: 'day-complete',
    completedDayId: 'd1',
    payload: {
      campaign: { nodeId: 'd2', phase: 'pre-open', completedDayIds: ['d1'] },
      economy: { settlements: [expect.objectContaining({ completionId: expect.any(String) })] },
    },
  });

  await page.goto('/src/public-shell.html');
  await page.getByRole('button', { name: '이어하기' }).click();
  await expect(page).toHaveURL(/\/src\/s0-d3\.html$/);
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', 'SCN-D2-PREOPEN');
  await expect(page.locator('body')).not.toHaveAttribute('data-scene-id', 'SCN-S0-DECISION');
  expect(await page.evaluate(() => window.__s0d3Debug.campaignState())).toMatchObject({
    campaign: { nodeId: 'd2', phase: 'pre-open' },
    economy: { settlements: [expect.objectContaining({ completionId: expect.any(String) })] },
  });
  expect((await page.evaluate(
    () => window.__s0d3Debug.campaignState().economy.settlements,
  ))).toHaveLength(1);
});
