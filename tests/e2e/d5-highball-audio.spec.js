// 하이볼 작업대 소리가 실제로 로드되고 조작마다 울리는지 본다.
// 잔 덱은 생맥주와 같은 소리를 공유하고, 따르기 루프는 손을 떼면 함께 멈춰야 한다.
import { expect, test } from '@playwright/test';

const D = (page, name, ...args) => page.evaluate(
  ({ n, v }) => window.__d1GameDebug[n](...v),
  { n: name, v: args },
);

const audioState = (page) => D(page, 'audioState');

async function hold(page, locator, durationMs) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
}

const HIGHBALL_SFX = [
  'SFX-DRINK-ICE-SCOOP',
  'SFX-DRINK-ICE-SETTLE',
  'SFX-DRINK-WHISKEY-POUR',
  'SFX-DRINK-SODA-POUR',
  'SFX-DRINK-BOTTLE-SET',
  'SFX-DRINK-LEMON-DROP',
];

test('하이볼 조작마다 납품된 소리가 울리고 따르기 루프는 손을 떼면 멈춘다', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/src/d1-game.html?day=d5&devUnlock=1&reset=1');
  await expect.poll(() => page.evaluate(() => window.__d1GameDebug?.businessSession?.().ok)).toBe(true);
  await page.mouse.click(10, 10); // 자동재생 잠금 해제
  await D(page, 'requestScreen', 'SCR-SVC-DRINK');
  await expect.poll(() => D(page, 'activeScreen')).toBe('SCR-SVC-DRINK');
  await expect(page.getByTestId('highball-panel')).toHaveClass(/is-art-ready/);

  // 빈 잔은 생맥주 잔 덱과 같은 소리를 쓴다. 하이볼 전용 잔 소리를 따로 두지 않는다.
  await page.getByTestId('highball-glass').click();
  await expect.poll(async () => (await audioState(page)).loaded)
    .toEqual(expect.arrayContaining(['SFX-DRINK-GLASS-SET', 'SFX-DRINK-TRAY-TAP']));

  await page.getByTestId('highball-ice').click();
  await expect.poll(async () => (await audioState(page)).loaded)
    .toEqual(expect.arrayContaining(['SFX-DRINK-ICE-SCOOP', 'SFX-DRINK-ICE-SETTLE']));

  // 병을 누르고 있는 동안 따르기 루프가 돈다.
  const whiskey = page.getByTestId('highball-whiskey');
  const box = await whiskey.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await audioState(page)).loops)
    .toContain('SFX-DRINK-WHISKEY-POUR');
  await page.mouse.up();
  // 손을 떼면 루프가 멈추고 병을 내려놓는 소리가 난다.
  await expect.poll(async () => (await audioState(page)).loops)
    .not.toContain('SFX-DRINK-WHISKEY-POUR');

  await hold(page, page.getByTestId('highball-soda'), 2_600);
  await expect.poll(async () => (await audioState(page)).loops)
    .not.toContain('SFX-DRINK-SODA-POUR');

  await page.getByTestId('highball-lemon').click();
  // 완성 잔 자체를 눌러 픽업대로 보낸다. 이때도 생맥주 잔 덱과 같은 소리가 난다.
  await page.getByTestId('highball-pickup').click();

  const state = await audioState(page);
  // 납품 파일이 하나라도 빠지면 조용히 무음이 된다. 그 상황을 여기서 잡는다.
  expect(state.missing).toEqual([]);
  expect(state.loaded).toEqual(expect.arrayContaining(HIGHBALL_SFX));
});
