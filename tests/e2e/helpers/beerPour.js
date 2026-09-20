// 생맥주 '완벽' 따르기 입력 헬퍼.
//
// 고정 대기(맥주 2.6초 + 거품 0.6초)는 느린 머신에서 pointermove 전달이 밀린
// 만큼 그대로 초과 주입된다. 판정은 GPL-004 beerRange 2.3~3.7초라 CI에서
// 맥주가 3.7초를 넘겨 beerOk=false로 떨어졌다. 실제 누적량을 읽어 목표 근처
// 에서 구간을 바꾼다.
import { expect } from '@playwright/test';

const BEER_SWITCH_SEC = 2.8; // 목표 3.0, 전환 왕복 지연 여유 0.9초
const FOAM_RELEASE_SEC = 0.8; // 목표 1.0, 손 떼기 지연 여유 0.9초

const drinkState = (page) => page.evaluate(() => window.__d1GameDebug.drinkState());

async function holdUntil(page, field, threshold) {
  await expect
    .poll(async () => (await drinkState(page))[field], { timeout: 20_000, intervals: [40] })
    .toBeGreaterThanOrEqual(threshold);
}

// lever: screenPosOf('drinkLeverDrag') 결과. 잔이 이미 놓여 있어야 한다.
export async function pourPerfectBeer(page, lever) {
  if (!lever) throw new Error('보이지 않는 대상: drinkLeverDrag');
  await page.mouse.move(lever.x, lever.y);
  await page.mouse.down();
  await page.mouse.move(lever.x, lever.y + 60);
  await holdUntil(page, 'beerSec', BEER_SWITCH_SEC);
  await page.mouse.move(lever.x, lever.y - 60);
  await holdUntil(page, 'foamSec', FOAM_RELEASE_SEC);
  await page.mouse.up();
  await expect.poll(() => drinkState(page)).toMatchObject({ beerOk: true, foamOk: true });
}
