// D1 첫 주문 2.5D 진입점 종단 검증. 평면 DOM img(d1.html) 대신 Three.js 깊이 레이어로 승인 아트를
// 합성하고, 세션 흐름에 따라 손님 텍스처가 교체되는지 확인한다. 세션·컨트롤 로직은 d1/view.js 공유.
import { test, expect } from '@playwright/test';

async function click(page, testId) { await page.getByTestId(testId).click(); }

test('D1 2.5D: 배경·손님·카운터 레이어를 합성하고 손님 텍스처가 흐름에 따라 바뀐다', async ({ page }) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/src/d1-scene.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();

  // 네 깊이 레이어(배경·6석·손님·카운터)가 승인 URL로 구성된다.
  const layers = await page.evaluate(() => window.__d1SceneDebug.layers());
  expect(layers.map((l) => l.name)).toEqual(['background', 'seating', 'customer', 'table']);
  expect(layers[0].url).toBe('/public/assets/core/customer/background-complete-r4-b1.png');
  expect(layers[1].url).toBe('/public/assets/core/customer/bg-seating-6-r2-b1.png');
  expect(layers[3].url).toBe('/public/assets/core/customer/service-counter-u-r4-b1.png');
  // 깊이가 서로 달라 시차(2.5D)가 생긴다.
  expect(layers[0].z).toBeLessThan(layers[1].z);
  expect(layers[1].z).toBeLessThan(layers[2].z);
  expect(layers[2].z).toBeLessThan(layers[3].z);

  // 대기 상태 손님 텍스처
  expect(await page.evaluate(() => window.__d1SceneDebug.customerTextureUrl()))
    .toBe('/public/assets/core/customer/d1-tsukioka-waiting-r3-b1.png');

  await page.getByRole('button', { name: '손님 입장 완료' }).click();
  await page.getByRole('button', { name: 'D1 주문 접수' }).click();
  await expect(page.getByTestId('d1-scene-status')).toHaveAttribute(
    'data-manifest-id',
    'BG-WORKSPACE-DRINK',
  );
  await expect(page.getByTestId('d1-scene-status')).toHaveAttribute(
    'data-missing-asset-ids',
    /MDL-BEER-LEVER/,
  );
  await expect(page.getByTestId('d1-scene-status')).not.toHaveAttribute(
    'data-missing-asset-ids',
    /BG-WORKSPACE-DRINK/,
  );
  expect(await page.evaluate(() => window.__d1SceneDebug.backgroundTextureUrl()))
    .toBe('/public/assets/core/drink/bg-workspace-drink-r2-b1.png');
  await expect(page.getByTestId('order-draft-beer')).toContainText('x1/1');
  await expect(page.getByTestId('order-negima').locator('img')).toHaveAttribute('src', '/public/assets/core/ui/order-icon-negima-r1-b1.png');

  // 생맥주 부분 제공 → 손님이 맥주를 든 부분 제공 텍스처로 교체
  await page.getByRole('button', { name: '레버 아래: 맥주 3초' }).click();
  await page.getByRole('button', { name: '레버 위: 거품 1초' }).click();
  await page.getByRole('button', { name: '완성 잔을 준비 목록으로' }).click();
  await click(page, 'prepared-draft-beer');
  await page.getByRole('button', { name: '다 주기' }).click();
  await expect(page.getByTestId('customer-state')).toContainText('생맥주를 받았습니다');
  expect(await page.evaluate(() => window.__d1SceneDebug.customerTextureUrl()))
    .toBe('/public/assets/core/customer/d1-tsukioka-partial-beer-waiting-r2-b1.png');
  expect(await page.evaluate(() => window.__d1SceneDebug.backgroundTextureUrl()))
    .toBe('/public/assets/core/customer/background-complete-r4-b1.png');

  // 조립 → 2칸 그릴 → 네기마 제공 → 반응
  await page.getByRole('button', { name: '네기마 조립 시작' }).click();
  for (let i = 0; i < 2; i += 1) {
    for (const ingredient of ['닭', '파', '닭', '파', '닭']) {
      await page.getByRole('button', { name: new RegExp(`negima-${i + 1} · ${ingredient} 넣기`) }).click();
    }
  }
  await page.getByRole('button', { name: '조립한 2개를 그릴로' }).click();
  await page.getByRole('button', { name: 'negima-1 → 1번 칸' }).click();
  await page.getByRole('button', { name: 'negima-2 → 2번 칸' }).click();
  await page.getByRole('button', { name: 'negima-1 앞면 뒤집기' }).click();
  await page.getByRole('button', { name: 'negima-2 앞면 뒤집기' }).click();
  await page.getByRole('button', { name: 'negima-1 뒷면 회수' }).click();
  await page.getByRole('button', { name: 'negima-2 뒷면 회수' }).click();
  await page.getByRole('button', { name: '네기마 제공으로 이동' }).click();
  await click(page, 'prepared-negima');
  await page.getByRole('button', { name: '다 주기' }).click();
  await page.getByRole('button', { name: '손님 반응 확인' }).click();

  await expect(page.getByTestId('customer-state')).toContainText('완료');
  expect(await page.evaluate(() => window.__d1SceneDebug.customerTextureUrl()))
    .toBe('/public/assets/core/customer/d1-tsukioka-received-eating-negima-r2-b1.png');
  await page.waitForFunction(
    () => window.__d1SceneDebug.customerTextureUrl().endsWith('d1-tsukioka-received-eating-beer-r2-b1.png'),
    undefined,
    { timeout: 1800 },
  );
  expect(errs).toEqual([]);
});
