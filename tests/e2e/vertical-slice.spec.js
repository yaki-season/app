import { test, expect } from '@playwright/test';
import {
  boot,
  getState,
  assembleSkewer,
  placeOnGrill,
  clickWhenPerfect,
  serve,
} from './helpers.js';

test('정상 흐름: 조립부터 서빙까지 완료된다', async ({ page }) => {
  await boot(page);
  await assembleSkewer(page);

  await page.getByTestId('assembled-skewer').click();
  await expect(page.getByTestId('screen-grill')).toBeVisible();
  await page.getByTestId('waiting-skewer').click();

  // 그릴에 올라간 뒤 대기 꼬치는 사라져야 한다.
  // (CSS의 display 규칙이 hidden 속성을 덮으면 계속 보이는 회귀가 생긴다)
  await expect(page.getByTestId('waiting-skewer')).toBeHidden();

  await clickWhenPerfect(page, '앞면'); // 뒤집기
  await clickWhenPerfect(page, '뒷면'); // 접시 회수

  await expect(page.getByTestId('screen-counter')).toBeVisible({ timeout: 5000 });
  await serve(page);

  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await expect(page.getByTestId('result-message')).toContainText('만족');
  // 결과 문구와 함께 손님 반응이 보여야 한다 (GPL-001 §14)
  await expect(page.getByTestId('customer')).toBeVisible();
  await expect(page.getByTestId('customer')).toHaveClass(/happy/);

  await page.getByTestId('restart-button').click();
  await expect(page.getByTestId('result-overlay')).toBeHidden();
  await expect(page.getByTestId('screen-assembly')).toBeVisible();
});

test('오류 흐름: 잘못된 재료와 너무 이른 클릭은 진행을 바꾸지 않는다', async ({ page }) => {
  await boot(page);

  // 첫 재료는 닭이어야 하는데 대파를 클릭 → 진행되지 않음
  await page.getByTestId('ingredient-leek').click();
  await expect(page.getByTestId('ingredient-leek')).toHaveClass(/mismatch/);
  await expect(page.getByTestId('order-slot-0')).not.toHaveClass(/done/);

  await assembleSkewer(page);
  await placeOnGrill(page);

  // 아직 덜 익은 상태에서 클릭 → 상태 변화 없이 피드백만
  await expect(page.getByTestId('grill-face-badge')).toContainText('앞면 · 덜 익음');
  await page.getByTestId('grill-canvas').click();
  await expect(page.getByTestId('grill-face-badge')).toContainText('앞면');
  await expect(page.getByTestId('grill-feedback')).toBeVisible();
});

test('탄 상태: 7초 이상 방치하면 실패하고 다시 시작할 수 있다', async ({ page }) => {
  await boot(page);
  await assembleSkewer(page);
  await placeOnGrill(page);

  // 방치하면 탄 상태가 된다. 고정 대기 대신 결과가 나타날 때까지 기다린다.
  await expect(page.getByTestId('result-overlay')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('result-message')).toContainText('타버렸습니다');

  await page.getByTestId('restart-button').click();
  await expect(page.getByTestId('screen-assembly')).toBeVisible();
});

test('빠른 이중 클릭은 중복 조립 상태 전이를 만들지 않는다', async ({ page }) => {
  await boot(page);
  await page.getByTestId('ingredient-chicken').dblclick();
  expect((await getState(page)).assemblyIndex).toBe(1);
});

test('그릴 위 빠른 이중 클릭은 뒤집기를 한 번만 처리한다', async ({ page }) => {
  await boot(page);
  await assembleSkewer(page);
  await placeOnGrill(page);

  // 적정 구간에서 이중 클릭 — 뒤집기 후 뒷면이 즉시 회수되면 안 된다
  await expect(page.getByTestId('grill-face-badge')).toContainText('앞면 · 적정', { timeout: 15000 });
  await page.getByTestId('grill-canvas').dblclick();

  const state = await getState(page);
  expect(state.status).toBe('grillBack');
  expect(state.backResult).toBeNull();
});

test('포인터 취소는 상태를 바꾸지 않는다', async ({ page }) => {
  await boot(page);

  const before = await getState(page);

  // 재료 위에서 눌렀다가 취소 — click 이벤트가 발생하지 않아야 한다
  await page.getByTestId('ingredient-chicken').dispatchEvent('pointerdown');
  await page.getByTestId('ingredient-chicken').dispatchEvent('pointercancel');

  const after = await getState(page);
  expect(after.assemblyIndex).toBe(before.assemblyIndex);
});

test('창 포커스를 잃어도 진행 상태가 손상되지 않는다', async ({ page }) => {
  await boot(page);
  await assembleSkewer(page);
  await placeOnGrill(page);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));

  const state = await getState(page);
  expect(state.status).toBe('grillFront');
  expect(state.assemblyIndex).toBe(5);
});
