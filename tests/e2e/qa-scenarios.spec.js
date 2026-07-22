// QA-001 §수동 검증 시나리오 A~D와 §시각 검증을 스크립트로 재현한다.
//
// 주의: QA-001은 이 시나리오들을 "수동 검증"으로 분류한다. 여기서는 사람이 직접
// 조작하는 대신 같은 단계를 브라우저 자동화로 재현한 것이다. 사람의 이해도와
// 손맛 판단은 §관찰 플레이테스트 항목이며 이 파일로 대체되지 않는다.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/src/index.html');
  await expect(page.getByTestId('loading-overlay')).toBeHidden({ timeout: 10000 });
  await expect(page.getByTestId('error-overlay')).toBeHidden();
}

async function assemble(page) {
  for (const ing of ['chicken', 'leek', 'chicken', 'leek', 'chicken']) {
    await page.getByTestId(`ingredient-${ing}`).click();
    await page.waitForTimeout(200);
  }
}

const getState = (page) => page.evaluate(() => window.__yakiDebug.getState());

test('시나리오 A: 정상 품질 서빙', async ({ page }) => {
  await boot(page);

  // 1. 주문표 확인 — 닭·파·닭·파·닭
  const slots = page.locator('#orderList li');
  await expect(slots).toHaveCount(5);
  await expect(slots.nth(0)).toHaveAttribute('data-ingredient', 'chicken');
  await expect(slots.nth(1)).toHaveAttribute('data-ingredient', 'leek');
  await expect(slots.nth(4)).toHaveAttribute('data-ingredient', 'chicken');

  // 2. 순서대로 조립
  await assemble(page);
  expect((await getState(page)).assemblyIndex).toBe(5);

  // 3. 완성 꼬치 → 대기 꼬치 → 그릴
  await page.getByTestId('assembled-skewer').click();
  await expect(page.getByTestId('screen-grill')).toBeVisible();
  await page.getByTestId('waiting-skewer').click();
  expect((await getState(page)).status).toBe('grillFront');

  // 4. 앞면 적정에서 뒤집기
  await page.waitForTimeout(2700);
  await expect(page.getByTestId('grill-face-badge')).toContainText('적정');
  await page.getByTestId('grill-canvas').click();
  expect((await getState(page)).frontResult).toBe('perfect');

  // 5. 뒷면 적정에서 접시 회수
  await page.waitForTimeout(2700);
  await page.getByTestId('grill-canvas').click();
  const plated = await getState(page);
  expect(plated.status).toBe('plated');
  expect(plated.backResult).toBe('perfect');

  // 6. 접시 → 손님 주문 매트
  await expect(page.getByTestId('screen-counter')).toBeVisible({ timeout: 2000 });
  await page.getByTestId('counter-plate').click();
  await expect(page.getByTestId('order-mat')).toHaveClass(/highlight/);
  await page.getByTestId('order-mat').click();

  // 7. 좋은 반응과 다시 하기
  await expect(page.getByTestId('result-overlay')).toBeVisible();
  expect((await getState(page)).servedQuality).toBe('good');
  await expect(page.getByTestId('customer')).toHaveClass(/happy/);
  await page.getByTestId('restart-button').click();
  await expect(page.getByTestId('screen-assembly')).toBeVisible();
});

test('시나리오 B: 잘못된 재료와 이른 클릭', async ({ page }) => {
  await boot(page);

  // 1~2. 첫 재료로 대파 → 진행 증가 없음, 올바른 칸 강조
  await page.getByTestId('ingredient-leek').click();
  expect((await getState(page)).assemblyIndex).toBe(0);
  await expect(page.getByTestId('ingredient-leek')).toHaveClass(/mismatch/);
  await expect(page.getByTestId('order-slot-0')).toHaveClass(/mismatch/);
  await page.waitForTimeout(400);

  // 3~4. 정상 조립 후 그릴에 올린 직후 클릭 → 뒤집히지 않고 덜 익음 피드백
  await assemble(page);
  await page.getByTestId('assembled-skewer').click();
  await page.getByTestId('waiting-skewer').click();
  await page.waitForTimeout(400);
  await page.getByTestId('grill-canvas').click();
  expect((await getState(page)).status).toBe('grillFront');
  await expect(page.getByTestId('grill-feedback')).toBeVisible();
  await expect(page.getByTestId('grill-feedback')).toContainText('덜 익었');

  // 5. 이후 정상 흐름을 계속 완료할 수 있다
  await page.waitForTimeout(2500);
  await page.getByTestId('grill-canvas').click();
  await page.waitForTimeout(2700);
  await page.getByTestId('grill-canvas').click();
  await expect(page.getByTestId('screen-counter')).toBeVisible({ timeout: 2000 });
  await page.getByTestId('counter-plate').click();
  await page.getByTestId('order-mat').click();
  await expect(page.getByTestId('result-overlay')).toBeVisible();
});

