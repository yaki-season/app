import { test, expect } from '@playwright/test';

async function click(page, testId) {
  await page.getByTestId(testId).click();
}

test('D1: 주문·생맥주 부분 제공·2칸 그릴·네기마 최종 제공을 완료한다', async ({ page }) => {
  await page.goto('/src/d1.html');
  await expect(page.locator('.art-background')).toHaveAttribute('src', '/assets/core/customer/background-complete-r3-b1.png');
  await expect(page.locator('.art-table')).toHaveAttribute('src', '/assets/core/customer/service-table-complete-r1-b1.png');
  await expect(page.getByTestId('order-negima').locator('img')).toHaveAttribute('src', '/assets/core/ui/order-icon-negima-r1-b1.png');

  await page.getByRole('button', { name: '손님 입장 완료' }).click();
  await page.getByRole('button', { name: 'D1 주문 접수' }).click();
  await expect(page.getByTestId('order-draft-beer')).toContainText('x1/1');
  await expect(page.getByTestId('order-negima')).toContainText('x3/3');

  await page.getByRole('button', { name: '레버 아래: 맥주 3초' }).click();
  await page.getByRole('button', { name: '레버 위: 거품 1초' }).click();
  await page.getByRole('button', { name: '완성 잔을 준비 목록으로' }).click();
  await click(page, 'prepared-draft-beer');
  await page.getByRole('button', { name: '다 주기' }).click();
  await expect(page.getByTestId('order-draft-beer')).toContainText('x0/1');
  await expect(page.getByTestId('order-negima')).toContainText('x3/3');
  await expect(page.getByTestId('customer-state')).toContainText('생맥주를 받았습니다');
  await expect(page.locator('#customer-art')).toHaveAttribute('src', '/assets/core/customer/d1-tsukioka-partial-beer-waiting-r1-b1.png');

  await page.getByRole('button', { name: '네기마 조립 시작' }).click();
  for (let i = 0; i < 3; i += 1) {
    for (const ingredient of ['닭', '파', '닭', '파', '닭']) {
      await page.getByRole('button', { name: new RegExp(`negima-${i + 1} · ${ingredient} 넣기`) }).click();
    }
  }
  await page.getByRole('button', { name: '조립한 3개를 그릴로' }).click();

  await page.getByRole('button', { name: 'negima-1 → 1번 칸' }).click();
  await page.getByRole('button', { name: 'negima-2 → 2번 칸' }).click();
  await page.getByRole('button', { name: 'negima-1 앞면 뒤집기' }).click();
  await page.getByRole('button', { name: 'negima-2 앞면 뒤집기' }).click();
  await page.getByRole('button', { name: 'negima-1 뒷면 회수' }).click();
  await page.getByRole('button', { name: 'negima-2 뒷면 회수' }).click();
  await page.getByRole('button', { name: 'negima-3 → 1번 칸' }).click();
  await page.getByRole('button', { name: 'negima-3 앞면 뒤집기' }).click();
  await page.getByRole('button', { name: 'negima-3 뒷면 회수' }).click();
  await page.getByRole('button', { name: '네기마 제공으로 이동' }).click();

  await click(page, 'prepared-negima');
  await page.getByRole('button', { name: '다 주기' }).click();
  await expect(page.getByTestId('order-negima')).toContainText('x0/3');
  await page.getByRole('button', { name: '손님 반응 확인' }).click();
  await expect(page.getByTestId('customer-state')).toContainText('완료');
  await expect(page.getByTestId('d1-guide')).toContainText('완료');
  await expect(page.locator('#customer-art')).toHaveAttribute('src', '/assets/core/customer/d1-tsukioka-received-eating-beer-r1-b1.png');
});
