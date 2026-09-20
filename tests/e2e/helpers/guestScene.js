// 손님 이야기 장면(도착·배웅)을 닫는 공통 헬퍼.
//
// 이야기 중에는 영업이 멈추고 모달이 화면을 덮어 퀵내비·선반 카드 클릭이
// 모두 막힌다. 접수·화면 전환처럼 장면이 끼어들 수 있는 지점에서 이걸 먼저 부른다.
export async function settleGuestScene(page) {
  for (let i = 0; i < 64; i += 1) {
    const story = await page.evaluate(() => window.__d1GameDebug?.departureCutscene?.() ?? null);
    if (!story || (!story.active && !(story.pendingIds ?? []).length)) return;
    const skip = page.locator('#guestSceneSkip');
    if (await skip.isVisible()) {
      await skip.click();
      continue;
    }
    const next = page.locator('#departureCutsceneContinue');
    if (await next.isVisible()) {
      await next.click();
      continue;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('손님 이야기 장면이 닫히지 않았습니다');
}
