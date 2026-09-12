import { test, expect } from '@playwright/test';

const D = (page, name, ...args) => page.evaluate(({ name, args }) => window.__d1GameDebug?.[name]?.(...args) ?? null, { name, args });
async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/d1-game.html?day=d6&devUnlock=1');
  await expect.poll(() => D(page, 'rawNegimaRuntime')).toMatchObject({ status: 'ready' });
  await page.evaluate(() => history.replaceState(null, '', '/d1-game.html?day=d6'));
  return errors;
}
async function nav(page, screen) {
  await page.getByTestId(`quicknav-SCR-SVC-${screen}`).click();
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
}
async function object(page, key) {
  const p = await D(page, 'screenPosOf', key);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(330);
}

test('실입력: 원본 네기마 두 개를 조립하고 독립 양면을 굽고 꺼낸다', async ({ page }) => {
  test.setTimeout(75000);
  const errors = await boot(page);
  await nav(page, 'ASSEMBLY');
  await page.getByRole('button', { name: '네기마', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    for (const key of ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken']) await object(page, key);
    await object(page, 'jigSkewer');
  }
  await nav(page, 'GRILL');
  const waiting = page.getByTestId('grill-waiting-negima').locator('[data-seasoning="salt"]');
  await waiting.click();
  await page.waitForTimeout(700);
  await waiting.click();
  await expect(page.getByTestId('grill-status-0').locator('[data-face="back"] em')).toHaveText('생것');
  await page.keyboard.press('Escape');
  const frozen = (await D(page, 'cookSlots'))[0].frontElapsedSec;
  await page.keyboard.press('1');
  await page.waitForTimeout(600);
  expect((await D(page, 'cookSlots'))[0].frontElapsedSec).toBe(frozen);
  await page.getByTestId('runtime-pause-resume').click();
  for (let slot = 0; slot < 2; slot++) {
    await expect.poll(async () => (await D(page, 'cookSlots'))[slot].frontDoneness, { timeout: 14000, intervals: [120] }).toBe('perfect');
    const before = (await D(page, 'cookSlots'))[slot].frontElapsedSec;
    await page.keyboard.press(String(slot + 1));
    await expect(page.getByTestId(`grill-feedback-${slot}`)).toHaveText('앞면 노릇하게');
    await expect.poll(async () => (await D(page, 'cookSlots'))[slot].contactFace).toBe('back');
    expect((await D(page, 'cookSlots'))[slot].frontElapsedSec).toBeLessThan(before + .8);
    await expect(page.getByTestId(`grill-status-${slot}`).locator('[data-face="front"]')).toHaveAttribute('data-doneness', 'perfect');
  }
  await expect.poll(() => D(page, 'rawNegimaRuntime').then(r => r.slots[0].visibleSpriteStage)).toBe('cooking');
  await page.screenshot({ path: test.info().outputPath('grill-two-faces.png') });
  for (let slot = 0; slot < 2; slot++) {
    await expect.poll(async () => (await D(page, 'cookSlots'))[slot].nextAction, { timeout: 14000, intervals: [120] }).toBe('retrieve');
    await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[slot].visibleSpriteStage).toBe('proper');
    await object(page, `pgSlot${slot}`);
    await expect(page.getByTestId(`grill-feedback-${slot}`)).toHaveText('완벽 · 양면 딱 좋게');
  }
  expect((await D(page, 'dockItems')).filter(item => item.menuId === 'negima').map(item => item.label)).toEqual(['Perfect', 'Perfect']);
  expect((await D(page, 'grillCraft')).embers.bursts).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});

test('모모·토리카와도 각 메뉴의 익힘과 같은 뒤집기·회수 피드백을 사용한다', async ({ page }) => {
  const errors = await boot(page);
  await D(page, 'cookFillAssembly', 'momo');
  await D(page, 'cookFillAssembly', 'kawa', 'tare');
  await nav(page, 'GRILL');
  await page.getByTestId('grill-waiting-momo').locator('[data-seasoning="salt"]').click();
  await page.getByTestId('grill-waiting-kawa').locator('[data-seasoning="tare"]').click();
  await D(page, 'cookElapse', 8.5);
  expect((await D(page, 'cookSlots')).map(s => s.frontDoneness)).toEqual(['perfect', 'under']);
  await expect(page.getByTestId('grill-status-0').locator('[data-face="front"] em')).toHaveText('노릇');
  await expect(page.getByTestId('grill-status-1').locator('[data-face="front"] em')).toHaveText('익는 중');
  await page.keyboard.press('1');
  await expect.poll(async () => (await D(page, 'cookSlots'))[0].contactFace).toBe('back');
  await D(page, 'cookElapse', 2);
  await page.keyboard.press('2');
  await expect.poll(async () => (await D(page, 'cookSlots'))[1].contactFace).toBe('back');
  await D(page, 'cookElapse', 10);
  await page.getByTestId('grill-status-0').click();
  await page.getByTestId('grill-status-1').click();
  expect((await D(page, 'dockItems')).map(i => [i.menuId, i.label])).toEqual([['momo', 'Perfect'], ['kawa', 'Perfect']]);
  await expect(page.getByTestId('grill-feedback-1')).toHaveText('완벽 · 양면 딱 좋게');
  expect(errors).toEqual([]);
});

test('GPU 문맥 복구 후 정적 익힘 텍스처를 다시 그리며 손실 중 조리 시간은 멈춘다', async ({ page }) => {
  const errors = await boot(page);
  await D(page, 'cookFillAssembly');
  await nav(page, 'GRILL');
  await page.getByTestId('grill-waiting-negima').locator('[data-seasoning="salt"]').click();
  await D(page, 'cookElapse', 9);
  await page.evaluate(() => window.__d1GameDebug.renderer.renderer.forceContextLoss());
  await expect.poll(() => D(page, 'runtimeSuspension')).toMatchObject({ paused: true });
  const frozen = (await D(page, 'cookSlots'))[0].frontElapsedSec;
  await page.waitForTimeout(350);
  expect((await D(page, 'cookSlots'))[0].frontElapsedSec).toBe(frozen);
  await page.evaluate(() => window.__d1GameDebug.renderer.renderer.forceContextRestore());
  await expect.poll(() => D(page, 'runtimeSuspension')).toMatchObject({ paused: false });
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0].visibleSpriteStage).toBe('proper');
  const visiblePixels = await page.evaluate(() => {
    const { renderer, scene, camera, objectMesh } = window.__d1GameDebug.renderer;
    const visibility = scene.children.map(child => [child, child.visible]);
    const background = scene.background;
    const color = renderer.getClearColor(objectMesh.pgSlot0.material.color.clone());
    const alpha = renderer.getClearAlpha();
    try {
      // 배경의 밝은 픽셀로 통과하지 않게 현재 적정 꼬치만 분리해 실제 GPU 출력을 읽는다.
      scene.children.forEach(child => { child.visible = child.name === 'grillNegimaSpriteSlot:pgSlot0'; });
      scene.background = null; renderer.setClearColor(0, 0);
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data.filter((value, i) => i % 4 !== 3 && value > 100).length;
    } finally {
      visibility.forEach(([child, visible]) => { child.visible = visible; });
      scene.background = background; renderer.setClearColor(color, alpha);
    }
  });
  expect(visiblePixels).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});

