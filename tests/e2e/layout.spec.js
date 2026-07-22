// UI-001 §상세요구사항 4, §데스크톱 화면 요구사항, §예외 및 경계 조건
// 두 데스크톱 검증 뷰포트에서 핵심 조작 대상의 크기와 위치를 확인한다.
import { test, expect } from '@playwright/test';
import { boot, assembleSkewer as assemble, placeOnGrill, clickWhenPerfect } from './helpers.js';

const MIN_CLICK_PX = 44;

async function expectClickable(page, testId) {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId}가 화면에 없습니다`).not.toBeNull();
  expect(box.width, `${testId} 너비`).toBeGreaterThanOrEqual(MIN_CLICK_PX);
  expect(box.height, `${testId} 높이`).toBeGreaterThanOrEqual(MIN_CLICK_PX);

  const vp = page.viewportSize();
  expect(box.x, `${testId}가 왼쪽으로 잘림`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${testId}가 위로 잘림`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${testId}가 오른쪽으로 잘림`).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height, `${testId}가 아래로 잘림`).toBeLessThanOrEqual(vp.height);
}

test('조립 화면의 조작 대상이 최소 클릭 영역을 만족하고 화면 안에 있다', async ({ page }) => {
  await boot(page);
  for (const id of ['ingredient-chicken', 'ingredient-leek', 'tab-assembly', 'tab-grill', 'tab-counter']) {
    await expectClickable(page, id);
  }
});

test('그릴 화면의 조작 대상이 최소 클릭 영역을 만족하고 화면 안에 있다', async ({ page }) => {
  await boot(page);
  await assemble(page);
  await page.getByTestId('assembled-skewer').click();
  await expect(page.getByTestId('screen-grill')).toBeVisible();

  await expectClickable(page, 'waiting-skewer');
  await page.getByTestId('waiting-skewer').click();
  await expectClickable(page, 'grill-canvas');
});

test('카운터 화면의 조작 대상이 최소 클릭 영역을 만족하고 화면 안에 있다', async ({ page }) => {
  await boot(page);
  await assemble(page);
  await placeOnGrill(page);
  await clickWhenPerfect(page, '앞면');
  await clickWhenPerfect(page, '뒷면');

  await expect(page.getByTestId('screen-counter')).toBeVisible({ timeout: 2000 });
  await expectClickable(page, 'counter-plate');
  await expectClickable(page, 'order-mat');
});

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('익힘 상태 배지가 조리 중인 꼬치를 가리지 않는다', async ({ page }) => {
  await boot(page);
  await assemble(page);
  await placeOnGrill(page);

  const badge = await page.getByTestId('grill-face-badge').boundingBox();
  const canvas = await page.getByTestId('grill-canvas').boundingBox();
  expect(overlaps(badge, canvas), '배지가 꼬치와 겹칩니다').toBe(false);
});

test('주문표와 공정 탭과 작업 대상이 서로 겹치지 않는다', async ({ page }) => {
  await boot(page);

  const orderBar = await page.getByTestId('order-bar').boundingBox();
  const tabs = await page.getByTestId('process-tabs').boundingBox();
  const bin = await page.getByTestId('ingredient-chicken').boundingBox();

  // 재료통은 주문표 아래, 공정 탭 위에 있어야 한다
  expect(bin.y).toBeGreaterThanOrEqual(orderBar.y + orderBar.height);
  expect(bin.y + bin.height).toBeLessThanOrEqual(tabs.y);
});

test('조리 영역에서 이미지 끌기와 텍스트 선택이 클릭을 방해하지 않는다', async ({ page }) => {
  await boot(page);
  const userSelect = await page
    .getByTestId('ingredient-chicken')
    .evaluate((node) => getComputedStyle(node).userSelect);
  expect(userSelect).toBe('none');
});
