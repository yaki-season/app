import { test, expect } from '@playwright/test';

test('D1 튜토리얼은 기본 접힘이며 전체 목록을 토글할 수 있다', async ({ page }) => {
  await page.goto('/src/d1-game.html');
  const guide = page.getByTestId('d1-guide');
  const steps = page.getByTestId('guide-steps');
  const toggle = page.getByRole('button', { name: '전체 보기' });

  await expect(guide).toHaveAttribute('data-expanded', 'false');
  await expect(steps).toBeHidden();
  await expect(page.getByTestId('guide-next-action')).toBeVisible();

  await toggle.click();
  await expect(guide).toHaveAttribute('data-expanded', 'true');
  await expect(steps).toBeVisible();
  await expect(guide).toHaveCSS('pointer-events', 'auto');
  await expect(page.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: '접기' }).click();
  await expect(steps).toBeHidden();
});

test('새 D1 게임은 이전 첫 주문 튜토리얼 진행도를 초기화한다', async ({ page }) => {
  await page.goto('/src/d1-game.html');
  await page.evaluate(() => localStorage.setItem('yaki-season:d1-first-order-runtime:v1', JSON.stringify({
    stateVersion: 1,
    guide: { completed: ['order.accept', 'order.complete'] },
  })));

  await page.goto('/src/d1-game.html?reset=1');
  await expect(page.getByTestId('guide-current')).toContainText('주문 접수');
  await expect(page.getByTestId('guide-current')).not.toHaveText('완료');
});
