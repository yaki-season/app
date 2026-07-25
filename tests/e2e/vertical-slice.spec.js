// 수직 슬라이스 종단 (2.5D 장면 뷰). 조립→굽기→서빙 정상 흐름과 오류·경계 처리.
// 조리 판정 로직 자체의 세부는 단위 테스트(gameState)가 지키고, 여기서는 장면 배선을 확인한다.
import { test, expect } from '@playwright/test';
import {
  boot, getState, doneness, clickHotspot,
  assembleSkewer, placeOnGrill, cookAndServe,
} from './helpers.js';

test('정상 흐름: 조립부터 서빙까지 완료되고 손님이 만족한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await boot(page);
  await cookAndServe(page);

  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await expect(page.getByTestId('result-message')).toContainText('만족');
  expect(errors).toEqual([]);
});

test('오류 흐름: 잘못된 재료와 이른 그릴 클릭은 진행을 바꾸지 않는다', async ({ page }) => {
  await boot(page);

  // 순서가 틀린 재료(대파 먼저)는 조립을 진행시키지 않는다.
  await clickHotspot(page, 'ingredient-leek');
  await page.waitForTimeout(120);
  expect((await getState(page)).assemblyIndex).toBe(0);

  // 조립·그릴 배치 후, 덜 익었을 때 클릭은 뒤집기를 만들지 않는다.
  await assembleSkewer(page);
  await placeOnGrill(page);
  expect(await doneness(page)).toBe('under');
  await clickHotspot(page, 'grill-skewer');
  await page.waitForTimeout(120);
  expect((await getState(page)).status).toBe('grillFront');
});

test('탄 상태: 방치하면 실패하고 다시 시작할 수 있다', async ({ page }) => {
  await boot(page);
  await assembleSkewer(page);
  await placeOnGrill(page);

  // 뒤집지 않고 방치 → 탄 상태 실패
  await expect(page.getByTestId('result-overlay')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('result-message')).toContainText('타버렸습니다');
  expect((await getState(page)).status).toBe('failed');

  await page.getByTestId('restart-button').click();
  await expect.poll(() => getState(page).then((s) => s.status)).toBe('assembly');
});

test('그릴 위 빠른 이중 클릭은 뒤집기를 한 번만 처리한다', async ({ page }) => {
  await boot(page);
  await assembleSkewer(page);
  await placeOnGrill(page);

  await expect.poll(() => doneness(page), { timeout: 15000 }).toBe('perfect');
  const pos = await page.evaluate(() => window.__sceneDebug.screenPosOf('grill-skewer'));
  await page.mouse.click(pos.x, pos.y);
  await page.mouse.click(pos.x, pos.y); // 입력 잠금 안의 두 번째 클릭은 무시된다

  // 한 번만 뒤집혔으므로 뒷면 굽기 상태이지 접시로 넘어가지 않는다.
  await expect.poll(() => getState(page).then((s) => s.status)).toBe('grillBack');
});
