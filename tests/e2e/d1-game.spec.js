// D1 첫 주문 2.5D 플레이 종단 검증. game.html과 같은 조작 모델(스테이션 전환·화면 오브젝트 레이캐스트
// 클릭·실시간 조리)로 단일 손님을 접수→조리→서빙→반응까지 플레이한다. 손님 화면은 승인 D1 아트,
// 조립·그릴·드링크는 더미. 세 화면 아트 레이어가 실제 로드되는지(textureErrors)도 확인한다.
import { test, expect } from '@playwright/test';

const D = (page, fn, ...a) => page.evaluate(({ f, args }) => window.__d1GameDebug[f](...args), { f: fn, args: a });
const active = (page) => D(page, 'activeScreen');

async function boot(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('/src/d1-game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => D(page, 'texturesReady')).toBe(true);
  return errs;
}
async function goScreen(page, id) {
  await D(page, 'requestScreen', id);
  await expect.poll(() => active(page)).toBe(id);
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
}
async function clickObj(page, key) {
  const pos = await D(page, 'screenPosOf', key);
  if (!pos) throw new Error(`보이지 않는 대상: ${key}`);
  await page.mouse.click(pos.x, pos.y);
}

test('세 손님 아트 레이어가 실제로 로드된다(더미 스테이션과 공존)', async ({ page }) => {
  await boot(page);
  expect(await D(page, 'texturesReady')).toBe(true);
  expect(await page.evaluate(() => window.__d1GameDebug.renderer.textureErrors())).toBe(0);
});

test('스테이션을 좌·우/퀵/키보드로 전환한다', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('svc-station')).toHaveText('손님');
  await page.getByTestId('quicknav-SCR-SVC-GRILL').click();
  await expect.poll(() => active(page)).toBe('SCR-SVC-GRILL');
  await expect(page.getByTestId('svc-station')).toHaveText('그릴');
  await page.getByTestId('nav-left').click();
  await expect.poll(() => active(page)).toBe('SCR-SVC-ASSEMBLY');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => active(page)).toBe('SCR-SVC-GRILL');
});

test('접수→조립·그릴로 네기마 제작(화면 클릭)→생맥주→서빙→반응 완료', async ({ page }) => {
  const errs = await boot(page);

  // 손님 접수 (손님 히트존 클릭)
  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  await clickObj(page, 'custServe');
  await expect.poll(() => D(page, 'custPhase')).toBe('ordered');

  // 조립: 닭·파·닭·파·닭 (화면 클릭, 대상별 입력 잠금 230ms)
  await goScreen(page, 'SCR-SVC-ASSEMBLY');
  for (const k of ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken']) {
    await clickObj(page, k);
    await page.waitForTimeout(230);
  }
  await expect.poll(() => D(page, 'cookWaiting')).toBe(1);

  // 그릴: 대기 꼬치를 칸에 올리고 앞·뒤 굽고 회수 → 선반
  await goScreen(page, 'SCR-SVC-GRILL');
  await clickObj(page, 'grillWaitTray');
  await expect.poll(() => D(page, 'cookSlots').then((s) => s[0].status)).toBe('front');
  await D(page, 'cookElapse', 8);
  await clickObj(page, 'grillSlot0'); // 뒤집기
  await expect.poll(() => D(page, 'cookSlots').then((s) => s[0].status)).toBe('back');
  await page.waitForTimeout(230);
  await D(page, 'cookElapse', 8);
  await clickObj(page, 'grillSlot0'); // 회수
  await expect.poll(() => D(page, 'dockItems').then((d) => d.filter((x) => x.menu === '네기마').length)).toBe(1);

  // 남은 네기마 2개 + 생맥주 1개는 결정론적으로 선반에 적재(조리 반복 대신)
  await D(page, 'dockAdd', { menu: '네기마', label: '좋음', good: true });
  await D(page, 'dockAdd', { menu: '네기마', label: '좋음', good: true });
  await D(page, 'dockAdd', { menu: '생맥주', label: 'Perfect', good: true });

  // 서빙: 손님 화면에서 생맥주부터 (선반에서 골라 손님 클릭)
  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  const beer = (await D(page, 'dockItems')).find((x) => x.menu === '생맥주');
  await D(page, 'dockSelect', beer.id);
  await clickObj(page, 'custServe');
  await expect.poll(() => D(page, 'order').then((o) => o['생맥주'].done)).toBe(1);
  await expect.poll(() => D(page, 'customerArt')).toContain('partial-beer');

  // 네기마 3개 서빙
  for (let i = 0; i < 3; i += 1) {
    const ng = (await D(page, 'dockItems')).find((x) => x.menu === '네기마');
    await D(page, 'dockSelect', ng.id);
    await page.waitForTimeout(230);
    await clickObj(page, 'custServe');
  }
  await expect.poll(() => D(page, 'order').then((o) => o['네기마'].done)).toBe(3);

  // 반응 → 완료 오버레이
  await expect.poll(() => D(page, 'custPhase'), { timeout: 4000 }).toBe('complete');
  await expect(page.getByTestId('result-overlay')).toBeVisible();
  await expect(page.getByTestId('result-message')).toContainText('완료');
  expect(errs).toEqual([]);
});
