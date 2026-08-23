// 익힘 셰이더 실시간 튜너 (개발 도구, 키 G) 종단 검증.
// 판정 시간(gameState)이 아니라 시각 파라미터만 다루므로, 튜너가 uniform을 실제로 바꾸고
// 익힘 단계를 대기 없이 미리 보여주는지, 값이 grill-skewer에 반영되는지 확인한다.
import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';
import { GRILL_PARAMS } from '../../src/presentation/three/grillShaderParams.js';

async function bootWithShader(page) {
  await boot(page);
  // 셰이더 재질 로드 대기
  await expect.poll(() => page.evaluate(() => !!window.__sceneDebug.grillMaterial())).toBe(true);
}

test('키 G로 튜너를 열고 닫는다', async ({ page }) => {
  await bootWithShader(page);
  await expect(page.getByTestId('grill-tuner')).toBeHidden();

  await page.keyboard.press('g');
  await expect(page.getByTestId('grill-tuner')).toBeVisible();
  expect(await page.evaluate(() => window.__grillTuner.isOpen())).toBe(true);

  await page.keyboard.press('g');
  await expect(page.getByTestId('grill-tuner')).toBeHidden();
});

test('슬라이더가 셰이더 uniform을 실제로 바꾼다', async ({ page }) => {
  await bootWithShader(page);
  await page.evaluate(() => window.__grillTuner.open());

  await page.evaluate(() => window.__grillTuner.setParam('charStrength', 1.0));
  const applied = await page.evaluate(
    () => window.__sceneDebug.grillMaterial().uniforms.uCharStrength.value,
  );
  expect(applied).toBeCloseTo(1.0, 5);

  // 튜너가 보관한 값도 일치
  const stored = await page.evaluate(() => window.__grillTuner.getValues().charStrength);
  expect(stored).toBeCloseTo(1.0, 5);
});

test('익힘 단계 미리보기가 대기 없이 uDoneness를 고정한다', async ({ page }) => {
  await bootWithShader(page);
  await page.evaluate(() => window.__grillTuner.open());

  await page.evaluate(() => window.__grillTuner.previewStage(1.0));
  await page.waitForTimeout(50);
  const burnt = await page.evaluate(() => window.__sceneDebug.grillMaterial().uniforms.uDoneness.value);
  expect(burnt).toBeCloseTo(1.0, 3);

  await page.evaluate(() => window.__grillTuner.previewStage(0.0));
  // 0은 override 해제 값이 아니라 유효한 날것 단계다. 즉시 반영되고 다음 프레임에도 유지돼야 한다.
  const immediateRaw = await page.evaluate(
    () => window.__sceneDebug.grillMaterial().uniforms.uDoneness.value,
  );
  expect(immediateRaw).toBeCloseTo(0.0, 3);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const raw = await page.evaluate(() => window.__sceneDebug.grillMaterial().uniforms.uDoneness.value);
  expect(raw).toBeCloseTo(0.0, 3);
});

test('기본값 버튼이 파라미터를 복원한다', async ({ page }) => {
  await bootWithShader(page);
  await page.evaluate(() => window.__grillTuner.open());

  await page.evaluate(() => window.__grillTuner.setParam('tareGloss', 3.0));
  await page.getByRole('button', { name: '기본값' }).click();
  const restored = await page.evaluate(() => window.__grillTuner.getValues().tareGloss);
  expect(restored).toBeCloseTo(GRILL_PARAMS.tareGloss, 5);
});
