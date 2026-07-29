// 프로덕션 영업 화면 디렉터 종단 검증 (SYS-002 v3 §69,71,104 / UI-003 영업 shell).
// 별도 진입점 /src/game.html. 손님·조립·그릴·드링크 독립 화면 전환, 전환 중 상태 보존·조작 잠금,
// 급한 전환 수렴, 그리고 화면을 오가며 도는 조립→그릴→서빙 조리 루프를 검증한다.
import { test, expect } from '@playwright/test';

const st = (p) => p.evaluate(() => window.__prodDebug.getState());
const active = (p) => p.evaluate(() => window.__prodDebug.activeScreen());
const doneness = (p) => p.evaluate(() => window.__prodDebug.doneness());
const transitioning = (p) => p.evaluate(() => window.__prodDebug.isTransitioning());

async function boot(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => active(page)).toBe('SCR-SVC-CUSTOMERS');
  await expect.poll(() => page.evaluate(() => window.__prodDebug.opsReady())).toBe(true);
  return errs;
}

async function goScreen(page, id) {
  await page.evaluate((s) => window.__prodDebug.requestScreen(s), id);
  await expect.poll(() => active(page)).toBe(id);
  await expect.poll(() => transitioning(page)).toBe(false);
}

async function click(page, key) {
  const pos = await page.evaluate((k) => window.__prodDebug.screenPosOf(k), key);
  if (!pos) throw new Error(`보이지 않는 대상: ${key}`);
  await page.mouse.click(pos.x, pos.y);
}

async function assembleOnScreen(page) {
  await goScreen(page, 'SCR-SVC-ASSEMBLY');
  const recipe = ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken'];
  for (let i = 0; i < recipe.length; i++) {
    await click(page, recipe[i]);
    await expect.poll(() => st(page).then((s) => s.assemblyIndex)).toBe(i + 1);
    await page.waitForTimeout(230); // 대상별 입력 잠금
  }
  await click(page, 'jigSkewer'); // 그릴로 올림
  await expect.poll(() => st(page).then((s) => s.process)).toBe('grill');
}

test('4개 독립 화면을 좌·우/퀵/키보드로 전환하고 svc.station이 갱신된다', async ({ page }) => {
  const errs = await boot(page);
  await expect(page.getByTestId('svc-station')).toHaveText('손님');

  // 퀵 전환
  await page.getByTestId('quicknav-SCR-SVC-GRILL').click();
  await expect.poll(() => active(page)).toBe('SCR-SVC-GRILL');
  await expect(page.getByTestId('svc-station')).toHaveText('그릴');

  // 좌·우 인접
  await page.getByTestId('nav-left').click();
  await expect.poll(() => active(page)).toBe('SCR-SVC-ASSEMBLY');
  await page.getByTestId('nav-right').click();
  await expect.poll(() => active(page)).toBe('SCR-SVC-GRILL');

  // 키보드
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => active(page)).toBe('SCR-SVC-DRINK');
  await expect(page.getByTestId('nav-right')).toBeDisabled(); // 마지막 화면

  expect(errs).toEqual([]);
});

test('급한 연속 전환은 마지막 화면으로 수렴한다 (§104)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__prodDebug.requestScreen('SCR-SVC-ASSEMBLY');
    window.__prodDebug.requestScreen('SCR-SVC-GRILL');
    window.__prodDebug.requestScreen('SCR-SVC-DRINK');
  });
  await expect.poll(() => active(page)).toBe('SCR-SVC-DRINK');
  await expect.poll(() => transitioning(page)).toBe(false);
  expect(await active(page)).toBe('SCR-SVC-DRINK');
});

test('전환 중에는 조작이 잠긴다 (§71)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.requestScreen('SCR-SVC-GRILL'));
  // 요청 직후 전환 중 → 잠금
  expect(await page.evaluate(() => window.__prodDebug.controlsLocked())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__prodDebug.controlsLocked())).toBe(false);
});

