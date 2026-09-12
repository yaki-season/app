import { expect, test } from '@playwright/test';
import { publicGrillLayout } from '../../src/config/d1GrillLayout.js';
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

async function d4PreOpenSave(reputation = 12, day = 4) {
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
  for (const dayId of ['d1', 'd2', 'd3', 'd4', 'd5'].slice(0, day - 1)) {
    await runtime.startDay();
    runtime.closeDayForSettlement();
    await runtime.completeDay({
      dayId,
      completionId: `d4-upgrade-e2e:${dayId}`,
      reward: dayId === 'd3'
        ? { reputation, unlockIds: ['day-d4'] }
        : {},
    });
  }
  return storage.get(SAVE_STORAGE_KEYS.ACTIVE);
}

async function installD4Save(page, reputation = 12, day = 4) {
  const save = await d4PreOpenSave(reputation, day);
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
  await expect(page.locator('body')).toHaveAttribute('data-screen-id', 'SCR-DAY-BRIEFING');
}

test('명성 경계·수동 설치·중복 방지·재접속 저장을 실제 마켓에서 확인한다', async ({ page }) => {
  await installD4Save(page, 11); await skipD4PreOpenStory(page);
  await expect(page.getByTestId('market-claim-3')).toBeDisabled();
  await expect(page.getByTestId('market-item-3')).toContainText('1 더 모으기');
  await installD4Save(page); await skipD4PreOpenStory(page);
  await expect(page.getByTestId('market-stats')).toHaveText('명성 12 · 설치된 그릴 2칸');
  await page.getByTestId('market-claim-3').click();
  await expect(page.getByTestId('market-status')).toContainText('명성은 12 그대로');
  await expect(page.getByTestId('market-claim-3')).toBeDisabled();
  await expect(page.getByTestId('market-claim-4')).toBeDisabled();
  await page.reload(); await skipD4PreOpenStory(page);
  await expect(page.getByTestId('market-stats')).toHaveText('명성 12 · 설치된 그릴 3칸');
  await page.getByTestId('market-start-business').click();
  await expect(page.locator('body')).toHaveAttribute('data-grill-slot-count', '3');
});

test('저장 실패는 설비를 설치하지 않으며 같은 버튼으로 재시도한다', async ({ page }) => {
  await installD4Save(page); await skipD4PreOpenStory(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.includes('yaki-season.dev2-scenario.')) throw new DOMException('Test quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    window.restoreMarketStorage = () => { Storage.prototype.setItem = original; };
  });
  await page.getByTestId('market-claim-3').click();
  await expect(page.getByTestId('market-status')).toContainText('저장하지 못했습니다');
  await expect(page.getByTestId('market-stats')).toContainText('2칸');
  await page.evaluate(() => window.restoreMarketStorage());
  await page.getByTestId('market-claim-3').click();
  await expect(page.getByTestId('market-stats')).toContainText('3칸');
});

test('D5 이어하기도 마켓을 거쳐 영업을 시작한다', async ({ page }) => {
  await installD4Save(page, 30, 5);
  await page.goto('/public-shell.html');
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  await expect(page.getByTestId('reputation-market')).toBeVisible();
  await expect(page.getByTestId('market-start-business')).toContainText('D5');
});

test('손상된 상품 응답은 현재 설비 영업과 상품 재시도를 모두 제공한다', async ({ page }) => {
  await page.route('**/content/progression/grill-slots.json', route => route.fulfill({ json: { tiers: 'damaged' } }));
  await installD4Save(page); await skipD4PreOpenStory(page);
  await expect(page.getByTestId('market-status')).toContainText('상품 정보를 불러오지 못했습니다');
  await expect(page.getByTestId('market-start-business')).toBeEnabled();
  await page.unroute('**/content/progression/grill-slots.json');
  await page.getByRole('button', { name: '상품 다시 불러오기' }).click();
  await expect(page.getByTestId('market-claim-3')).toBeEnabled();
});

test('영업 중 뒤로가기로 마켓에 돌아와도 설비를 바꾸지 않고 같은 영업을 재개한다', async ({ page }) => {
  await installD4Save(page, 90); await skipD4PreOpenStory(page);
  await page.getByTestId('market-start-business').click();
  await expect(page.locator('body')).toHaveAttribute('data-grill-slot-count', '2');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug.businessView().clock.elapsedMs)).toBeGreaterThan(500);
  const before = await page.evaluate(() => window.__d1GameDebug.businessView());
  await page.goBack();
  await expect(page.locator('body')).toHaveAttribute('data-scene-id', /SCN-D4-(PREOPEN|DAY-PREP)/);
  if (await page.getByRole('button', { name: '이 장면 건너뛰기' }).isVisible()) await skipD4PreOpenStory(page);
  await expect(page.getByTestId('market-status')).toContainText('진행 중인 영업');
  await expect(page.getByTestId('market-claim-3')).toBeDisabled();
  await expect(page.getByTestId('market-start-business')).toContainText('재개');
  await page.getByTestId('market-start-business').click();
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-grill-slot-count', '2');
  expect(await page.evaluate(() => window.__d1GameDebug.businessView().orders[0].orderId)).toBe(before.orders[0].orderId);
  expect(await page.evaluate(() => window.__d1GameDebug.businessView().clock.elapsedMs)).toBeGreaterThanOrEqual(before.clock.elapsedMs);
});

