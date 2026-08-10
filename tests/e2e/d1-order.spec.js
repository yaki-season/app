import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { approvedIdsFromManifest, d1ReadinessExpectation } from '../helpers/d1Readiness.js';

// 승인 아트가 하나 붙을 때마다 숫자를 손으로 고치지 않도록 실제 manifest + inventory에서 파생한다.
const EXPECTED_PLACEHOLDER_COUNT = d1ReadinessExpectation(approvedIdsFromManifest(
  JSON.parse(readFileSync(new URL('../../public/assets/manifest.json', import.meta.url), 'utf8')),
)).placeholderCount;

async function click(page, testId) {
  await page.getByTestId(testId).click();
}

test('D1: 주문·생맥주 부분 제공·2칸 그릴·네기마 최종 제공을 완료한다', async ({ page }) => {
  await page.goto('/src/d1.html');
  await expect(page.locator('body')).toHaveAttribute('data-runtime-assets-ready', 'false');
  await expect(page.locator('body')).toHaveAttribute('data-runtime-contract-valid', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-asset-placeholder-count', String(EXPECTED_PLACEHOLDER_COUNT));
  const readiness = await page.evaluate(() => window.__d1Debug.assetReadiness());
  expect(readiness.placeholderIdsByScene).toMatchObject({
    drink: expect.any(Array),
    assembly: expect.any(Array),
    grill: expect.any(Array),
  });
  expect(readiness.contractAudit.valid).toBe(true);
  expect(readiness.placeholderIdsByScene.grill).toContain('MDL-NEGIMA-GRILL-PROPER-SECOND-FACE');
  expect(readiness.placeholderIdsByScene.grill).toContain('CMP-GRILL-FINISHED-PROPER-NEGIMA');
  await expect(page.locator('.art-background')).toHaveAttribute('src', '/public/assets/core/customer/background-complete-r4-b1.png');
  await expect(page.locator('.art-seating')).toHaveAttribute('src', '/public/assets/core/customer/bg-seating-6-r2-b1.png');
  await expect(page.locator('.art-table')).toHaveAttribute('src', '/public/assets/core/customer/service-table-straight-r5-b1.png');
  await expect(page.locator('.art-background')).toHaveJSProperty('naturalWidth', 1920);
  await expect(page.getByTestId('order-negima').locator('img')).toHaveAttribute('src', '/public/assets/core/ui/order-icon-negima-r1-b1.png');
  await expect(page.getByTestId('d1-scene-status')).toHaveAttribute('data-manifest-id', 'D1-TSUKIOKA-WAITING');

  await page.getByRole('button', { name: '손님 입장 완료' }).click();
  await page.getByRole('button', { name: 'D1 주문 접수' }).click();
  await expect(page.getByTestId('d1-scene-status')).toHaveAttribute('data-asset-state', 'partial');
  await expect(page.getByTestId('d1-scene-status')).toHaveAttribute(
    'data-manifest-id',
    'BG-WORKSPACE-DRINK',
  );
  await expect(page.getByTestId('d1-scene-status')).toContainText('개발 중');
  // MDL-BEER-LEVER는 승인·binding 완료라 더 이상 missing이 아니다.
  await expect(page.getByTestId('d1-scene-status')).not.toHaveAttribute('data-missing-asset-ids', /MDL-BEER-LEVER/);
  await expect(page.getByTestId('d1-scene-status')).not.toHaveAttribute(
    'data-missing-asset-ids',
    /BG-WORKSPACE-DRINK/,
  );
  await expect(page.locator('#customer-art-stage')).toBeVisible();
  await expect(page.locator('.art-background')).toHaveAttribute(
    'src',
    '/public/assets/core/drink/bg-workspace-drink-r2-b1.png',
  );
  await expect(page.locator('#customer-art')).toBeHidden();
  await expect(page.locator('.art-table')).toBeHidden();
  await expect(page.getByTestId('order-draft-beer')).toContainText('x1/1');
  await expect(page.getByTestId('order-negima')).toContainText('x2/2');

  await page.getByRole('button', { name: '레버 아래: 맥주 3초' }).click();
  await page.getByRole('button', { name: '레버 위: 거품 1초' }).click();
  await page.getByRole('button', { name: '완성 잔을 준비 목록으로' }).click();
  await click(page, 'prepared-draft-beer');
  await page.getByRole('button', { name: '다 주기' }).click();
  await expect(page.getByTestId('order-draft-beer')).toContainText('x0/1');
  await expect(page.getByTestId('order-negima')).toContainText('x2/2');
  await expect(page.getByTestId('customer-state')).toContainText('생맥주를 받았습니다');
  await expect(page.locator('#customer-art')).toHaveAttribute('src', '/public/assets/core/customer/d1-tsukioka-partial-beer-waiting-r2-b1.png');
  await expect(page.getByTestId('d1-scene-status')).toHaveAttribute('data-manifest-id', 'D1-TSUKIOKA-PARTIAL-BEER-WAITING');

  await page.getByRole('button', { name: '네기마 조립 시작' }).click();
  await expect(page.getByTestId('d1-scene-status')).toHaveAttribute('data-missing-asset-ids', /MDL-SKEWER-BASE/);
  await expect(page.getByTestId('d1-scene-status')).not.toHaveAttribute('data-missing-asset-ids', /BG-WORKSPACE-ASSEMBLY/);
  for (let i = 0; i < 2; i += 1) {
    for (const ingredient of ['닭', '파', '닭', '파', '닭']) {
      await page.getByRole('button', { name: new RegExp(`negima-${i + 1} · ${ingredient} 넣기`) }).click();
    }
  }
  await page.getByRole('button', { name: '조립한 2개를 그릴로' }).click();
  // SECOND-FACE는 승인된 code-native 색 계약이라 더 이상 missing이 아니다.
  await expect(page.getByTestId('d1-scene-status')).not.toHaveAttribute('data-missing-asset-ids', /MDL-NEGIMA-GRILL-COOKING-SECOND-FACE/);
  await expect(page.getByTestId('d1-scene-status')).toHaveAttribute('data-missing-asset-ids', /MDL-NEGIMA-GRILL-COOKING-FIRST-FACE/);

  await page.getByRole('button', { name: 'negima-1 → 1번 칸' }).click();
  await page.getByRole('button', { name: 'negima-2 → 2번 칸' }).click();
  await page.getByRole('button', { name: 'negima-1 앞면 뒤집기' }).click();
  await page.getByRole('button', { name: 'negima-2 앞면 뒤집기' }).click();
  await page.getByRole('button', { name: 'negima-1 뒷면 회수' }).click();
  await page.getByRole('button', { name: 'negima-2 뒷면 회수' }).click();
  await page.getByRole('button', { name: '네기마 제공으로 이동' }).click();

  await click(page, 'prepared-negima');
  await page.getByRole('button', { name: '다 주기' }).click();
  await expect(page.getByTestId('order-negima')).toContainText('x0/2');
  await page.getByRole('button', { name: '손님 반응 확인' }).click();
  await expect(page.getByTestId('customer-state')).toContainText('완료');
  await expect(page.getByTestId('d1-guide')).toHaveCount(0);
  await expect(page.locator('#customer-art')).toHaveAttribute('src', '/public/assets/core/customer/d1-tsukioka-received-eating-negima-r2-b1.png');
  await page.waitForFunction(
    () => document.querySelector('#customer-art')?.getAttribute('src')
      ?.endsWith('d1-tsukioka-received-eating-beer-r2-b1.png'),
    undefined,
    { timeout: 1800 },
  );
  await expect(page.getByTestId('d1-scene-status')).toHaveAttribute('data-manifest-id', 'D1-TSUKIOKA-RECEIVED-EATING');
});
