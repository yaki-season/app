import { test, expect } from '@playwright/test';
const D = (page, name, ...args) => page.evaluate(({ name, args }) => window.__d1GameDebug[name](...args), { name, args });

async function dispatch(page, type, fields) {
  expect(await D(page, 'businessDispatch', { type, intentId: `${type}:${JSON.stringify(fields)}`, ...fields })).toMatchObject({ ok: true });
}
async function pairBoundary(page) {
  await page.goto('/d1-game.html');
  await expect.poll(() => D(page, 'businessReady')).toBe(true);
  // 경계 fixture: 선행 주문만 완료해 두고, 렌·미오의 주문 접수부터는 실제 UI를 검증한다.
  await D(page, 'businessAdvance', 6000);
  await dispatch(page, 'accept-order', { orderId: 'D1-ORDER-001' });
  for (const [index, menuId] of ['beer', 'negima', 'negima'].entries())
    await dispatch(page, 'serve-item', { customerId: 'REGULAR_TSUKIOKA', menuId, quality: 'Perfect', index });
  await D(page, 'businessAdvance', 16000);
  const first = (await D(page, 'businessView')).seats.find(s => s.cleanupNeeded);
  await dispatch(page, 'begin-cleanup', { seatId: first.seatId });
  await D(page, 'businessAdvance', 3000);
  await D(page, 'businessAdvanceTo', 100000);
  await D(page, 'businessAdvance', 6000);
  return (await D(page, 'businessView')).seats.filter(s => s.customerId?.includes('OFFICE'));
}

test('접수 전 메뉴를 감추고 두 손님의 인사·배웅 대기열을 새로고침해 이어 읽는다', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const pair = await pairBoundary(page);
  expect(pair).toHaveLength(2);
  for (const seat of pair) {
    expect(seat.orderLabel).toBe('');
    expect(seat.remainingItems).toEqual([]);
    const bubble = page.getByTestId(`bubble-${seat.seatId}`);
    await expect(bubble).not.toContainText(/네기마|생맥주/);
    await expect(page.getByTestId(`serve-target-${seat.seatId}`)).not.toHaveAttribute('aria-label', /네기마|생맥주/);
  }
  expect((await D(page, 'businessView')).orders.filter(o => o.status === 'unaccepted').every(o => o.lines.length === 0)).toBe(true);
  await page.getByTestId(`serve-target-${pair[0].seatId}`).click();
  await expect(page.locator('#departureCutscene')).toHaveAttribute('data-scene-id', 'SCN-D1-REN-ARRIVAL');
  expect((await D(page, 'departureCutscene')).pendingIds).toEqual(['SCN-D1-MIO-ARRIVAL']);
  for (const seat of pair) {
    expect((await D(page, 'businessView')).seats.find(s => s.seatId === seat.seatId).orderLabel).toContain('네기마');
    expect(await page.evaluate(id => window.__d1GameDebug.renderer.seatActorMesh[id].visible, seat.seatId)).toBe(true);
  }
  await page.locator('#departureCutsceneContinue').click();
  const line = await page.locator('#departureCutsceneLine').textContent();
  const occupiedBeforeReload = (await D(page, 'customerRenderSnapshot')).filter(seat => seat.customerId);
  await page.reload(); await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await expect(page.locator('#departureCutsceneLine')).toHaveText(line);
  const occupiedAfterReload = (await D(page, 'customerRenderSnapshot')).filter(seat => seat.customerId);
  expect(occupiedAfterReload.map(({seatId,customerId,anchor})=>({seatId,customerId,x:anchor.x})))
    .toEqual(occupiedBeforeReload.map(({seatId,customerId,anchor})=>({seatId,customerId,x:anchor.x})));
  expect((await D(page, 'departureCutscene')).pendingIds).toEqual(['SCN-D1-MIO-ARRIVAL']);
  await page.locator('#guestSceneSkip').click();
  await expect(page.locator('#departureCutscene')).toHaveAttribute('data-scene-id', 'SCN-D1-MIO-ARRIVAL');
  await expect(page.locator('#departureCutsceneSpeaker')).toHaveText('이시다 미오');
  const frozen = (await D(page, 'businessView')).clock.elapsedMs;
  await page.waitForTimeout(400);
  expect((await D(page, 'businessView')).clock.elapsedMs).toBe(frozen);
  await page.screenshot({ path: test.info().outputPath('mio-and-ren-arrival.png') });
  await page.locator('#guestSceneSkip').click();
  await expect(page.locator('#departureCutscene')).toBeHidden();

  // 동시 식사 완료 경계 fixture. 음식 주입은 이 대기열 테스트에만 한정한다.
  for (const seat of pair) for (const menuId of ['beer', 'negima'])
    await dispatch(page, 'serve-item', { customerId: seat.customerId, menuId, quality: 'Perfect' });
  await D(page, 'businessAdvanceWithCutscene', 15010);
  await expect(page.locator('#departureCutscene')).toHaveAttribute('data-scene-id', 'SCN-D1-REN-DEPARTURE');
  expect((await D(page, 'departureCutscene')).pendingIds).toEqual(['SCN-D1-MIO-DEPARTURE']);
  await page.reload(); await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await page.locator('#guestSceneSkip').click();
  await expect(page.locator('#departureCutscene')).toHaveAttribute('data-scene-id', 'SCN-D1-MIO-DEPARTURE');
  expect((await D(page, 'runtimeSuspension')).paused).toBe(true);
  await page.locator('#guestSceneSkip').click();
  expect((await D(page, 'runtimeSuspension')).paused).toBe(false);
  await page.locator('#guestJournalToggle').click();
  await expect(page.locator('#guestJournalEntries [data-guest-key="ren"]')).toContainText('게임');
  await expect(page.locator('#guestJournalEntries [data-guest-key="mio"]')).toContainText('휴대폰');
  await page.keyboard.press('Escape');
  await page.reload(); await expect.poll(() => D(page, 'businessReady')).toBe(true);
  await expect(page.locator('#departureCutscene')).toBeHidden();
  expect(errors).toEqual([]);
});

