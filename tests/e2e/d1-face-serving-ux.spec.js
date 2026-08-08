import { test, expect } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, fn, ...args) => page.evaluate(
  ({ name, values }) => window.__d1GameDebug[name](...values),
  { name: fn, values: args },
);

async function boot(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  return errors;
}

async function goScreen(page, screenId) {
  await D(page, 'requestScreen', screenId);
  await expect.poll(() => D(page, 'activeScreen')).toBe(screenId);
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
}

async function prepareInitialBatch(page) {
  for (let index = 0; index < 2; index += 1) {
    await D(page, 'cookFillAssembly');
  }
  for (let index = 0; index < 2; index += 1) {
    await D(page, 'cookPlace');
  }
}

function intersectionArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

test('prepared dock stays hidden at work stations and appears only at customers', async ({ page }) => {
  const errors = await boot(page);
  const itemId = await D(page, 'dockAdd', {
    menu: '생맥주',
    label: 'Perfect',
    good: true,
  });
  const dock = page.getByTestId('dock-shelf');

  for (const screenId of ['SCR-SVC-ASSEMBLY', 'SCR-SVC-GRILL', 'SCR-SVC-DRINK']) {
    await goScreen(page, screenId);
    await expect(dock).toBeHidden();
    await expect(dock).toHaveAttribute('aria-hidden', 'true');
  }

  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  await expect(dock).toBeVisible();
  await expect(dock).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByTestId(`dock-item-${itemId}`)).toBeVisible();

  await goScreen(page, 'SCR-SVC-ASSEMBLY');
  await expect(dock).toBeHidden();
  expect(await D(page, 'dockItems')).toEqual([
    expect.objectContaining({ id: itemId, menu: '생맥주', label: 'Perfect' }),
  ]);
  expect(errors).toEqual([]);
});

test('그릴 시작 2칸은 접촉면·양면 누적·현재 행동을 FHD/720 compact DOM으로 겹침 없이 표시한다', async ({
  page,
}) => {
  const errors = await boot(page);
  await goScreen(page, 'SCR-SVC-GRILL');
  await prepareInitialBatch(page);

  await expect(page.getByTestId('grill-status-layer')).toBeVisible();
  await expect(page.locator('.grill-slot-status:not([hidden])')).toHaveCount(2);
  await expect(page.locator('.grill-face-icon.front')).toHaveCount(2);
  await expect(page.getByText(/더 굽고.*뒤집/)).toHaveCount(0);

  const snapshot = await D(page, 'grillStatusSnapshot');
  const visible = snapshot.filter((slot) => !slot.hidden);
  expect(visible).toHaveLength(2);
  for (const slot of visible) {
    expect(slot.contactFace).toBe('front');
    expect(slot.text).toContain('현재 접촉면 · 앞면');
    expect(slot.text).toContain('앞면');
    expect(slot.text).toContain('뒷면');
    expect(slot.text).toContain('현재 행동 · 뒤집기');
    expect(slot.ariaLabel).toContain('앞면');
    expect(slot.ariaLabel).toContain('뒷면');
  }
  for (let left = 0; left < visible.length; left += 1) {
    for (let right = left + 1; right < visible.length; right += 1) {
      expect(intersectionArea(visible[left].rect, visible[right].rect)).toBe(0);
    }
  }
  const viewport = page.viewportSize();
  const trayReservedLeft = viewport.width * (1502 / 1920);
  expect(Math.max(...visible.map((slot) => slot.rect.x + slot.rect.width)))
    .toBeLessThanOrEqual(trayReservedLeft);
  expect(errors).toEqual([]);
});

test('조기 뒤집기 누적을 보존하고 0.3초 공중 회전에는 양면 정지를 텍스트로 알린다', async ({
  page,
}) => {
  const errors = await boot(page);
  await goScreen(page, 'SCR-SVC-GRILL');
  await prepareInitialBatch(page);
  await D(page, 'cookElapse', 3);
  const before = (await D(page, 'cookSlots'))[0];

  await D(page, 'cookClickSlot', 0);
  await expect.poll(() => D(page, 'grillStatusSnapshot').then(
    (slots) => slots[0].flipping,
  )).toBe('true');
  const airborneStart = (await D(page, 'grillStatusSnapshot'))[0];
  expect(airborneStart.nextAction).toBe('wait');
  expect(airborneStart.text).toContain('공중 회전');
  expect(airborneStart.text).toContain('양면 정지');
  expect(airborneStart.text).toContain('회전/입력 잠금 대기');
  await page.waitForTimeout(100);
  const airborneLater = (await D(page, 'cookSlots'))[0];
  expect(airborneLater.frontElapsedSec).toBeCloseTo(before.frontElapsedSec, 1);
  expect(airborneLater.backElapsedSec).toBeCloseTo(before.backElapsedSec, 1);

  await expect.poll(() => D(page, 'grillStatusSnapshot').then(
    (slots) => slots[0].contactFace,
  )).toBe('back');
  const after = (await D(page, 'grillStatusSnapshot'))[0];
  expect(after.nextAction).toBe('flip');
  expect(after.text).toMatch(/앞면 \d+\.\d초 보존 · 뒷면 조리 중/);
  expect(after.text).toContain('현재 행동 · 뒤집기');

  await D(page, 'cookElapse', 8);
  await D(page, 'cookClickSlot', 0);
  await expect.poll(() => D(page, 'grillStatusSnapshot').then(
    (slots) => slots[0].contactFace,
  )).toBe('front');
  await D(page, 'cookElapse', 5);
  await expect.poll(() => D(page, 'grillStatusSnapshot').then(
    (slots) => slots[0].nextAction,
  )).toBe('retrieve');
  const ready = (await D(page, 'grillStatusSnapshot'))[0];
  expect(ready.text).toContain('현재 행동 · 회수');
  expect(errors).toEqual([]);
});

