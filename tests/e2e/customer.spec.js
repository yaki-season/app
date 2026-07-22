// GPL-002 손님 상태와 유형 — 런타임 검증.
// 단위 테스트가 상태 머신을 검증한다면, 여기서는 실제 앱에서 손님 생명주기와
// 다중 슬롯 재주문이 조리 흐름과 맞물려 도는지 확인한다.
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/src/index.html');
  await expect(page.getByTestId('loading-overlay')).toBeHidden({ timeout: 10000 });
  await expect(page.getByTestId('error-overlay')).toBeHidden();
}

const getCustomer = (page) => page.evaluate(() => window.__yakiDebug.getCustomer());

// 꼬치 하나를 조립·굽기·서빙까지 끝낸다
async function cookAndServe(page) {
  for (const ing of ['chicken', 'leek', 'chicken', 'leek', 'chicken']) {
    await page.getByTestId(`ingredient-${ing}`).click();
    await page.waitForTimeout(200);
  }
  await page.getByTestId('assembled-skewer').click();
  await expect(page.getByTestId('screen-grill')).toBeVisible();
  await page.getByTestId('waiting-skewer').click();

  await page.waitForTimeout(2700); // 앞면 적정
  await page.getByTestId('grill-canvas').click();
  await page.waitForTimeout(2700); // 뒷면 적정
  await page.getByTestId('grill-canvas').click();

  await expect(page.getByTestId('screen-counter')).toBeVisible({ timeout: 2000 });
  await page.getByTestId('counter-plate').click();
  await page.getByTestId('order-mat').click();
}

test('손님이 입장→주문→대기 상태를 거치고 인내심 게이지가 표시된다', async ({ page }) => {
  await boot(page);

  // 입장 직후에는 아직 주문 전이다
  const first = await getCustomer(page);
  expect(['entering', 'ordering']).toContain(first.state);
  expect(first.type).toBe('solo');

  // 잠시 뒤 대기 상태가 되고 인내심 게이지가 보인다
  await expect(page.getByTestId('patience-gauge')).toBeVisible({ timeout: 5000 });
  const waiting = await getCustomer(page);
  expect(waiting.state).toBe('waiting');
  expect(waiting.patienceEnabled).toBe(false);
});

test('인내심 게이지는 시간이 지나도 줄지 않는다', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('patience-gauge')).toBeVisible({ timeout: 5000 });

  const widthOf = () => page.getByTestId('patience-fill').evaluate((n) => n.style.width);
  const before = await widthOf();
  await page.waitForTimeout(3000);
  const after = await widthOf();

  expect(before).toBe('100%');
  expect(after).toBe('100%');
  expect((await getCustomer(page)).state).toBe('waiting'); // 시간 초과 퇴장 없음
});

test('서빙하면 손님이 판정하고 반응한다', async ({ page }) => {
  await boot(page);
  await cookAndServe(page);

  await expect(page.getByTestId('result-overlay')).toBeVisible({ timeout: 5000 });
  const served = await getCustomer(page);
  expect(served.satisfaction).toBe('good');
  expect(served.mood).toBe('happy');
  expect(served.tip).toBeGreaterThan(0);
  await expect(page.getByTestId('customer')).toHaveClass(/happy/);
});

test('퇴근직장인은 재주문으로 꼬치를 두 번 요구한다', async ({ page }) => {
  test.setTimeout(120000); // 꼬치 3개를 실제로 구우므로 넉넉히 잡는다
  await boot(page);

  // 첫 손님(혼술족)을 마치고 재시작하면 다음 유형인 퇴근직장인이 온다
  await cookAndServe(page);
  await expect(page.getByTestId('result-overlay')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('restart-button').click();

  const office = await getCustomer(page);
  expect(office.type).toBe('office');
  // 드링크 스테이션이 없어 음료 슬롯이 빠진 [꼬치, 꼬치] (GPL-002 §예외)
  expect(office.orderSequence).toEqual(['skewer', 'skewer']);

  // 첫 꼬치 서빙 — 결과를 띄우지 않고 재주문으로 이어져야 한다
  await cookAndServe(page);
  await page.waitForTimeout(2500); // 식사(1.5s) → 재주문

  const midway = await getCustomer(page);
  expect(midway.slotIndex).toBe(1);
  expect(midway.results).toHaveLength(1);
  await expect(page.getByTestId('result-overlay')).toBeHidden();
  // 조리만 초기화되어 다음 꼬치를 만들 수 있다
  await expect(page.getByTestId('screen-assembly')).toBeVisible();

  // 두 번째 꼬치 서빙 — 이제 모든 슬롯이 끝나 결과가 나온다
  await cookAndServe(page);
  await expect(page.getByTestId('result-overlay')).toBeVisible({ timeout: 5000 });

  const done = await getCustomer(page);
  expect(done.results).toHaveLength(2);
  expect(['leaving', 'done']).toContain(done.state);
});
