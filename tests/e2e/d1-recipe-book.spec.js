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

// 비법노트 종이는 승인 라스터 한 장이다. 항목이 늘 때마다 패널을 늘리면 종이가 세로로
// 늘어나 찢긴 가장자리와 펀치홀까지 왜곡된다. 크기는 고정하고 안쪽 목록만 스크롤한다.
const bookBox = async (page) => page.getByTestId('recipe-book').evaluate((node) => {
  const rect = node.getBoundingClientRect();
  const entries = node.querySelector('[data-testid="recipe-book-entries"]');
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    panelScrolls: node.scrollHeight > node.clientHeight + 1,
    entriesScrollable: getComputedStyle(entries).overflowY,
    entriesOverflowing: entries.scrollHeight > entries.clientHeight + 1,
  };
});

test('비법노트는 메뉴가 늘어도 크기가 고정되고 목록만 스크롤한다', async ({ page }) => {
  await bootD1(page);
  await page.getByTestId('recipe-book-toggle').click();
  await expect(page.getByTestId('recipe-book')).toBeVisible();
  const d1Box = await bookBox(page);

  // 메뉴가 3개인 D1과 6개인 D5가 같은 크기여야 한다.
  await page.goto('/src/d1-game.html?day=d5&devUnlock=1&reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await page.getByTestId('recipe-book-toggle').click();
  await expect(page.getByTestId('recipe-book')).toBeVisible();
  await expect(page.getByTestId('recipe-book-kawa')).toBeVisible();
  // 글꼴·이미지가 늦게 올라오면 목록 높이가 아직 0일 수 있다. 측정 전에 배치를 기다린다.
  await expect.poll(() => page.getByTestId('recipe-book-entries')
    .evaluate((node) => node.scrollHeight)).toBeGreaterThan(0);
  const d5Box = await bookBox(page);

  expect(d5Box.height, 'D5 비법노트 높이').toBe(d1Box.height);
  expect(d5Box.width, 'D5 비법노트 폭').toBe(d1Box.width);
  // 종이 원본은 1024×1536(2:3)이다. 늘여 깔지 않도록 패널도 그 비율을 지킨다.
  expect(d5Box.height / d5Box.width).toBeCloseTo(1536 / 1024, 1);
  // 넘치는 내용은 패널이 아니라 목록 안에서 스크롤된다.
  expect(d5Box.entriesScrollable).toBe('auto');
  expect(d5Box.entriesOverflowing, 'D5 목록 넘침').toBe(true);
  expect(d5Box.panelScrolls, '패널 자체 스크롤').toBe(false);
});