test('화면을 오가도 굽던 상태가 보존된다 (§71)', async ({ page }) => {
  await boot(page);
  await assembleOnScreen(page);
  await goScreen(page, 'SCR-SVC-GRILL');
  await click(page, 'grillSkewer'); // 굽기 시작
  await expect.poll(() => st(page).then((s) => s.status)).toBe('grillFront');

  // 손님 화면 갔다가 돌아온다
  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  await page.waitForTimeout(600);
  await goScreen(page, 'SCR-SVC-GRILL');

  // 여전히 앞면 굽는 중이고 익힘이 진행됐다
  expect((await st(page)).status).toBe('grillFront');
  const elapsed = await page.evaluate(() => window.__prodDebug.getState().faceStartAtMs);
  expect(elapsed).not.toBeNull();
});

const dockCount = (p) => p.evaluate(() => window.__prodDebug.dockItems().length);
const seatMood = (p, id) => p.evaluate((s) => window.__prodDebug.seatStates().find((x) => x.seatId === s).mood, id);

test('그릴 대기 꼬치는 이전 꼬치의 익힘이 남지 않고 날것으로 보인다', async ({ page }) => {
  await boot(page);
  await expect.poll(() => page.evaluate(() => !!window.__prodDebug.grillMaterial())).toBe(true);
  await assembleOnScreen(page); // 조립 완료 → 그릴 대기 꼬치(굽기 전)
  await goScreen(page, 'SCR-SVC-GRILL');
  // 이전 꼬치가 남긴 익힘을 흉내 내 셰이더를 익은 상태로 오염시킨다.
  await page.evaluate(() => window.__prodDebug.grillMaterial().setDoneness(0.5));
  await page.waitForTimeout(120); // 몇 프레임 뒤
  const d = await page.evaluate(() => window.__prodDebug.grillMaterial().uniforms.uDoneness.value);
  expect(d).toBeLessThan(0.05); // 날것으로 리셋됨
});

test('화면을 오가며 조립→그릴→선반→좌석 서빙 루프가 돈다', async ({ page }) => {
  const errs = await boot(page);
  await assembleOnScreen(page);

  await goScreen(page, 'SCR-SVC-GRILL');
  await click(page, 'grillSkewer'); // 앞면 굽기 시작
  await expect.poll(() => st(page).then((s) => s.status)).toBe('grillFront');
  await expect.poll(() => doneness(page), { timeout: 20000 }).toBe('perfect');
  await click(page, 'grillSkewer'); // 뒤집기
  await expect.poll(() => st(page).then((s) => s.status)).toBe('grillBack');
  await expect.poll(() => doneness(page), { timeout: 20000 }).toBe('perfect');
  await click(page, 'grillSkewer'); // 회수 → 완성품이 선반으로, 조리는 다음 job으로 리셋

  await expect.poll(() => dockCount(page)).toBe(1);
  await expect.poll(() => st(page).then((s) => s.process)).toBe('assembly');

  // 손님 화면으로 가 네기마 손님을 앉히고 주문 받은 뒤 선반 완성품을 낸다
  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(false); window.__prodDebug.forceSpawn('seat-03', 'solo', 0); });
  await expect.poll(() => page.evaluate(() => window.__prodDebug.seatViews().find((v) => v.seatId === 'seat-03').phase)).toBe('ordering');
  await click(page, 'seatServe:seat-03'); // 주문 접수
  await expect.poll(() => page.evaluate(() => window.__prodDebug.seatViews().find((v) => v.seatId === 'seat-03').canServe)).toBe(true);
  await page.waitForTimeout(230); // 대상별 입력 잠금 이후
  await click(page, 'seatServe:seat-03'); // 제공
  await expect.poll(() => dockCount(page)).toBe(0); // 선반에서 소비됨
  await expect.poll(() => seatMood(page, 'seat-03')).toBe('satisfied');
  expect(errs).toEqual([]);
});