test('키보드로 공용 완성품을 선택하고 일치하는 여러 손님 중 원하는 손님에게 제공한다', async ({
  page,
}) => {
  const errors = await boot(page);
  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  await D(page, 'businessAdvance', 6_000);

  const tsukioka = (await D(page, 'businessView')).seats.find(
    (seat) => seat.customerId === 'REGULAR_TSUKIOKA',
  );
  const tsukiokaTarget = page.getByTestId(`serve-target-${tsukioka.seatId}`);
  await tsukiokaTarget.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => D(page, 'businessView').then(
    (view) => view.seats.find((seat) => seat.seatId === tsukioka.seatId).canServe,
  )).toBe(true);

  const firstNegima = await D(page, 'dockAdd', {
    menu: '네기마',
    label: 'Perfect',
    good: true,
  });
  const firstCard = page.getByTestId(`dock-item-${firstNegima}`);
  await firstCard.focus();
  await page.keyboard.press('Enter');
  await expect(firstCard).toHaveAttribute('aria-pressed', 'true');
  await expect(tsukiokaTarget).toHaveAttribute('data-eligible', 'true');
  await tsukiokaTarget.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('serve-quantity')).toBeVisible();
  await expect(page.getByTestId('serve-one')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => D(page, 'businessView').then(
    (view) => view.orders.find((order) => order.orderId === 'D1-ORDER-001')
      .lines.find((line) => line.menuId === 'negima').served,
  )).toBe(1);
  expect((await D(page, 'businessView')).orders.find(
    (order) => order.orderId === 'D1-ORDER-001',
  ).lines.find((line) => line.menuId === 'beer').served).toBe(0);
  await expect.poll(() => D(page, 'dockItems').then(
    (items) => items.some((item) => item.id === firstNegima),
  )).toBe(false);

  for (const [menuId, index] of [['beer', 1], ['negima', 2]]) {
    expect(await D(page, 'businessDispatch', {
      type: 'serve-item',
      intentId: `task010:complete-tsukioka:${menuId}:${index}`,
      customerId: 'REGULAR_TSUKIOKA',
      menuId,
      quality: 'Perfect',
    })).toMatchObject({ ok: true, applied: true });
  }
  await D(page, 'businessAdvance', 16_000);
  expect(await D(page, 'businessDispatch', {
    type: 'begin-cleanup',
    intentId: 'task010:cleanup-tsukioka',
    seatId: tsukioka.seatId,
  })).toMatchObject({ ok: true, applied: true });
  await D(page, 'businessAdvance', 3_000);

  await D(page, 'businessAdvanceTo', 100_000);
  await D(page, 'businessAdvance', 6_000);
  const officeSeats = (await D(page, 'businessView')).seats
    .filter((seat) => seat.customerId?.startsWith('D1-OFFICE'));
  expect(officeSeats).toHaveLength(2);
  for (const seat of officeSeats) {
    const target = page.getByTestId(`serve-target-${seat.seatId}`);
    await target.focus();
    await page.keyboard.press('Enter');
  }
  await expect.poll(() => D(page, 'businessView').then(
    (view) => view.seats.filter((seat) => seat.customerId?.startsWith('D1-OFFICE'))
      .every((seat) => seat.canServe),
  )).toBe(true);

  const sharedNegima = await D(page, 'dockAdd', {
    menu: '네기마',
    label: 'Perfect',
    good: true,
  });
  const sharedCard = page.getByTestId(`dock-item-${sharedNegima}`);
  await sharedCard.focus();
  await page.keyboard.press('Enter');
  const targetSnapshot = await D(page, 'serveTargetSnapshot');
  expect(targetSnapshot.filter((seat) => seat.eligible === 'true')).toHaveLength(2);

  const chosen = officeSeats[1];
  const other = officeSeats[0];
  const chosenTarget = page.getByTestId(`serve-target-${chosen.seatId}`);
  await chosenTarget.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('serve-quantity')).toBeVisible();
  await expect(page.getByTestId('serve-one')).toBeFocused();
  await page.keyboard.press('Enter');
  const view = await D(page, 'businessView');
  expect(view.orders.find((order) => order.customerId === chosen.customerId).lines
    .find((line) => line.menuId === 'negima').served).toBe(1);
  expect(view.orders.find((order) => order.customerId === other.customerId).lines
    .find((line) => line.menuId === 'negima').served).toBe(0);
  expect(errors).toEqual([]);
});
