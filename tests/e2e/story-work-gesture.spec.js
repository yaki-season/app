import { expect, test } from '@playwright/test';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY } from '../../src/d1/firstOrderRuntimeStorage.js';
const D = (page, name, ...args) => page.evaluate(({name,args}) => window.__d1GameDebug[name](...args), {name,args});

test('배웅 대화는 사라다를 담는 손을 끊지 않고 놓은 뒤 열린다', async ({ page }) => {
  await page.goto('/public-shell.html');
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({stateVersion:1,dayId:'d6',daySeed:7,customerRandomizationVersion:2})), FIRST_ORDER_RUNTIME_STORAGE_KEY);
  await page.goto('/d1-game.html?day=d6&devUnlock=1');
  await expect.poll(() => D(page,'businessReady')).toBe(true);
  // 경계 fixture: 식사 종료 직전부터 시작한다. 아래 사라다 담기/대화는 실제 입력이다.
  await D(page,'businessAdvance',6000);
  const view=await D(page,'businessView');
  const seat=view.seats.find(s=>s.canOrder);
  await D(page,'businessDispatch',{type:'accept-order',intentId:'gesture:accept',orderId:seat.orderId});
  const order=(await D(page,'businessView')).orders.find(o=>o.orderId===seat.orderId);
  for(const line of order.lines) for(let i=0;i<line.quantity;i++) await D(page,'businessDispatch',{
    type:'serve-item',intentId:`gesture:${line.menuId}:${i}`,customerId:seat.customerId,menuId:line.menuId,seasoning:line.seasoning,quality:'Perfect',
  });
  await page.getByTestId('quicknav-SCR-SVC-INSTANT').click();
  await expect.poll(()=>D(page,'isTransitioning')).toBe(false);
  await D(page,'businessAdvance',13700);
  const button=page.getByTestId('cabbage-salad-prepare');
  const rect=await button.boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  await expect.poll(async()=>(await D(page,'departureCutscene')).pendingIds.length).toBeGreaterThan(0);
  await expect(page.locator('#departureCutscene')).toBeHidden();
  expect(await D(page,'activeScreen')).toBe('SCR-SVC-INSTANT');
  await expect.poll(async()=>(await D(page,'dockItems')).filter(i=>i.menuId==='cabbage-salad').length).toBe(1);
  await page.mouse.up();
  await expect(page.locator('#departureCutscene')).toHaveAttribute('data-beat','departure');
  await expect(page.locator('#departureCutscene')).toBeVisible();
  expect((await D(page,'dockItems')).filter(i=>i.menuId==='cabbage-salad')).toHaveLength(1);
  expect((await D(page,'businessView')).seats.find(s=>s.customerId===seat.customerId)?.phase).toBe('leaving');
  await page.locator('#guestSceneSkip').click();
  await expect.poll(()=>D(page,'activeScreen')).toBe('SCR-SVC-INSTANT');
});
