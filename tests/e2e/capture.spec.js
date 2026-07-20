// 공정별 화면 캡처. 자동 판정이 아니라 눈으로 확인하기 위한 산출물이다.
// 실행: npx playwright test capture --project=chromium-1280x720
import { test, expect } from '@playwright/test';

const OUT = 'captures';

test('공정별 화면을 캡처한다', async ({ page }, testInfo) => {
  const vp = `${testInfo.project.use.viewport.width}x${testInfo.project.use.viewport.height}`;
  const shot = (name) => page.screenshot({ path: `${OUT}/${vp}_${name}.png` });

  await page.goto('/src/index.html');
  await expect(page.getByTestId('loading-overlay')).toBeHidden({ timeout: 10000 });
  await expect(page.getByTestId('error-overlay')).toBeHidden();

  await shot('01-조립-시작');

  await page.getByTestId('ingredient-leek').click(); // 오입력 피드백
  await shot('02-조립-잘못된재료');
  await page.waitForTimeout(400);

  for (const ing of ['chicken', 'leek', 'chicken', 'leek', 'chicken']) {
    await page.getByTestId(`ingredient-${ing}`).click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400); // 마지막 관통 연출이 끝난 뒤 찍는다
  await shot('03-조립-완료');

  await page.getByTestId('assembled-skewer').click();
  await shot('04-그릴-대기꼬치');

  await page.getByTestId('waiting-skewer').click();
  await page.waitForTimeout(1200);
  await shot('05-그릴-앞면-덜익음');

  await page.waitForTimeout(1800);
  await shot('06-그릴-앞면-적정');

  await page.getByTestId('grill-canvas').click();
  await page.waitForTimeout(3000);
  await shot('07-그릴-뒷면-적정');

  await page.getByTestId('grill-canvas').click();
  await page.waitForTimeout(700);
  await shot('08-카운터-접시');

  await page.getByTestId('counter-plate').click();
  await shot('09-카운터-접시선택');

  await page.getByTestId('order-mat').click();
  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await shot('10-서빙-결과');
});
