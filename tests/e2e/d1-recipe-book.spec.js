// 비법노트는 언제든 펼쳐 볼 수 있고, 화면 위 조립 안내는 처음 만드는 메뉴에만 뜬다.
import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

const D = (page, name, ...args) => page.evaluate(
  ({ debugName, values }) => window.__d1GameDebug[debugName](...values),
  { debugName: name, values: args },
);

async function bootD1(page) {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
}

test('비법노트를 열면 조립 순서와 굽기·따르기 기준을 볼 수 있다', async ({ page }) => {
  await bootD1(page);
  await expect(page.getByTestId('recipe-book')).toBeHidden();

  await page.getByTestId('recipe-book-toggle').click();
  await expect(page.getByTestId('recipe-book')).toBeVisible();
  await expect(page.getByTestId('recipe-book-negima'))
    .toContainText('닭다리살 → 대파 → 닭다리살 → 대파 → 닭다리살');
  await expect(page.getByTestId('recipe-book-negima')).toContainText('양면 모두 구워야');
  await expect(page.getByTestId('recipe-book-momo')).toContainText('닭다리살 5조각');
  await expect(page.getByTestId('recipe-book-beer')).toContainText('넘칩니다');

  await page.getByTestId('recipe-book-close').click();
  await expect(page.getByTestId('recipe-book')).toBeHidden();

  // 다시 열고 Escape로도 닫힌다.
  await page.getByTestId('recipe-book-toggle').click();
  await expect(page.getByTestId('recipe-book')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('recipe-book')).toBeHidden();
});

test('조립 안내는 처음 만드는 메뉴에만 뜨고 한 번 만들면 접힌다', async ({ page }) => {
  await bootD1(page);
  await D(page, 'requestScreen', 'SCR-SVC-ASSEMBLY');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);

  // 처음이라 다섯 단계가 모두 보인다.
  await expect(page.getByTestId('order-slot-0')).toBeVisible();
  await expect(page.getByTestId('order-slot-4')).toBeVisible();

  await D(page, 'cookFillAssembly', 'negima');
  await expect.poll(() => D(page, 'cookWaiting')).toBeGreaterThan(0);

  // 한 번 만든 뒤에는 단계 안내를 접는다. 대기 수량은 그대로 남는다.
  await D(page, 'cookPlace');
  await expect(page.getByTestId('order-slot-0')).toBeHidden();
  await expect(page.getByTestId('wait-count')).toBeVisible();

  // 익힌 사실은 새로고침 뒤에도 남는다.
  await page.goto('/src/d1-game.html?resume=1');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await D(page, 'requestScreen', 'SCR-SVC-ASSEMBLY');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
  await expect(page.getByTestId('order-slot-0')).toBeHidden();
});
