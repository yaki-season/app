import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';
import { FIRST_ORDER_RUNTIME_STORAGE_KEY } from '../../src/d1/firstOrderRuntimeStorage.js';

test.describe.configure({ retries: 0 });

const D = (page, fn, ...args) => page.evaluate(
  ({ name, values }) => window.__d1GameDebug[name](...values),
  { name: fn, values: args },
);

const rawRuntime = (page) => page.evaluate(() => (
  window.__d1GameDebug.rawNegimaRuntime?.() ?? { status: 'booting' }
));

async function clickObject(page, key) {
  const position = await D(page, 'screenPosOf', key);
  if (!position) throw new Error(`보이지 않는 조작 대상: ${key}`);
  await page.mouse.click(position.x, position.y);
}

const REQUIRED_RUNTIME_FILES = Object.freeze([
  '/public/assets/core/cooking/mdl-negima-grill-raw-r1-b1.json',
  '/public/assets/core/cooking/spr-negima-grill-raw-r1-b1.png',
  '/public/assets/core/cooking/spr-negima-grill-cooking-r1-b1.png',
  '/public/assets/core/cooking/spr-negima-grill-proper-r1-b1.png',
  '/public/assets/core/cooking/spr-negima-grill-overcooked-r1-b1.png',
  '/public/assets/core/cooking/spr-negima-grill-burnt-r1-b1.png',
  '/public/assets/core/cooking/mdl-skewer-base-r2-b1.glb',
  '/public/assets/core/cooking/mdl-skewer-base-pixel-albedo-r2-b1.png',
  '/public/assets/core/cooking/mdl-ingredient-chicken-r1-b2.glb',
  '/public/assets/core/cooking/mdl-ingredient-chicken-pixel-albedo-r1-b2.png',
  '/public/assets/core/cooking/mdl-ingredient-negi-r4-b1.glb',
  '/public/assets/core/cooking/mdl-ingredient-negi-pixel-albedo-r4-b1.png',
  '/public/assets/core/cooking/spr-assembly-tray-negima-r1-b1.png',
]);

