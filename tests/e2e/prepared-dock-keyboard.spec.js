import { test, expect } from '@playwright/test';

test('완성품을 Enter로 선택해도 초점이 사라지지 않고 다음 카드로 이동한다', async ({ page }) => {
  await page.goto('/d1-game.html?day=d1&reset=1');
  await page.waitForFunction(() => window.__d1GameDebug?.businessSession?.().ok);
  // 이 검사는 키보드 선택 UI만 격리한다. 조리 결과의 실입력 검증과 구분한다.
  const ids = await page.evaluate(() => Array.from({ length: 8 }, () => window.__d1GameDebug.dockAdd({
    menuId: 'negima', menu: '네기마', quality: 'Perfect', good: true, seasoning: 'salt',
  })));
  const beforeLast = page.getByTestId(`dock-item-${ids.at(-2)}`);
  const last = page.getByTestId(`dock-item-${ids.at(-1)}`);
  await beforeLast.focus();
  await page.keyboard.press('Enter');
  await expect(beforeLast).toHaveAttribute('aria-pressed', 'true');
  await expect(beforeLast).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  await expect(last).toBeFocused();
});