test('GPU 상태 텍스처 4장은 원본 alpha·대나무 픽셀을 보존하며 서로 다른 익힘을 표시한다', async ({ page }) => {
  const errors = await boot(page);
  const result = await page.evaluate(async () => {
    const { createNegimaStageTextures } = await import('/src/render/negimaStageTextures.js');
    const R = window.__d1GameDebug.renderer;
    let source;
    R.scene.traverse(object => { if (object.name === 'approvedGrillNegimaSprite:raw') source = object.material.map; });
    const canvas = document.createElement('canvas');
    canvas.width = source.image.width; canvas.height = source.image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(source.image, 0, 0);
    const raw = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const baked = createNegimaStageTextures(R.renderer, source);
    const stages = baked.targets.map(target => {
      const pixels = new Uint8Array(raw.length);
      R.renderer.readRenderTargetPixels(target, 0, 0, canvas.width, canvas.height, pixels);
      let alphaDifference = 0, changedFood = 0, changedStick = 0;
      for (let i = 0; i < raw.length; i += 4) {
        if (raw[i + 3] !== pixels[i + 3]) alphaDifference++;
        if (!raw[i + 3]) continue;
        const y = Math.floor(i / 4 / canvas.width) / canvas.height;
        const difference = Math.max(...[0, 1, 2].map(c => Math.abs(raw[i + c] - pixels[i + c])));
        if (difference > 3) { if (y < .2 || y > .82) changedStick++; else changedFood++; }
      }
      return { alphaDifference, changedFood, changedStick };
    });
    baked.dispose();
    return { stages, source: window.__d1GameDebug.grillCraft().source };
  });
  expect(result.source).toBe('spr-assembly-tray-negima-r1-b1.png');
  expect(result.stages).toHaveLength(4);
  for (const stage of result.stages) {
    expect(stage.alphaDifference).toBe(0);
    expect(stage.changedStick).toBe(0);
    expect(stage.changedFood).toBeGreaterThan(200);
  }
  expect(errors).toEqual([]);
});

test('탄 앞면은 뒤집고 새로고침해도 경고를 유지하며 다른 화면 숫자는 굽기를 건드리지 않는다', async ({ page }) => {
  const errors = await boot(page);
  await D(page, 'cookFillAssembly');
  await nav(page, 'GRILL');
  await page.getByTestId('grill-waiting-negima').locator('[data-seasoning="salt"]').click();
  // 경계 재현만 시간 가속. 정상 완주는 위 테스트의 일반 입력을 사용한다.
  await D(page, 'cookElapse', 22);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0].visibleSpriteStage).toBe('burnt');
  await page.keyboard.press('1');
  await expect.poll(async () => (await D(page, 'cookSlots'))[0].contactFace).toBe('back');
  await expect(page.getByTestId('grill-status-0')).toHaveAttribute('data-tone', 'burnt');
  await nav(page, 'ASSEMBLY');
  await page.keyboard.press('1');
  expect((await D(page, 'cookSlots'))[0].contactFace).toBe('back');
  await page.reload();
  await expect.poll(() => D(page, 'rawNegimaRuntime')).toMatchObject({ status: 'ready' });
  await nav(page, 'GRILL');
  await expect(page.getByTestId('grill-status-0').locator('[data-face="front"]')).toHaveAttribute('data-doneness', 'burnt');
  await D(page, 'cookElapse', 8);
  await expect(page.getByTestId('grill-status-0')).toHaveAttribute('data-tone', 'burnt');
  await object(page, 'pgSlot0');
  expect((await D(page, 'dockItems'))[0].label).toBe('Fail');
  expect(errors).toEqual([]);
});
