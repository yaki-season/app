// D1 전체 영업 화면의 첫 주문·고정 6칸 조리 회귀. 전체 4주문 종단은
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

test('츠키오카 접수→고정 6칸 첫 3개 동시 시작→부분·최종 제공', async ({ page }) => {
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

  // 조립: 첫 주문 네기마 3개를 실제 화면 클릭으로 준비한다.
  await goScreen(page, 'SCR-SVC-ASSEMBLY');
  for (let batch = 0; batch < 3; batch += 1) {
    for (const [step, k] of ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken'].entries()) {
      await clickObj(page, k);
      if (step < 4) {
        await expect.poll(async () => {
          const index = await D(page, 'cookAssemblyIndex');
          if (index !== step + 1) await clickObj(page, k);
          return D(page, 'cookAssemblyIndex');
        }).toBe(step + 1);
      } else {
        await expect.poll(async () => {
          const waiting = await D(page, 'cookWaiting');
          if (waiting !== batch + 1) await clickObj(page, k);
          return D(page, 'cookWaiting');
        }).toBe(batch + 1);
      }
      await page.waitForTimeout(300);
    }
  }
  await expect.poll(() => D(page, 'cookWaiting')).toBe(3);

  // 첫 2개는 접촉하지 않아 시간이 0이고, 세 번째 배치 순간 같은 now로 셋이 시작한다.
  await goScreen(page, 'SCR-SVC-GRILL');
  await clickObj(page, 'grillWaitTray');
  await page.waitForTimeout(300);
  await clickObj(page, 'grillWaitTray');
  expect((await D(page, 'cookSlots')).slice(0, 2)).toEqual([
    expect.objectContaining({ status: 'staged', contactFace: null, frontElapsedSec: 0, backElapsedSec: 0 }),
    expect.objectContaining({ status: 'staged', contactFace: null, frontElapsedSec: 0, backElapsedSec: 0 }),
  ]);
  await page.waitForTimeout(300);
  await clickObj(page, 'grillWaitTray');
  const started = (await D(page, 'cookSlots')).slice(0, 3);
  expect(started.every((slot) => slot.status === 'front' && slot.contactFace === 'front')).toBe(true);
  expect(new Set(started.map((slot) => slot.frontElapsedSec)).size).toBe(1);

  // 여섯 slot rect/hit target과 finished tray 계약은 FHD/720 두 Playwright project에서 같다.
  const contract = await D(page, 'grillContract');
  expect(contract.slots).toHaveLength(6);
  const viewport = page.viewportSize();
  for (const slot of contract.slots) {
    expect(slot.hitRect.width * viewport.width).toBeGreaterThanOrEqual(44);
    expect(slot.hitRect.height * viewport.height).toBeGreaterThanOrEqual(44);
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

  // 세 꼬치를 같은 타이밍으로 앞·뒤 굽고 모두 회수한다.
  await D(page, 'cookElapse', 8);
  const frontQuaternion = await page.evaluate(() => (
    window.__d1GameDebug.renderer.objectMesh.grillSlot0.quaternion.toArray()
  ));
  for (let index = 0; index < 3; index += 1) await clickObj(page, `grillSlot${index}`);
  await expect(page.locator('#hint')).toContainText('꼬치를 뒤집는 중');
  await expect.poll(() => D(page, 'cookSlots').then((s) => s.slice(0, 3).every((slot) => slot.status === 'back'))).toBe(true);
  const backQuaternion = await page.evaluate(() => (
    window.__d1GameDebug.renderer.objectMesh.grillSlot0.quaternion.toArray()
  ));
  const quaternionDot = Math.abs(frontQuaternion.reduce(
    (sum, component, index) => sum + component * backQuaternion[index],
    0,
  ));
  expect(quaternionDot).toBeLessThan(0.05);
  await D(page, 'cookElapse', 8);
  for (let index = 0; index < 3; index += 1) await clickObj(page, `grillSlot${index}`);
  await expect.poll(() => D(page, 'dockItems').then((d) => d.filter((x) => x.menu === '네기마').length)).toBe(3);
  await clickObj(page, 'grillFinishedTray');
  await expect(page.locator('#hint')).toContainText('완료 트레이');

  // 생맥주는 결정론적으로 선반에 적재한다.
  await D(page, 'dockAdd', { menu: '생맥주', label: 'Perfect', good: true });

  // 서빙: 손님 화면에서 생맥주부터 (선반에서 골라 손님 클릭)
  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  const beer = (await D(page, 'dockItems')).find((x) => x.menu === '생맥주');
  await D(page, 'dockSelect', beer.id);
  await clickObj(page, `seatServe:${tsukiokaSeat}`);
  await expect.poll(() => D(page, 'order').then((o) => o['생맥주'].done)).toBe(1);
  await expect.poll(() => D(page, 'customerArt')).toContain('partial-beer');

  // 네기마 3개 서빙
  for (let i = 0; i < 3; i += 1) {
    const ng = (await D(page, 'dockItems')).find((x) => x.menu === '네기마');
    await D(page, 'dockSelect', ng.id);
    await page.waitForTimeout(300);
    await clickObj(page, `seatServe:${tsukiokaSeat}`);
  }
  await expect.poll(() => D(page, 'order').then((o) => o['네기마'].done)).toBe(3);

  // 첫 주문은 완료됐지만 전체 D1은 계속된다.
  await expect.poll(() => D(page, 'businessView').then((view) => (
    view.orders.find((order) => order.orderId === 'D1-ORDER-001').status
  ))).toBe('completed');
  await expect(page.getByTestId('result-overlay')).toBeHidden();
  expect(errs).toEqual([]);
});