test('시나리오 C: 탄 꼬치와 복구', async ({ page }) => {
  await boot(page);
  await assemble(page);
  await page.getByTestId('assembled-skewer').click();
  await page.getByTestId('waiting-skewer').click();

  // 1~2. 7초 이상 방치 → 탄 상태와 실패 원인, 다시 만들기
  await page.waitForTimeout(7300);
  await expect(page.getByTestId('result-overlay')).toBeVisible({ timeout: 2000 });
  await expect(page.getByTestId('result-message')).toContainText('타버렸습니다');
  const failed = await getState(page);
  expect(failed.status).toBe('failed');
  expect(failed.frontResult).toBe('burnt');

  // 3~4. 다시 만들기 → 이전 타이머와 결과가 남지 않는다
  await page.getByTestId('restart-button').click();
  const fresh = await getState(page);
  expect(fresh.status).toBe('assembly');
  expect(fresh.assemblyIndex).toBe(0);
  expect(fresh.frontResult).toBeNull();
  expect(fresh.backResult).toBeNull();
  expect(fresh.faceStartAtMs).toBeNull();
  expect(fresh.pausedAtMs).toBeNull();
  expect(fresh.plateSelected).toBe(false);
  expect(fresh.servedQuality).toBeNull();
});

test('시나리오 D: 중단과 복귀', async ({ page }) => {
  await boot(page);
  await assemble(page);
  await page.getByTestId('assembled-skewer').click();
  await page.getByTestId('waiting-skewer').click();

  // 1. 굽기 1초 시점에 숨김
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await getState(page);
  expect(hidden.pausedAtMs).not.toBeNull();

  // 2. 7초 이상 대기 후 복귀
  await page.waitForTimeout(7500);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // 3. 숨김 시간이 누적되지 않아 아직 타지 않았다
  const resumed = await getState(page);
  expect(resumed.status).toBe('grillFront');
  expect(resumed.pausedAtMs).toBeNull();

  // 4. 같은 꼬치를 계속 조리해 정상 서빙한다
  await page.waitForTimeout(2000);
  await page.getByTestId('grill-canvas').click();
  expect((await getState(page)).status).toBe('grillBack');
  await page.waitForTimeout(2700);
  await page.getByTestId('grill-canvas').click();
  await expect(page.getByTestId('screen-counter')).toBeVisible({ timeout: 2000 });
  await page.getByTestId('counter-plate').click();
  await page.getByTestId('order-mat').click();
  await expect(page.getByTestId('result-overlay')).toBeVisible();
});

test('시각 검증: 그릴 캔버스가 빈 화면이나 단색이 아니다', async ({ page }) => {
  await boot(page);
  await assemble(page);
  await page.getByTestId('assembled-skewer').click();
  await page.getByTestId('waiting-skewer').click();
  await page.waitForTimeout(2700);

  // 캔버스 픽셀을 직접 읽어 렌더 결과를 확인한다 (QA-001 §시각 검증)
  const stats = await page.getByTestId('grill-canvas').evaluate((canvas) => {
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    off.getContext('2d').drawImage(canvas, 0, 0);
    const { data } = off.getContext('2d').getImageData(0, 0, off.width, off.height);

    const seen = new Set();
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 8) {
        opaque++;
        seen.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      }
    }
    return { opaque, total: data.length / 4, distinctColors: seen.size };
  });

  // 빈 화면이 아니다
  expect(stats.opaque, '캔버스가 비어 있습니다').toBeGreaterThan(stats.total * 0.02);
  // 단색 오류 화면이 아니다
  expect(stats.distinctColors, '캔버스가 단색입니다').toBeGreaterThan(4);
});