test('approved grill negima exact-loads and switches the approved raster for each cooking stage', async ({ page }, testInfo) => {
  await routeD1ReleaseDefinition(page);
  const responses = new Map();
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (REQUIRED_RUNTIME_FILES.includes(pathname)) responses.set(pathname, response.status());
  });
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => rawRuntime(page), { timeout: 15_000 })
    .toMatchObject({ status: 'ready', exactLoadReady: true });
  const loaded = await D(page, 'rawNegimaRuntime');
  expect(loaded.diagnostics).toMatchObject({
    assetId: 'MDL-NEGIMA-GRILL-RAW',
    sourceRevision: 1,
    sourceModelCount: 3,
    sourceAlbedoCount: 3,
    traySpriteCount: 1,
    grillStageSpriteCount: 5,
    composedIngredientCount: 5,
    triangleCount: 476,
    rootNode: 'grillNegimaRoot',
    flipPivotNode: 'flipPivot',
  });
  expect(loaded.diagnostics.network).toHaveLength(13);
  expect(loaded.diagnostics.network.every(({ status, sha256Match }) => (
    status === 200 && sha256Match === true
  ))).toBe(true);
  expect(loaded.readiness.unboundApprovedIds).not.toContain('MDL-NEGIMA-GRILL-RAW');
  expect(loaded.readiness.unboundApprovedIds).not.toContain('MDL-SKEWER-BASE');
  expect(loaded.readiness.unboundApprovedIds).not.toContain('MDL-INGREDIENT-CHICKEN');
  expect(loaded.readiness.unboundApprovedIds).not.toContain('MDL-INGREDIENT-NEGI');
  expect(loaded.readiness.contractValid).toBe(true);
  expect(Object.fromEntries(responses)).toEqual(Object.fromEntries(
    REQUIRED_RUNTIME_FILES.map((url) => [url, 200]),
  ));

  await D(page, 'requestScreen', 'SCR-SVC-GRILL');
  await expect.poll(() => D(page, 'activeScreen')).toBe('SCR-SVC-GRILL');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
  await page.waitForTimeout(350);
  await D(page, 'cookFillAssembly');
  await D(page, 'cookFillAssembly');
  const waiting = page.getByTestId('grill-waiting-negima');
  await expect(waiting).toBeEnabled();
  await waiting.click();
  await expect.poll(() => D(page, 'cookSlots')).toEqual([
    expect.objectContaining({ status: 'front', contactFace: 'front' }),
    expect.objectContaining({ status: 'empty' }),
  ]);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({
      approvedRawVisible: true,
      approvedStage: 'raw',
      proceduralFallbackVisible: false,
      interactionVisible: true,
      visualMirrorX: 1,
    });
  await page.screenshot({
    path: testInfo.outputPath(`raw-independent-first-${page.viewportSize().width}x${page.viewportSize().height}.png`),
    fullPage: true,
  });
  const pixelEvidence = await page.evaluate(() => {
    const { renderer, camera, scene } = window.__d1GameDebug.renderer;
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const rect = window.__d1GameDebug.grillContract().slots[0].approvedVisualRect;
    const x0 = Math.floor(rect.x * width);
    const y0 = Math.floor((1 - rect.y - rect.height) * height);
    const sampleWidth = Math.ceil(rect.width * width);
    const sampleHeight = Math.ceil(rect.height * height);
    const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
    gl.readPixels(x0, y0, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let greenIngredientPixels = 0;
    let salmonIngredientPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const [r, g, b] = pixels.subarray(offset, offset + 3);
      if (g > 60 && g > r * 0.85 && g > b * 1.35) greenIngredientPixels += 1;
      if (r > 130 && r > g * 1.25 && g > b * 1.05) salmonIngredientPixels += 1;
    }
    return { greenIngredientPixels, salmonIngredientPixels };
  });
  expect(pixelEvidence.greenIngredientPixels).toBeGreaterThan(50);
  expect(pixelEvidence.salmonIngredientPixels).toBeGreaterThan(50);
  expect(await D(page, 'grillContract')).toMatchObject({ initialPlacementSlots: [1, 2] });
  await page.waitForTimeout(220);
  await waiting.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => D(page, 'cookSlots')).toEqual([
    expect.objectContaining({ status: 'front', contactFace: 'front' }),
    expect.objectContaining({ status: 'front', contactFace: 'front' }),
  ]);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({
      // 승인 평면 하나를 계속 두고 재질만 바꾼다. 굽는 동안 GLSL이 그 이미지를 칠한다.
      approvedRawVisible: true,
      approvedStage: 'raw',
      visibleSpriteStage: 'raw',
      shaderOnApprovedPlane: false,
      shaderCookingActive: false,
      shaderUsesApprovedRaw: false,
      interactionVisible: true,
    });
  await D(page, 'cookElapse', 8);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({ approvedStage: 'proper', visibleSpriteStage: 'proper' });
  await page.screenshot({
    path: testInfo.outputPath(`raster-proper-${page.viewportSize().width}x${page.viewportSize().height}.png`),
    fullPage: true,
  });
  await D(page, 'cookClickSlot', 0);
  await page.waitForTimeout(120);
  await expect.poll(() => D(page, 'cookSlots')).toEqual([
    expect.objectContaining({ status: 'flipping', flipping: true }),
    expect.objectContaining({ status: 'front' }),
  ]);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({ approvedStage: 'proper', visualFlipRadians: 0 });
  await page.waitForTimeout(240);
  await expect.poll(() => D(page, 'cookSlots')).toEqual([
    expect.objectContaining({ status: 'back', contactFace: 'back' }),
    expect.objectContaining({ status: 'front' }),
  ]);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({
      approvedStage: 'raw',
      visibleSpriteStage: 'raw',
      visualMirrorX: -1,
      visualDoneness: null,
    });
  await D(page, 'cookElapse', 8);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({ approvedStage: 'proper', visibleSpriteStage: 'proper' });
  await D(page, 'cookElapse', 8);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({ approvedStage: 'overcooked', visibleSpriteStage: 'overcooked' });
  await D(page, 'cookElapse', 5);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({ approvedStage: 'burnt', visibleSpriteStage: 'burnt' });
});