for (const day of ['d2', 'd3', 'd4', 'd5']) {
  test(`${day} 렌·미오의 실제 접수 대사·양념·공유 식사 배웅`, async ({ page }) => {
    test.setTimeout(60000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // 날짜/선행 파동은 fixture로 격리하고 대상 인물의 접수·대화는 일반 버튼으로 진행한다.
    await page.goto(`/d1-game.html?day=${day}&devUnlock=1&reset=1`);
    await expect.poll(() => D(page, 'businessReady')).toBe(true);
    let sequence = 0, pair = [];
    const command = async (type, fields) => {
      const result = await D(page, 'businessDispatch', { type, intentId: `boundary:${sequence++}`, ...fields });
      expect(result.ok).toBe(true);
    };
    for (let wave = 0; wave < 18; wave++) {
      await D(page, 'businessAdvance', 6000);
      let view = await D(page, 'businessView');
      pair = view.seats.filter(s => [`${day.toUpperCase()}-OFFICE-A`, `${day.toUpperCase()}-OFFICE-B`].includes(s.customerId));
      if (pair.length === 2 && pair.every(s => s.canOrder)) break;
      for (const seat of view.seats.filter(s => s.canOrder)) await command('accept-order', { orderId: seat.orderId });
      view = await D(page, 'businessView');
      for (const order of view.orders.filter(o => ['accepted', 'partial'].includes(o.status)))
        for (const line of order.lines) for (let n = 0; n < line.remaining; n++)
          await command('serve-item', { customerId: order.customerId, menuId: line.menuId, seasoning: line.seasoning, quality: 'Perfect' });
      await D(page, 'businessAdvance', 20000);
      for (const seat of (await D(page, 'businessView')).seats.filter(s => s.cleanupNeeded))
        await command('begin-cleanup', { seatId: seat.seatId });
      await D(page, 'businessAdvance', 4000);
    }
    expect(pair).toHaveLength(2);
    expect(pair.every(s => s.canOrder)).toBe(true);
    await page.getByTestId(`serve-target-${pair[0].seatId}`).click();
    const arrivals = new Map();
    for (let i = 0; i < 16 && await page.locator('#departureCutscene').isVisible(); i++) {
      const id = await page.locator('#departureCutscene').getAttribute('data-scene-id');
      arrivals.set(id, (arrivals.get(id) ?? '') + await page.locator('#departureCutsceneLine').textContent());
      await page.locator('#departureCutsceneContinue').click();
    }
    expect([...arrivals.keys()].sort()).toEqual([`SCN-${day.toUpperCase()}-MIO-ARRIVAL`, `SCN-${day.toUpperCase()}-REN-ARRIVAL`]);
    const view = await D(page, 'businessView');
    for (const [index, key] of ['ren', 'mio'].entries()) {
      const customerId = `${day.toUpperCase()}-OFFICE-${index ? 'B' : 'A'}`;
      const seat = view.seats.find(s => s.customerId === customerId);
      const order = view.orders.find(o => o.orderId === seat.orderId);
      for (const line of order.lines) expect(arrivals.get(`SCN-${day.toUpperCase()}-${key.toUpperCase()}-ARRIVAL`)).toContain(line.menuLabel);
    }
    for (const order of view.orders.filter(o => pair.some(s => s.orderId === o.orderId)))
      for (const line of order.lines) for (let n = 0; n < line.remaining; n++)
        await command('serve-item', { customerId: order.customerId, menuId: line.menuId, seasoning: line.seasoning, quality: 'Perfect' });
    await D(page, 'businessAdvanceWithCutscene', 15010);
    const departures = [];
    for (let i = 0; i < 2; i++) {
      await expect(page.locator('#departureCutscene')).toBeVisible();
      departures.push(await page.locator('#departureCutscene').getAttribute('data-scene-id'));
      await page.locator('#guestSceneSkip').click();
    }
    expect(departures.sort()).toEqual([`SCN-${day.toUpperCase()}-MIO-DEPARTURE`, `SCN-${day.toUpperCase()}-REN-DEPARTURE`]);
    expect(errors).toEqual([]);
  });
}
