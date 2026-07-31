import { test, expect } from '@playwright/test';

const RELEASE_URL = '/content/releases/d1-business-day-definition.v1.json';
const D = (page, name) => page.evaluate((debugName) => window.__d1GameDebug[debugName](), name);

async function staticRelease(page) {
  const response = await page.request.get(RELEASE_URL);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type'] ?? '').toContain('application/json');
  return response.json();
}

async function expectExplicitStartFailure(page, expectedCode) {
  await page.goto('/src/d1-game.html?reset=1');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  expect(await D(page, 'businessSession')).toMatchObject({
    ok: false,
    error: { code: expectedCode, recoverable: false },
  });
  expect(await D(page, 'businessView')).toBeNull();
  expect(await D(page, 'campaignState')).toBeNull();
  expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual([]);
}

test('정적 release artifact만으로 D1 전체 영업이 route 주입 없이 부팅한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  // 성공 경로는 route/page fixture 응답을 전혀 주입하지 않는다.
  const release = await staticRelease(page);
  expect(release).toMatchObject({
    id: 'd1-release-definition',
    schemaVersion: 1,
    source: { dayId: 'd1' },
    sessionTargetMs: 420000,
    totals: { customers: 4, orders: 4, items: 8 },
    economy: { menuPrices: { beer: 6, negima: 3 } },
    timingMs: { cleanup: 3000 },
  });
  expect(release.seatIds).toHaveLength(6);
  expect(release.waves.map(({ atMs }) => atMs)).toEqual([0, 100000, 220000]);
  expect(release.waves.flatMap((wave) => wave.customers).map(({ id }) => id)).toEqual([
    'REGULAR_TSUKIOKA', 'D1-OFFICE-A', 'D1-OFFICE-B', 'D1-SOLO-A',
  ]);

  await page.goto('/src/d1-game.html?reset=1');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  expect(await D(page, 'businessSession')).toMatchObject({ ok: true });
  const view = await D(page, 'businessView');
  expect(view.seats).toHaveLength(6);
  expect(view.orders).toHaveLength(1);
  expect(view.orders[0].orderId).toBe('D1-ORDER-001');

  await page.evaluate(() => window.__d1GameDebug.businessAdvance(6000));
  await expect.poll(async () => (await D(page, 'businessView')).seats.some(
    (seat) => seat.customerId === 'REGULAR_TSUKIOKA',
  )).toBe(true);
  expect(errors).toEqual([]);
});

test('정적 release가 404이면 fixture·기본값 fallback 없이 D1 시작 실패 상태를 유지한다', async ({ page }) => {
  await page.route(RELEASE_URL, (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'not found' }),
  }));
  await expectExplicitStartFailure(page, 'D1_DEFINITION_LOAD_FAILED');
});

test('지원하지 않는 release schemaVersion이면 fixture·기본값 fallback 없이 D1 시작 실패 상태를 유지한다', async ({ page }) => {
  const invalidRelease = await staticRelease(page);
  invalidRelease.schemaVersion = 2;
  await page.route(RELEASE_URL, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(invalidRelease),
  }));
  await expectExplicitStartFailure(page, 'D1_DEFINITION_VERSION_UNSUPPORTED');
});
