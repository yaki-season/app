// 프로덕션 영업 화면 디렉터 종단 검증 (SYS-002 v3 §69,71,104 / UI-003 영업 shell).
// 별도 진입점 /src/game.html. 화면 전환·상태 보존·조작 잠금·수렴, 그리고 멀티 잡 조리
// (조립 병렬 + 그릴 다중 칸) → 선반 → 좌석 서빙 루프를 검증한다.
import { test, expect } from '@playwright/test';

const active = (p) => p.evaluate(() => window.__prodDebug.activeScreen());
const transitioning = (p) => p.evaluate(() => window.__prodDebug.isTransitioning());
const waiting = (p) => p.evaluate(() => window.__prodDebug.cookWaiting());
const slots = (p) => p.evaluate(() => window.__prodDebug.cookSlots());
const dockCount = (p) => p.evaluate(() => window.__prodDebug.dockItems().length);
const seatMood = (p, id) => p.evaluate((s) => window.__prodDebug.seatStates().find((x) => x.seatId === s).mood, id);

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
// 조립대에서 재료 5개를 클릭해 꼬치 하나를 완성(대기 트레이로).
async function assembleOne(page) {
  await goScreen(page, 'SCR-SVC-ASSEMBLY');
  const before = await waiting(page);
  for (const k of ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken']) {
    await click(page, k);
    await page.waitForTimeout(230); // 대상별 입력 잠금
  }
  await expect.poll(() => waiting(page)).toBe(before + 1);
}
async function startInitialBatch(page) {
  await page.evaluate(() => {
    for (let index = 0; index < 3; index += 1) window.__prodDebug.cookFillAssembly();
  });
  await goScreen(page, 'SCR-SVC-GRILL');
  for (let index = 0; index < 3; index += 1) {
    await click(page, 'grillWaitTray');
    await page.waitForTimeout(230);
  }
  await expect.poll(() => slots(page).then((state) => state.slice(0, 3).every((slot) => slot.cooking))).toBe(true);
}

test('4개 독립 화면을 좌·우/퀵/키보드로 전환하고 svc.station이 갱신된다', async ({ page }) => {
  const errs = await boot(page);
  await expect(page.getByTestId('svc-station')).toHaveText('손님');
  await page.getByTestId('quicknav-SCR-SVC-GRILL').click();
  await expect.poll(() => active(page)).toBe('SCR-SVC-GRILL');
  await expect(page.getByTestId('svc-station')).toHaveText('그릴');
  await page.getByTestId('nav-left').click();
  await expect.poll(() => active(page)).toBe('SCR-SVC-ASSEMBLY');
  await page.getByTestId('nav-right').click();
  await expect.poll(() => active(page)).toBe('SCR-SVC-GRILL');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => active(page)).toBe('SCR-SVC-DRINK');
  await expect(page.getByTestId('nav-right')).toBeDisabled();
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
});

test('전환 중에는 조작이 잠긴다 (§71)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__prodDebug.requestScreen('SCR-SVC-GRILL'));
  expect(await page.evaluate(() => window.__prodDebug.controlsLocked())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__prodDebug.controlsLocked())).toBe(false);
});

test('굽는 동안 다음 꼬치를 조립할 수 있다 (조립·그릴 독립)', async ({ page }) => {
  await boot(page);
  await startInitialBatch(page);
  await expect.poll(() => waiting(page)).toBe(0);
  // 굽는 동안 조립대로 가 또 하나 조립
  await assembleOne(page);
  expect(await waiting(page)).toBe(1);
});

test('화면을 오가도 굽던 칸 상태가 보존된다 (§71)', async ({ page }) => {
  await boot(page);
  await startInitialBatch(page);
  const e1 = (await slots(page))[0].faceElapsedSec;
  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  await page.waitForTimeout(500);
  await goScreen(page, 'SCR-SVC-GRILL');
  const e2 = (await slots(page))[0].faceElapsedSec;
  expect((await slots(page))[0].cooking).toBe(true);
  expect(e2).toBeGreaterThan(e1); // 화면을 떠나도 타이머는 계속 흐른다
});

test('그릴 칸은 이전 꼬치의 익힘이 남지 않고 날것으로 리셋된다', async ({ page }) => {
  await boot(page);
  await expect.poll(() => page.evaluate(() => !!window.__prodDebug.grillMaterial(0))).toBe(true);
  await goScreen(page, 'SCR-SVC-GRILL');
  await page.evaluate(() => window.__prodDebug.grillMaterial(0).setDoneness(0.5)); // 오염
  await expect.poll(
    () => page.evaluate(() => window.__prodDebug.grillMaterial(0).uniforms.uDoneness.value),
  ).toBeLessThan(0.05); // 굽지 않는 칸은 다음 렌더 프레임에 날것
});

test('조립→그릴(앞·뒤)→선반→좌석 서빙 루프가 돈다', async ({ page }) => {
  const errs = await boot(page);
  await startInitialBatch(page);
  await expect.poll(() => slots(page).then((s) => s[0].status)).toBe('front');

  await page.evaluate(() => window.__prodDebug.cookElapse(8)); // 앞면 적정
  await click(page, 'grillSlot0'); // 뒤집기
  await expect.poll(() => slots(page).then((s) => s[0].status)).toBe('back');
  await page.waitForTimeout(230); // 대상별 입력 잠금 이후
  await page.evaluate(() => window.__prodDebug.cookElapse(8)); // 뒷면 적정
  await click(page, 'grillSlot0'); // 회수 → 선반
  await expect.poll(() => dockCount(page)).toBe(1);
  await expect.poll(() => slots(page).then((s) => s[0].status)).toBe('empty');

  await goScreen(page, 'SCR-SVC-CUSTOMERS');
  await page.evaluate(() => { window.__prodDebug.opsAutoSpawn(false); window.__prodDebug.forceSpawn('seat-03', 'solo', 0); });
  await expect.poll(() => page.evaluate(() => window.__prodDebug.seatViews().find((v) => v.seatId === 'seat-03').phase)).toBe('ordering');
  await click(page, 'seatServe:seat-03'); // 접수
  await expect.poll(() => page.evaluate(() => window.__prodDebug.seatViews().find((v) => v.seatId === 'seat-03').canServe)).toBe(true);
  await page.waitForTimeout(230);
  await click(page, 'seatServe:seat-03'); // 제공
  await expect.poll(() => dockCount(page)).toBe(0);
  await expect.poll(() => seatMood(page, 'seat-03')).toBe('satisfied');
  expect(errs).toEqual([]);
});
