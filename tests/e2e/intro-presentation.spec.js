import { expect, test } from '@playwright/test';

const D = (page, key) => page.evaluate(key => window.__d1GameDebug?.[key]?.(), key);
const ready = page => expect(page.locator('body')).toHaveAttribute('data-entry-state', 'ready');
const primary = page => page.locator('#actions .primary');

async function begin(page) {
  await page.goto('/');
  await page.locator('#new-game-button').click();
  await ready(page);
}

async function market(page) {
  await begin(page);
  await page.getByRole('button', { name:'열쇠를 집는다' }).click();
  await page.getByRole('button', { name:'문을 연다' }).click();
  await page.getByRole('button', { name:'이 장면 건너뛰기' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-D1-PRE-001');
  await page.getByRole('button', { name:'이 장면 건너뛰기' }).click();
  await expect(page.getByTestId('market-start-business')).toBeVisible();
}

test('느린 다음 그림을 기다리는 동안 기존 장면·대사를 유지하고 준비 뒤 함께 표시한다', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/s0-decision-full-scene-r2-b1.png', async route => { await gate; await route.continue(); });
  try {
    await begin(page);
    await page.getByRole('button', { name:'열쇠를 집는다' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-state-id', 'S0-STATE-GATE');
    const oldText = await page.locator('#content-panel').innerText();
    await page.getByRole('button', { name:'문을 연다' }).click();
    await expect(page.locator('#scene-status')).toBeVisible();
    await expect(page.locator('#content-panel')).toHaveText(oldText);
    await expect(page.locator('#story-illustration')).toBeHidden();
    expect(await page.locator('#s0-exterior-background').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
    release();
    await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-S0-001');
    expect(await page.locator('#story-illustration').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('#scene-status')).toBeHidden();
  } finally { release(); }
});

test('이미지 실패는 이전 화면과 다시 시도를 남기며 동일 장면으로 복구한다', async ({ page }) => {
  let broken = true;
  await page.route('**/s0-decision-full-scene-r2-b1.png', route => broken ? route.abort() : route.continue());
  await begin(page);
  await page.getByRole('button', { name:'열쇠를 집는다' }).click();
  await page.getByRole('button', { name:'문을 연다' }).click();
  await expect(page.getByRole('button', { name:'장면 다시 불러오기' })).toBeVisible();
  await expect(page.locator('#s0-exterior-background')).toBeVisible();
  broken = false;
  await page.getByRole('button', { name:'장면 다시 불러오기' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-S0-001');
  await expect(page.locator('#story-illustration')).toBeVisible();
});

test('첫 장면 준비 실패도 검은 화면 대신 시작 화면 복귀를 제공한다', async ({ page }) => {
  await page.route('**/assets/manifest.json', route => route.abort());
  await page.goto('/s0-d3.html?new=1');
  await expect(page.locator('body')).toHaveAttribute('data-entry-state', 'error');
  await expect(page.locator('#entry-status')).toBeVisible();
  await expect(page.locator('#entry-status').getByRole('link', { name:'시작 화면으로' })).toBeVisible();
  await expect(primary(page)).toBeHidden();
});

test('키보드 대화 진행·메뉴 복귀·장면과 대사의 안전 영역을 유지한다', async ({ page }) => {
  await begin(page);
  await primary(page).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-state-id', 'S0-STATE-GATE');
  await expect(primary(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-S0-001');
  await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-S0-002');
  await page.getByRole('button', { name:'메뉴', exact:true }).click();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-dialogue-id', 'DLG-S0-002');
  if (await page.locator('#scenario-menu-dialog').isVisible()) await page.keyboard.press('Escape');
  const bounds = await page.evaluate(() => {
    const panel = document.querySelector('#content-panel').getBoundingClientRect();
    const actions = document.querySelector('#actions').getBoundingClientRect();
    const art = document.querySelector('#visual-placeholder').getBoundingClientRect();
    return { panelBottom:panel.bottom, actionsTop:actions.top, actionsBottom:actions.bottom, artHeight:art.height, height:innerHeight, overflow:document.documentElement.scrollWidth > innerWidth };
  });
  expect(bounds.panelBottom).toBeLessThanOrEqual(bounds.actionsTop);
  expect(bounds.actionsBottom).toBeLessThanOrEqual(bounds.height);
  expect(bounds.artHeight).toBeGreaterThanOrEqual(bounds.height * .9);
  expect(bounds.overflow).toBe(false);
});

test('영업 아트가 늦으면 첫 프레임 전까지 시계와 저장을 그대로 두고 준비 뒤 시작한다', async ({ page }) => {
  await market(page);
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/spr-assembly-tray-negima-r1-b1.png', async route => { await gate; await route.continue(); });
  try {
    await page.getByTestId('market-start-business').click();
    await expect.poll(async () => Boolean(await D(page, 'businessView'))).toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-entry-state', 'loading');
    await expect(page.getByTestId('scene-canvas')).toBeHidden();
    const before = await D(page, 'businessView');
    const saved = await page.evaluate(() => JSON.stringify(localStorage));
    await page.waitForTimeout(450);
    expect((await D(page, 'businessView')).clock.elapsedMs).toBe(before.clock.elapsedMs);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(saved);
    release(); await ready(page);
    await expect(page.getByTestId('scene-canvas')).toBeVisible();
    await expect.poll(() => D(page, 'texturesReady')).toBe(true);
    await expect.poll(async () => (await D(page, 'businessView')).clock.elapsedMs).toBeGreaterThan(before.clock.elapsedMs);
  } finally { release(); }
});

test('설정이 이야기·영업으로 이어지고 이미지 준비 후의 실제 조립 입력도 동작한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name:'설정', exact:true }).click();
  await page.getByLabel('움직임 줄이기').check(); await page.getByLabel('고대비 표시').check();
  await page.getByLabel('큰 입력 영역').check();
  await page.getByRole('button', { name:'설정 저장' }).click();
  await market(page);
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-high-contrast', 'true');
  await page.getByTestId('market-start-business').click(); await ready(page);
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-high-contrast', 'true');
  for (const id of ['recipe-book-toggle', 'business-phase']) {
    expect((await page.getByTestId(id).boundingBox()).height).toBeGreaterThanOrEqual(54);
  }
  await page.getByRole('button', { name:'조립', exact:true }).click();
  await expect.poll(() => D(page, 'activeScreen')).toBe('SCR-SVC-ASSEMBLY');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
  const point = await page.evaluate(() => window.__d1GameDebug.screenPosOf('binChicken'));
  await page.mouse.click(point.x, point.y);
  const progress = await page.evaluate(() => window.__d1GameDebug.cookAssemblyProgress());
  expect(progress).toMatchObject({ index:1 });
});

test('실제로 올린 꼬치를 불러올 때 로딩 시간만큼 더 익거나 기존 저장이 덮어써지지 않는다', async ({ page }) => {
  await market(page);
  await page.getByTestId('market-start-business').click(); await ready(page);
  await page.getByTestId('quicknav-SCR-SVC-ASSEMBLY').click();
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
  for (const key of ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken', 'jigSkewer']) {
    const point = await page.evaluate(key => window.__d1GameDebug.screenPosOf(key), key);
    await page.mouse.click(point.x, point.y); await page.waitForTimeout(330);
  }
  await page.getByTestId('quicknav-SCR-SVC-GRILL').click();
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
  await page.locator('#grillWaitingNegimaSalt').click();
  await page.getByTestId('business-phase').click();
  const original = await D(page, 'cookSlots');
  expect(original[0].status).toBe('front');
  const saved = await page.evaluate(() => JSON.stringify(localStorage));
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/spr-assembly-tray-negima-r1-b1.png', async route => { await gate; await route.continue(); });
  try {
    await page.reload();
    await expect.poll(async () => Boolean(await D(page, 'businessView'))).toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-entry-state', 'loading');
    const frozen = (await D(page, 'cookSlots'))[0].frontElapsedSec;
    await page.waitForTimeout(800);
    expect((await D(page, 'cookSlots'))[0].frontElapsedSec).toBe(frozen);
    expect(frozen).toBeCloseTo(original[0].frontElapsedSec, 2);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(saved);
    release(); await ready(page);
    await expect.poll(async () => (await D(page, 'cookSlots'))[0].frontElapsedSec).toBeGreaterThan(frozen);
  } finally { release(); }
});
