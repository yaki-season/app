import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, fn, ...args) => page.evaluate(
  ({ name, values }) => window.__d1GameDebug[name](...values),
  { name: fn, values: args },
);

function overlaps(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

async function bootAtGrill(page) {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'texturesReady')).toBe(true);
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'requestScreen', 'SCR-SVC-GRILL');
  await expect.poll(() => D(page, 'activeScreen')).toBe('SCR-SVC-GRILL');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
  // director 전환 완료 뒤 renderer camera tween도 같은 300ms를 소비한다.
  await page.waitForTimeout(350);
}

async function stageWaitingNegima(page, count = 2) {
  for (let index = 0; index < count; index += 1) {
    await D(page, 'cookFillAssembly');
  }
  await expect.poll(() => D(page, 'cookWaiting')).toBe(count);
}

async function projectedMeshRect(page, key) {
  return page.evaluate(async (objectKey) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const renderer = window.__d1GameDebug.renderer;
    const mesh = renderer.objectMesh[objectKey];
    const canvasRect = document.querySelector('[data-testid="scene-canvas"]').getBoundingClientRect();
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.attributes.position;
    const points = Array.from({ length: positions.count }, (_, index) => {
      const point = mesh.position.clone()
        .fromBufferAttribute(positions, index)
        .applyMatrix4(mesh.matrixWorld)
        .project(renderer.camera);
      return {
        x: canvasRect.left + (point.x * .5 + .5) * canvasRect.width,
        y: canvasRect.top + (-point.y * .5 + .5) * canvasRect.height,
      };
    });
    const left = Math.min(...points.map(({ x }) => x));
    const right = Math.max(...points.map(({ x }) => x));
    const top = Math.min(...points.map(({ y }) => y));
    const bottom = Math.max(...points.map(({ y }) => y));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }, key);
}

test('public D1 두 독립 칸과 semantic 네기마 제어가 승인 footprint·단일 입력 계약을 지킨다', async ({ page }) => {
  await bootAtGrill(page);
  await stageWaitingNegima(page);

  const viewport = page.viewportSize();
  const contract = await D(page, 'grillContract');
  expect(contract.initialPlacementSlots).toEqual([1, 2]);
  expect(contract.slots.map(({ key }) => key)).toEqual(['pgSlot0', 'pgSlot1']);
  for (let index = 0; index < 2; index += 1) {
    const actual = await projectedMeshRect(page, `pgSlot${index}`);
    const visualRect = contract.slots[index].approvedVisualRect;
    const expected = {
      x: visualRect.x * viewport.width,
      y: visualRect.y * viewport.height,
      width: visualRect.width * viewport.width,
      height: visualRect.height * viewport.height,
    };
    for (const field of ['x', 'y', 'width', 'height']) {
      expect(Math.abs(actual[field] - expected[field])).toBeLessThanOrEqual(.25);
    }
  }
  expect(await page.evaluate(() => Array.from({ length: 6 }, (_, index) => (
    window.__d1GameDebug.renderer.objectMesh[`grillSlot${index}`].visible
  )))).toEqual([false, false, false, false, false, false]);

  const button = page.getByTestId('grill-waiting-negima');
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(button).toContainText('네기마');
  await expect(button).toContainText('첫 빈 칸에 한 개 올리기');
  const buttonRect = await button.boundingBox();
  expect(buttonRect.width).toBeGreaterThanOrEqual(44);
  expect(buttonRect.height).toBeGreaterThanOrEqual(44);

  // 한 번의 실제 mouse activation 직후 같은 DOM intent가 중복되어도 200ms lock이 두 번째를 막는다.
  // 별도 Playwright 왕복으로 element.click()을 호출하면 머신 부하에 따라 200ms 밖으로 밀릴 수
  // 있으므로, 실제 click 이벤트와 같은 브라우저 task 안에서 중복 intent를 재현한다.
  await button.evaluate((element) => {
    element.addEventListener('click', () => element.click(), { once: true });
  });
  await page.mouse.click(buttonRect.x + buttonRect.width / 2, buttonRect.y + buttonRect.height / 2);
  await expect.poll(() => D(page, 'cookWaiting')).toBe(1);
  expect((await D(page, 'cookSlots')).slice(0, 2)).toEqual([
    expect.objectContaining({ index: 0, status: 'front', contactFace: 'front' }),
    expect.objectContaining({ index: 1, status: 'empty' }),
  ]);

  await page.waitForTimeout(220);
  await button.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => D(page, 'cookWaiting')).toBe(0);
  expect((await D(page, 'cookSlots')).slice(0, 2)).toEqual([
    expect.objectContaining({ index: 0, status: 'front', contactFace: 'front' }),
    expect.objectContaining({ index: 1, status: 'front', contactFace: 'front' }),
  ]);
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-label', /대기 중인 꼬치 없음/);
});

test('FHD/720에서 인게임 guide 없이 상단 HUD, 상태 카드, rack 제어, 하단 UI가 겹치지 않는다', async ({ page }) => {
  await bootAtGrill(page);
  await stageWaitingNegima(page);
  const button = page.getByTestId('grill-waiting-negima');
  await expect(page.getByTestId('d1-guide')).toBeHidden();

  const buttonRect = await button.boundingBox();
  const viewport = page.viewportSize();
  expect(buttonRect.x).toBeGreaterThanOrEqual(0);
  expect(buttonRect.y).toBeGreaterThanOrEqual(0);
  expect(buttonRect.x + buttonRect.width).toBeLessThanOrEqual(viewport.width);
  expect(buttonRect.y + buttonRect.height).toBeLessThanOrEqual(viewport.height);

  await button.click();
  await expect.poll(() => D(page, 'cookWaiting')).toBe(1);
  await expect.poll(async () => (
    (await D(page, 'grillStatusSnapshot')).filter(({ hidden }) => !hidden).length
  )).toBe(1);
  const firstActiveStatus = (await D(page, 'grillStatusSnapshot')).filter(({ hidden }) => !hidden);
  expect(firstActiveStatus).toHaveLength(1);
  expect(overlaps(firstActiveStatus[0].rect, await projectedMeshRect(page, 'pgSlot0'))).toBe(false);
  expect(overlaps(buttonRect, firstActiveStatus[0].rect)).toBe(false);
  expect(overlaps(buttonRect, await projectedMeshRect(page, 'pgSlot0'))).toBe(false);

  await page.waitForTimeout(220);
  await button.press('Enter');
  await expect.poll(() => D(page, 'cookWaiting')).toBe(0);
  await expect.poll(async () => (
    (await D(page, 'grillStatusSnapshot')).filter(({ hidden }) => !hidden).length
  )).toBe(2);
  const activeStatus = (await D(page, 'grillStatusSnapshot')).filter(({ hidden }) => !hidden);
  expect(activeStatus).toHaveLength(2);
  expect(overlaps(activeStatus[0].rect, activeStatus[1].rect)).toBe(false);
  for (const status of activeStatus) {
    for (const key of ['pgSlot0', 'pgSlot1']) {
      expect(overlaps(status.rect, await projectedMeshRect(page, key))).toBe(false);
      expect(overlaps(buttonRect, await projectedMeshRect(page, key))).toBe(false);
    }
  }

  await D(page, 'dockAdd', { menu: '네기마', label: 'Perfect', good: true });
  const dockRect = await page.getByTestId('dock-shelf').boundingBox();
  expect(overlaps(buttonRect, dockRect)).toBe(false);
  for (const status of activeStatus) expect(overlaps(status.rect, dockRect)).toBe(false);
});
