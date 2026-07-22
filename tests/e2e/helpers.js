// 종단 테스트 공용 헬퍼.
//
// 원칙: 벽시계 고정 대기 대신 **화면 상태를 보고 기다린다**.
// 조리 판정은 실제 경과 시간 기준이라(`GPL-001 §9`), `waitForTimeout(2700)` 같은 고정 대기는
// 머신이 느려 클릭이 지연되면 적정 구간(2.5~5.5초)을 넘겨 `과다`가 된다. 실제로 병렬 실행
// 부하에서 이 방식이 무더기로 실패했다. `QA-001 §예외 및 경계 조건`도 실시간 의존 대신
// 상태 기준을 요구한다.
import { expect } from '@playwright/test';

export const RECIPE = ['chicken', 'leek', 'chicken', 'leek', 'chicken'];

// `main.js`의 대상별 입력 잠금 기본값(UI-001 §상세요구사항 17).
// 같은 재료를 이 시간 안에 다시 누르면 앱이 의도적으로 무시한다.
const INPUT_LOCK_MS = 160;

export async function boot(page) {
  await page.goto('/src/index.html');
  await expect(page.getByTestId('loading-overlay')).toBeHidden({ timeout: 10000 });
  await expect(page.getByTestId('error-overlay')).toBeHidden();
}

export const getState = (page) => page.evaluate(() => window.__yakiDebug.getState());
export const getCustomer = (page) => page.evaluate(() => window.__yakiDebug.getCustomer());

/** 재료를 클릭하고 주문표 칸이 채워질 때까지 기다린다. */
export async function addIngredient(page, ingredient, slotIndex) {
  await page.getByTestId(`ingredient-${ingredient}`).click();
  await expect(page.getByTestId(`order-slot-${slotIndex}`)).toHaveClass(/done/);
}

/**
 * 네기마 5단계를 조립한다.
 *
 * 네기마는 닭·대파가 번갈아 나오므로 같은 재료 사이 간격이 한 클릭뿐이다. 상태 기반 대기는
 * 매우 빨라서(관측 95ms) 입력 잠금 160ms에 걸려 세 번째 재료가 무시된다. 그래서 같은 재료를
 * 다시 누르기 전에 **잠금 잔여 시간만큼만** 기다린다.
 *
 * 이 대기는 조리 시계 대기와 성격이 반대다. 느려지면 오히려 안전하므로 머신 속도에
 * 취약하지 않다.
 */
export async function assembleSkewer(page) {
  const lastClickAt = new Map();

  for (const [i, ingredient] of RECIPE.entries()) {
    const previous = lastClickAt.get(ingredient);
    if (previous !== undefined) {
      const remaining = INPUT_LOCK_MS + 20 - (Date.now() - previous);
      if (remaining > 0) await page.waitForTimeout(remaining);
    }

    await page.getByTestId(`ingredient-${ingredient}`).click();
    lastClickAt.set(ingredient, Date.now());
    await expect(page.getByTestId(`order-slot-${i}`)).toHaveClass(/done/);
  }

  await expect(page.getByTestId('assembled-skewer')).toBeEnabled();
}

/** 조립 완료 꼬치를 그릴에 올린다. */
export async function placeOnGrill(page) {
  await page.getByTestId('assembled-skewer').click();
  await expect(page.getByTestId('screen-grill')).toBeVisible();
  await page.getByTestId('waiting-skewer').click();
  await expect(page.getByTestId('grill-face-badge')).toBeVisible();
}

/**
 * 지정한 면이 적정 구간에 들어갈 때까지 기다렸다 클릭한다.
 *
 * 면을 명시하는 이유: 뒤집은 직후 한 프레임 동안 배지가 아직 `앞면 · 적정`일 수 있는데,
 * 면 없이 `적정`만 기다리면 그 잔상을 보고 즉시 다시 클릭해 뒷면을 건너뛴다.
 */
export async function clickWhenPerfect(page, face /* '앞면' | '뒷면' */) {
  await expect(page.getByTestId('grill-face-badge')).toContainText(`${face} · 적정`, {
    timeout: 15000,
  });
  await page.getByTestId('grill-canvas').click();
}

/** 조립부터 접시에 담기까지. 양면 모두 적정으로 굽는다. */
export async function cookToPlate(page) {
  await assembleSkewer(page);
  await placeOnGrill(page);
  await clickWhenPerfect(page, '앞면');
  await clickWhenPerfect(page, '뒷면');
  await expect(page.getByTestId('screen-counter')).toBeVisible({ timeout: 5000 });
}

/** 접시를 골라 손님에게 낸다. */
export async function serve(page) {
  await page.getByTestId('counter-plate').click();
  await page.getByTestId('order-mat').click();
}

/** 한 주문을 처음부터 끝까지 처리한다. */
export async function cookAndServe(page) {
  await cookToPlate(page);
  await serve(page);
}