test('6칸 해금 후 여섯 꼬치를 실제 조립·배치·뒤집기·회수한다', async ({ page }) => {
  test.setTimeout(120000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await installD4Save(page, 90); await skipD4PreOpenStory(page);
  for (const slot of [3, 4, 5, 6]) {
    await page.getByTestId(`market-claim-${slot}`).click();
    await expect(page.getByTestId('market-stats')).toHaveText(`명성 90 · 설치된 그릴 ${slot}칸`);
  }
  await page.screenshot({ path: test.info().outputPath('market-six-installed.png') });
  await page.getByTestId('market-start-business').click();
  const D = name => page.evaluate(name => window.__d1GameDebug?.[name]?.(), name);
  await expect.poll(() => D('businessReady')).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-grill-slot-count', '6');
  async function nav(station) {
    await page.getByTestId(`quicknav-SCR-SVC-${station}`).click();
    await expect.poll(() => D('isTransitioning')).toBe(false);
  }
  async function object(key) {
    const p = await page.evaluate(key => window.__d1GameDebug.screenPosOf(key), key);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(330);
  }
  await nav('ASSEMBLY');
  for (let n = 0; n < 6; n++) {
    for (const key of ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken']) await object(key);
    await object('jigSkewer');
  }
  await nav('GRILL');
  for (let n = 0; n < 6; n++) {
    await page.locator('#grillWaitingNegimaSalt').click(); await page.waitForTimeout(350);
  }
  expect((await D('cookSlots')).map(s => s.status)).toEqual(Array(6).fill('front'));
  await page.locator('#guestJournalToggle').click();
  const rectangles = await page.locator('.grill-slot-status').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
  expect(rectangles).toHaveLength(6);
  const viewport = page.viewportSize();
  for (const r of rectangles) { expect(r.bottom).toBeLessThan(viewport.height); expect(r.right).toBeLessThan(viewport.width); }
  publicGrillLayout(6).slots.forEach((slot, i) => {
    const food = slot.approvedVisualRect;
    expect(Math.abs(rectangles[i].x + rectangles[i].width / 2 - (food.x + food.width / 2) * viewport.width)).toBeLessThan(1);
  });
  for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
    const a = rectangles[i], b = rectangles[j];
    expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
  }
  await page.keyboard.press('Escape');
  await page.screenshot({ path: test.info().outputPath('six-skewers-on-grill.png') });
  for (const side of ['front', 'back']) {
    for (let slot = 0; slot < 6; slot++) {
    await expect.poll(async () => (await D('cookSlots'))[slot][`${side}Doneness`], { timeout: 15000, intervals: [80] }).toBe('perfect');
    // 실제 키보드 1~6과 실제 음식 영역 hit target을 각각 검증한다.
    if (side === 'front') await page.keyboard.press(String(slot + 1));
    else await object(`pgSlot${slot}`);
    await page.waitForTimeout(250);
    if (side === 'back' && slot === 2) {
      // 왼쪽 3개가 사라진 뒤도 오른쪽 카드가 왼쪽 빈칸으로 당겨지지 않는다.
      const remaining = await D('grillStatusSnapshot');
      for (let i = 0; i < 6; i++) {
        expect(remaining[i].hidden).toBe(i < 3);
        if (i >= 3) expect(remaining[i].rect.x).toBeCloseTo(rectangles[i].x, 1);
      }
      await page.screenshot({ path: test.info().outputPath('right-three-skewers-stable-cards.png') });
    }
    }
    if (side === 'front') {
      const feedback = await page.locator('.grill-craft-feedback:not([hidden])').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
      for (let i = 1; i < feedback.length; i++) expect(feedback[i - 1].right).toBeLessThanOrEqual(feedback[i].left);
      await page.screenshot({ path: test.info().outputPath('six-skewers-after-flip.png') });
    }
  }
  expect((await D('cookSlots')).every(s => s.status === 'empty')).toBe(true);
  expect(await page.locator('.dock-card').count()).toBe(6);
  await page.reload();
  await expect.poll(() => D('businessReady')).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-grill-slot-count', '6');
  expect((await D('cookSlots')).every(s => s.status === 'empty')).toBe(true);
  expect(await page.locator('.dock-card').count()).toBe(6);
  expect(errors).toEqual([]);
});
