// D1 전체 영업 화면의 첫 주문·시작 2칸 조리·순차 가이드 회귀. 전체 4주문 종단은
// d1-business-day.spec.js가 별도로 검증한다.
import { test, expect } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, fn, ...a) => page.evaluate(({ f, args }) => window.__d1GameDebug[f](...args), { f: fn, args: a });
const active = (page) => D(page, 'activeScreen');

async function boot(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => D(page, 'texturesReady')).toBe(true);
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  return errs;
}
async function goScreen(page, id) {
  await D(page, 'requestScreen', id);
  await expect.poll(() => active(page)).toBe(id);
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
}
async function clickObj(page, key) {
  const pos = await D(page, 'screenPosOf', key);
  if (!pos) throw new Error(`보이지 않는 대상: ${key}`);
  await page.mouse.click(pos.x, pos.y);
}
async function clickCustomerActor(page, seatId) {
  const pos = await page.evaluate((id) => {
    const mesh = window.__d1GameDebug.renderer.seatActorMesh[id];
    const point = mesh.position.clone().project(window.__d1GameDebug.renderer.camera);
    const rect = document.querySelector('[data-testid="scene-canvas"]').getBoundingClientRect();
    return {
      x: rect.left + (point.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-point.y * 0.5 + 0.5) * rect.height,
    };
  }, seatId);
  await page.mouse.click(pos.x, pos.y);
}

test('6석 프로덕션 renderer와 승인 손님 배경이 조리 스테이션과 공존한다', async ({ page }) => {
  await boot(page);
  expect(await D(page, 'texturesReady')).toBe(true);
  expect(await page.evaluate(() => window.__d1GameDebug.renderer.textureErrors())).toBe(0);
  expect((await D(page, 'businessView')).seats).toHaveLength(6);
});

test('스테이션을 좌·우/퀵/키보드로 전환한다', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('svc-station')).toHaveText('손님');
  await page.getByTestId('quicknav-SCR-SVC-GRILL').click();
  await expect.poll(() => active(page)).toBe('SCR-SVC-GRILL');
  await expect(page.getByTestId('svc-station')).toHaveText('그릴');
  await page.getByTestId('nav-left').click();
  await expect.poll(() => active(page)).toBe('SCR-SVC-ASSEMBLY');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => active(page)).toBe('SCR-SVC-GRILL');
});