test('이어하기는 이전 페이지에서 만료된 그릴 잠금을 제거해 완성 꼬치를 즉시 회수한다', async ({ page }) => {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  const restoredRuntime = {
    stateVersion: 1,
    cook: {
      stateVersion: 1,
      assembly: { index: 0, complete: false },
      assembledCount: 2,
      transferredCount: 2,
      waiting: 0,
      initialBatch: { required: 2, placed: 2, started: true },
      grill: [{
        status: 'back',
        orientationFaceDown: 'back',
        contactFace: 'back',
        elapsedSec: { front: 8, back: 8 },
        faceReadyAtMs: { front: 108_000, back: 116_300 },
        lastUpdatedAt: 116_300,
        flip: null,
        inputLockedUntil: 108_300,
      }, {
      status: 'empty',
      orientationFaceDown: 'front',
      contactFace: null,
      elapsedSec: { front: 0, back: 0 },
      faceReadyAtMs: { front: null, back: null },
      lastUpdatedAt: null,
      flip: null,
      inputLockedUntil: 0,
      }],
    },
  };
  // 이전 문서는 pagehide에서 현재 상태를 다시 저장한다. 실제 새 문서 부팅 직전에 과거
  // performance.now() 기준 snapshot을 주입해 public shell의 이어하기 navigation을 재현한다.
  await page.addInitScript(({ key, snapshot }) => {
    if (location.search.includes('resume=1')) {
      localStorage.setItem(key, JSON.stringify(snapshot));
    }
  }, { key: FIRST_ORDER_RUNTIME_STORAGE_KEY, snapshot: restoredRuntime });

  await page.goto('/src/d1-game.html?resume=1');
  await expect.poll(() => rawRuntime(page), { timeout: 15_000 })
    .toMatchObject({ status: 'ready', exactLoadReady: true });
  await D(page, 'requestScreen', 'SCR-SVC-GRILL');
  await expect.poll(() => D(page, 'activeScreen')).toBe('SCR-SVC-GRILL');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
  await expect.poll(() => D(page, 'cookSlots').then(([slot]) => ({
    status: slot.status,
    inputLocked: slot.inputLocked,
    nextAction: slot.nextAction,
  }))).toEqual({ status: 'back', inputLocked: false, nextAction: 'retrieve' });
  const restoredSlot = (await D(page, 'cookSlots'))[0];
  expect(restoredSlot.frontElapsedSec).toBeCloseTo(8, 4);
  expect(restoredSlot.backElapsedSec).toBeGreaterThanOrEqual(8);

  // 다 익은 슬롯이므로 승인 원본 스프라이트가 아니라 GLSL이 그 이미지를 칠한 상태여야 한다.
  // 입력(회수 클릭)은 어느 쪽이든 살아 있어야 한다.
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({
      approvedRawVisible: true,
      shaderOnApprovedPlane: true,
      shaderCookingActive: true,
      shaderUsesApprovedRaw: true,
      interactionVisible: true,
    });
  const grillSlotKey = (await D(page, 'rawNegimaRuntime')).slots[0].key;
  await expect.poll(() => D(page, 'screenPosOf', grillSlotKey)).not.toBeNull();
  await clickObject(page, grillSlotKey);
  await expect.poll(() => D(page, 'cookSlots').then((slots) => slots[0].status)).toBe('empty');
  await expect.poll(() => D(page, 'grillFinishedInventory')).toMatchObject({ total: 1 });
  await expect.poll(() => D(page, 'dockItems')).toEqual([
    expect.objectContaining({ menu: '네기마', label: 'Perfect' }),
  ]);
});

