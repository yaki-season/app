// 양배추 사라다 준비 입력 헬퍼.
//
// 홀드 임계는 2.5초지만 완성 판정은 rAF 틱 안에서만 일어난다(instantServiceStation.tick).
// 느린 머신에서 프레임이 밀리면 고정 2.7초 홀드가 마지막 틱을 놓쳐 release()가 빈손으로
// 끝난다. 실제로 완성품이 선반에 오를 때까지 누르고 있는다.
import { expect } from '@playwright/test';

const saladCount = (page) => page.evaluate(
  () => window.__d1GameDebug.dockItems().filter((item) => item.menuId === 'cabbage-salad').length,
);

export async function prepareCabbageSalad(page, button) {
  const before = await saladCount(page);
  // 화면 전환 직후에는 버튼이 아직 레이아웃에 없어 boundingBox()가 null을 준다.
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box, '사라다 준비 버튼의 누르기 영역').toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect
      .poll(() => saladCount(page), { timeout: 20_000, intervals: [50] })
      .toBeGreaterThan(before);
  } finally {
    await page.mouse.up();
  }
}