test('츠키오카 접수→시작 2칸 첫 2개 동시 시작→가이드 제공', async ({ page }) => {
  const errs = await boot(page);

  // 4~6초 주문 고민 뒤 츠키오카 좌석 hit target으로 접수한다.
  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  await D(page, 'businessAdvance', 6000);
  const tsukiokaSeat = (await D(page, 'businessView')).seats
    .find((seat) => seat.customerId === 'REGULAR_TSUKIOKA').seatId;
  const customerHit = await page.evaluate((seatId) => {
    const renderer = window.__d1GameDebug.renderer;
    const actor = renderer.seatActorMesh[seatId];
    const target = renderer.objectMesh[`seatServe:${seatId}`];
    return {
      actor: actor.position.clone().project(renderer.camera).toArray(),
      target: target.position.clone().project(renderer.camera).toArray(),
      opacity: target.material.opacity,
      colorWrite: target.material.colorWrite,
    };
  }, tsukiokaSeat);
  expect(Math.abs(customerHit.actor[0] - customerHit.target[0])).toBeLessThan(0.01);
  expect(Math.abs(customerHit.actor[1] - customerHit.target[1])).toBeLessThan(0.11);
  expect(customerHit).toMatchObject({ opacity: 0, colorWrite: false });
  await clickCustomerActor(page, tsukiokaSeat);
  await expect.poll(() => D(page, 'custPhase')).toBe('ordered');

  // 조립: 첫 주문 네기마 2개를 실제 화면 클릭으로 조립하고, 완성 꼬치를 명시적으로 옮긴다.
  await goScreen(page, 'SCR-SVC-ASSEMBLY');
  for (let batch = 0; batch < 2; batch += 1) {
    for (const [step, k] of ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken'].entries()) {
      await clickObj(page, k);
      await expect.poll(async () => {
        const index = await D(page, 'cookAssemblyIndex');
        if (index !== step + 1) await clickObj(page, k);
        return D(page, 'cookAssemblyIndex');
      }).toBe(step + 1);
      await page.waitForTimeout(350);
    }
    expect(await D(page, 'cookWaiting')).toBe(batch);
    await clickObj(page, 'jigSkewer');
    await expect.poll(() => D(page, 'cookWaiting')).toBe(batch + 1);
    await page.waitForTimeout(300);
  }
  await expect.poll(() => D(page, 'cookWaiting')).toBe(2);

  // 첫 꼬치는 접촉하지 않아 시간이 0이고, 두 번째 배치 순간 같은 now로 둘이 시작한다.
  await goScreen(page, 'SCR-SVC-GRILL');
  await clickObj(page, 'grillWaitTray');
  await expect.poll(async () => {
    const slots = await D(page, 'cookSlots');
    if (slots[0].status !== 'staged') await clickObj(page, 'grillWaitTray');
    return D(page, 'cookSlots').then((current) => current[0].status);
  }).toBe('staged');
  expect((await D(page, 'cookSlots')).slice(0, 2)).toEqual([
    expect.objectContaining({ status: 'staged', contactFace: null, frontElapsedSec: 0, backElapsedSec: 0 }),
    expect.objectContaining({ status: 'empty', contactFace: null, frontElapsedSec: 0, backElapsedSec: 0 }),
  ]);
  await page.waitForTimeout(350);
  await clickObj(page, 'grillWaitTray');
  await expect.poll(async () => {
    const slots = await D(page, 'cookSlots');
    if (!slots.every((slot) => slot.status === 'front')) await clickObj(page, 'grillWaitTray');
    return D(page, 'cookSlots').then((current) => current.every((slot) => slot.status === 'front'));
  }).toBe(true);
  const started = (await D(page, 'cookSlots')).slice(0, 2);
  expect(started.every((slot) => slot.status === 'front' && slot.contactFace === 'front')).toBe(true);
  expect(new Set(started.map((slot) => slot.frontElapsedSec)).size).toBe(1);

  // 시작 두 slot rect/hit target과 finished tray 계약은 FHD/720 두 Playwright project에서 같다.
  const contract = await D(page, 'grillContract');
  expect(contract.slots).toHaveLength(2);
  const viewport = page.viewportSize();
  for (const slot of contract.slots) {
    const hitRect = slot.hitRect ?? slot.rect;
    expect(hitRect.width * viewport.width).toBeGreaterThanOrEqual(44);
    expect(hitRect.height * viewport.height).toBeGreaterThanOrEqual(44);
  }
  expect(contract.finishedTray).toMatchObject({
    componentId: 'grill.finished',
    stableAssetId: 'ST-GRILL-FINISHED-TRAY',
    sourceRevision: 6,
    approvedAssetSha256: '51abf390cbf31d40b50a7d99f08a5d37a2da70df6cf94d405788538bad7d9184',
    runtimeRegistrationAllowed: false,
    sourceMasterId: 'CM-GRILL-STATION-QUEUED-SELECTION',
    sourceMasterRevision: 3,
  });
  const toPixels = (rect) => ({
    x: rect.x * viewport.width,
    y: rect.y * viewport.height,
    width: rect.width * viewport.width,
    height: rect.height * viewport.height,
  });
  const trayVisual = toPixels(contract.finishedTray.visualRect);
  const scale = viewport.width / 1920;
  expect(trayVisual.x).toBeCloseTo(1534 * scale, 6);
  expect(trayVisual.y).toBeCloseTo(123 * scale, 6);
  expect(trayVisual.width).toBeCloseTo(266 * scale, 6);
  expect(trayVisual.height).toBeCloseTo(354 * scale, 6);
  expect(contract.finishedTray.hitRect).toEqual(contract.finishedTray.visualRect);
  expect(contract.finishedTray.anchor.x * viewport.width).toBeCloseTo(1643 * scale, 6);
  expect(contract.finishedTray.anchor.y * viewport.height).toBeCloseTo(301 * scale, 6);
  const trayMeshes = await page.evaluate(() => ({
    visualUuid: window.__d1GameDebug.renderer.objectMesh.grillFinishedTray.uuid,
    hitUuid: window.__d1GameDebug.renderer.interactionMesh.grillFinishedTray.uuid,
  }));
  expect(trayMeshes).toEqual(expect.objectContaining({
    visualUuid: expect.any(String),
    hitUuid: expect.any(String),
  }));
  expect(trayMeshes.hitUuid).not.toBe(trayMeshes.visualUuid);

  // 두 꼬치를 같은 타이밍으로 앞·뒤 굽고 준비 시각 우선으로 모두 회수한다.
  await D(page, 'cookElapse', 8);
  const frontQuaternion = await page.evaluate(() => (
    window.__d1GameDebug.renderer.objectMesh.pgSlot0.quaternion.toArray()
  ));
  for (let index = 0; index < 2; index += 1) await clickObj(page, `pgSlot${index}`);
  await expect(page.locator('#hint')).toContainText('꼬치를 뒤집는 중');
  await expect.poll(() => D(page, 'cookSlots').then((s) => s.every((slot) => slot.status === 'back'))).toBe(true);
  const backQuaternion = await page.evaluate(() => (
    window.__d1GameDebug.renderer.objectMesh.pgSlot0.quaternion.toArray()
  ));
  const quaternionDot = Math.abs(frontQuaternion.reduce(
    (sum, component, index) => sum + component * backQuaternion[index],
    0,
  ));
  expect(quaternionDot).toBeLessThan(0.05);
  await D(page, 'cookElapse', 8);
  for (let index = 0; index < 2; index += 1) await clickObj(page, `pgSlot${index}`);
  await expect.poll(() => D(page, 'dockItems').then((d) => d.filter((x) => x.menu === '네기마').length)).toBe(2);
  await clickObj(page, 'grillFinishedTray');
  await expect(page.locator('#hint')).toContainText('완료 트레이');

  // 생맥주는 실제 잔 놓기와 결정론적 따르기 훅을 거쳐 선반에 적재한다.
  await goScreen(page, 'SCR-SVC-DRINK');
  await clickObj(page, 'glassRack');
  await D(page, 'pourExact', 3, 1);
  await D(page, 'drinkFinish');
  await expect.poll(() => D(page, 'dockItems').then((d) => d.filter((x) => x.menu === '생맥주').length)).toBe(1);

  // 서빙: 먼저 준비된 네기마부터 실제 카드→손님→수량 버튼을 따라 제공한다.
  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  for (let i = 0; i < 2; i += 1) {
    const negimaCard = page.locator('.dock-card').filter({ hasText: '네기마' }).first();
    await expect(negimaCard).toHaveAttribute('data-guide-target', 'true');
    await negimaCard.click();
    const serveTarget = page.getByTestId(`serve-target-${tsukiokaSeat}`);
    await expect(serveTarget).toHaveAttribute('data-guide-target', 'true');
    await serveTarget.click();
    await expect(page.getByTestId('serve-one')).toHaveAttribute('data-guide-target', 'true');
    await page.getByTestId('serve-one').click();
  }
  await expect.poll(() => D(page, 'order').then((o) => o['네기마'].done)).toBe(2);

  // 일반 영업과 같은 자유 제공을 유지하므로 남은 생맥주도 같은 실제 조작으로 제공한다.
  const beerCard = page.locator('.dock-card').filter({ hasText: '생맥주' }).first();
  await beerCard.click();
  await page.getByTestId(`serve-target-${tsukiokaSeat}`).click();
  await page.getByTestId('serve-one').click();
  await expect.poll(() => D(page, 'order').then((o) => o['생맥주'].done)).toBe(1);

  // 첫 주문은 완료됐지만 전체 D1은 계속된다.
  await expect.poll(() => D(page, 'businessView').then((view) => (
    view.orders.find((order) => order.orderId === 'D1-ORDER-001').status
  ))).toBe('completed');
  await expect(page.getByTestId('result-overlay')).toBeHidden();
  expect(errs).toEqual([]);
});
