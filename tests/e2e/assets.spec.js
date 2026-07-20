// ART-001 §완료기준 5, 6 / SYS-001 §완료기준 7
// 에셋 404, 처리되지 않은 콘솔 오류, 보간 방식과 로딩 게이트를 검사한다.
import { test, expect } from '@playwright/test';

function collectProblems(page) {
  const failedRequests = [];
  const consoleErrors = [];

  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`FAILED ${req.url()}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`uncaught: ${err.message}`);
  });

  return { failedRequests, consoleErrors };
}

async function playFullFlow(page) {
  for (const ing of ['chicken', 'leek', 'chicken', 'leek', 'chicken']) {
    await page.getByTestId(`ingredient-${ing}`).click();
    await page.waitForTimeout(200);
  }
  await page.getByTestId('assembled-skewer').click();
  await expect(page.getByTestId('screen-grill')).toBeVisible();
  await page.getByTestId('waiting-skewer').click();
  await page.waitForTimeout(2700);
  await page.getByTestId('grill-canvas').click();
  await page.waitForTimeout(2700);
  await page.getByTestId('grill-canvas').click();
  await expect(page.getByTestId('screen-counter')).toBeVisible({ timeout: 2000 });
  await page.getByTestId('counter-plate').click();
  await page.getByTestId('order-mat').click();
  await expect(page.getByTestId('result-overlay')).toBeVisible();
}

test('정상 흐름에 에셋 404와 처리되지 않은 콘솔 오류가 없다', async ({ page }) => {
  const { failedRequests, consoleErrors } = collectProblems(page);

  await page.goto('/src/index.html');
  await expect(page.getByTestId('loading-overlay')).toBeHidden({ timeout: 10000 });
  await playFullFlow(page);

  expect(failedRequests, `실패한 요청:\n${failedRequests.join('\n')}`).toEqual([]);
  expect(consoleErrors, `콘솔 오류:\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('픽셀 에셋이 최근접 보간을 유지한다', async ({ page }) => {
  await page.goto('/src/index.html');
  await expect(page.getByTestId('loading-overlay')).toBeHidden({ timeout: 10000 });

  for (const testId of ['ingredient-chicken', 'screen-assembly']) {
    const target =
      testId === 'ingredient-chicken'
        ? page.getByTestId(testId).locator('.ingredient-icon')
        : page.getByTestId(testId);
    const rendering = await target.evaluate((node) => getComputedStyle(node).imageRendering);
    expect(rendering, `${testId}의 image-rendering`).toBe('pixelated');
  }
});

test('필수 에셋 로딩 전에는 핵심 입력이 활성화되지 않는다', async ({ page }) => {
  // 에셋 응답을 지연시켜 로딩 게이트가 실제로 동작하는지 확인한다
  await page.route('**/art/generated/bg-assembly.png', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });

  // `load`까지 기다리면 지연이 이미 끝나 로딩 상태를 관찰할 수 없다
  await page.goto('/src/index.html', { waitUntil: 'commit' });
  await expect(page.getByTestId('loading-overlay')).toBeVisible();
  await expect(page.getByTestId('screen-assembly')).toBeHidden();

  await expect(page.getByTestId('loading-overlay')).toBeHidden({ timeout: 10000 });
  await expect(page.getByTestId('screen-assembly')).toBeVisible();
});

test('필수 에셋 로딩 실패는 오류 화면과 다시 시도로 처리된다', async ({ page }) => {
  let failNext = true;
  await page.route('**/art/generated/plate.png', async (route) => {
    if (failNext) {
      failNext = false;
      await route.abort();
    } else {
      await route.continue();
    }
  });

  await page.goto('/src/index.html');
  await expect(page.getByTestId('error-overlay')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('error-message')).toContainText('에셋');

  await page.getByTestId('retry-button').click();
  await expect(page.getByTestId('error-overlay')).toBeHidden({ timeout: 10000 });
  await expect(page.getByTestId('screen-assembly')).toBeVisible();
});
