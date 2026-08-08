import { expect, test } from '@playwright/test';

const D = (page, fn, ...args) => page.evaluate(
  ({ name, values }) => window.__d1GameDebug[name](...values),
  { name: fn, values: args },
);

test('prepared food and drinks use separate visible pickup zones', async ({ page }) => {
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => page.evaluate(() => typeof window.__d1GameDebug?.dockAdd)).toBe('function');

  const foodId = await D(page, 'dockAdd', { menu: '\uB124\uAE30\uB9C8', label: 'Perfect', good: true });
  const drinkId = await D(page, 'dockAdd', { menu: '\uC0DD\uB9E5\uC8FC', label: 'Good', good: true });

  const shelf = page.getByTestId('dock-shelf');
  const foodZone = page.getByTestId('dock-zone-food');
  const drinkZone = page.getByTestId('dock-zone-drink');
  const foodCard = page.getByTestId(`dock-item-${foodId}`);
  const drinkCard = page.getByTestId(`dock-item-${drinkId}`);

  await expect(shelf).toBeVisible();
  await expect(foodZone).toContainText('\uB124\uAE30\uB9C8');
  await expect(foodZone).not.toContainText('\uC0DD\uB9E5\uC8FC');
  await expect(drinkZone).toContainText('\uC0DD\uB9E5\uC8FC');
  await expect(drinkZone).not.toContainText('\uB124\uAE30\uB9C8');
  await expect(foodCard).toHaveAttribute('data-prepared-zone', 'food');
  await expect(drinkCard).toHaveAttribute('data-prepared-zone', 'drink');
  await expect(foodCard.locator('.dock-item-art--food')).toBeVisible();
  await expect(drinkCard.locator('.dock-item-art--drink')).toBeVisible();
  await expect(foodCard.locator('.dock-item-art--food')).toHaveCSS(
    'background-image',
    /order-icon-negima-r1-b1\.png/,
  );
  await expect(drinkCard.locator('.dock-item-art--drink')).toHaveCSS(
    'background-image',
    /order-icon-draft-beer-r1-b1\.png/,
  );
  const zoneBackgrounds = await Promise.all([
    foodZone.evaluate((node) => getComputedStyle(node).backgroundImage),
    drinkZone.evaluate((node) => getComputedStyle(node).backgroundImage),
  ]);
  for (const background of zoneBackgrounds) {
    expect(background).not.toContain('radial-gradient');
    expect(background).not.toContain('st-service-counter');
  }

  const [foodBox, drinkBox] = await Promise.all([foodZone.boundingBox(), drinkZone.boundingBox()]);
  expect(foodBox).not.toBeNull();
  expect(drinkBox).not.toBeNull();
  expect(foodBox.x + foodBox.width).toBeLessThanOrEqual(drinkBox.x + 1);

  await drinkCard.click();
  await expect.poll(() => D(page, 'dockSelectedId')).toBe(drinkId);
});