test('조립대에서 승인 닭·파가 순서대로 쌓이고 완성 네기마가 오른쪽 트레이로 이동한다', async ({ page }) => {
  await routeD1ReleaseDefinition(page);
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => rawRuntime(page), { timeout: 15_000 })
    .toMatchObject({ status: 'ready', exactLoadReady: true });
  await D(page, 'requestScreen', 'SCR-SVC-ASSEMBLY');
  await expect.poll(() => D(page, 'activeScreen')).toBe('SCR-SVC-ASSEMBLY');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);

  await expect.poll(() => D(page, 'assemblyArtRuntime')).toMatchObject({
    status: 'ready',
    build: { visible: true, ingredientCount: 0 },
    waitingCount: 0,
  });
  const emptySkewer = (await D(page, 'assemblyArtRuntime')).build.geometry;
  expect(emptySkewer.tip.x).toBeGreaterThan(emptySkewer.handle.x);
  expect(Math.abs(emptySkewer.tip.y - emptySkewer.handle.y)).toBeLessThan(4);
  expect(emptySkewer.tip.x - emptySkewer.handle.x).toBeGreaterThan(180);
  expect(emptySkewer.slots.map(({ x }) => x)).toEqual(
    [...emptySkewer.slots.map(({ x }) => x)].sort((left, right) => left - right),
  );
  expect((await D(page, 'assemblyArtRuntime')).build.ingredientRenderOrders)
    .toEqual([205, 204, 203, 202, 201]);

  for (const [index, key] of ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken'].entries()) {
    await clickObject(page, key);
    await expect.poll(() => D(page, 'assemblyArtRuntime')).toMatchObject({
      build: { visible: true, ingredientCount: index + 1 },
    });
    await page.waitForTimeout(230);
  }

  await clickObject(page, 'jigSkewer');
  await expect.poll(() => D(page, 'assemblyArtRuntime')).toMatchObject({
    build: { visible: true, ingredientCount: 0 },
    waitingCount: 1,
  });
  expect((await D(page, 'assemblyArtRuntime')).tray[0]).toMatchObject({
    visible: true,
    ingredientCount: 5,
  });

  for (const [index, key] of ['binChicken', 'binLeek', 'binChicken', 'binLeek', 'binChicken'].entries()) {
    await clickObject(page, key);
    await expect.poll(() => D(page, 'assemblyArtRuntime')).toMatchObject({
      build: { visible: true, ingredientCount: index + 1 },
    });
    await page.waitForTimeout(230);
  }
  await clickObject(page, 'jigSkewer');
  await expect.poll(() => D(page, 'assemblyArtRuntime')).toMatchObject({
    build: { visible: true, ingredientCount: 0 },
    waitingCount: 2,
  });
  expect((await D(page, 'assemblyArtRuntime')).tray.slice(0, 2)).toEqual([
    expect.objectContaining({ visible: true, ingredientCount: 5 }),
    expect.objectContaining({ visible: true, ingredientCount: 5 }),
  ]);
  for (const item of (await D(page, 'assemblyArtRuntime')).tray.slice(0, 2)) {
    expect(item.geometry.tip.x).toBeLessThan(item.geometry.handle.x);
    expect(item.geometry.tip.y).toBeLessThan(item.geometry.handle.y);
    const tiltDegrees = Math.atan2(
      item.geometry.handle.x - item.geometry.tip.x,
      item.geometry.handle.y - item.geometry.tip.y,
    ) * 180 / Math.PI;
    expect(tiltDegrees).toBeGreaterThan(13);
    expect(tiltDegrees).toBeLessThan(17);
  }
});

test('exact source 하나라도 실패하면 RAW binding을 열지 않고 procedural fallback·inventory 증거를 유지한다', async ({ page }) => {
  await routeD1ReleaseDefinition(page);
  await page.route('**/mdl-ingredient-chicken-pixel-albedo-r1-b2.png', (route) => (
    route.fulfill({ status: 503, contentType: 'text/plain', body: 'forced exact-load failure' })
  ));
  await page.goto('/src/d1-game.html?reset=1');
  await expect.poll(() => rawRuntime(page))
    .toMatchObject({ status: 'failed', exactLoadReady: false });
  const failed = await D(page, 'rawNegimaRuntime');
  expect(failed.error).toContain('chicken-albedo 로드 실패 (503)');
  expect(failed.diagnostics.network).toContainEqual(expect.objectContaining({
    role: 'chicken-albedo',
    status: 503,
    ok: false,
  }));
  expect(failed.readiness.unboundApprovedIds).toContain('MDL-NEGIMA-GRILL-RAW');

  await D(page, 'requestScreen', 'SCR-SVC-GRILL');
  await expect.poll(() => D(page, 'isTransitioning')).toBe(false);
  await page.waitForTimeout(350);
  await D(page, 'cookFillAssembly');
  await D(page, 'cookFillAssembly');
  await page.getByTestId('grill-waiting-negima').click();
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({
      approvedRawVisible: false,
      proceduralFallbackVisible: true,
      interactionVisible: true,
    });
});
