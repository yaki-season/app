import { expect, test } from '@playwright/test';
import { routeD1ReleaseDefinition } from './d1-release-definition.js';

test.describe.configure({ retries: 0 });

const D = (page, fn, ...args) => page.evaluate(
  ({ name, values }) => window.__d1GameDebug[name](...values),
  { name: fn, values: args },
);

const rawRuntime = (page) => page.evaluate(() => (
  window.__d1GameDebug.rawNegimaRuntime?.() ?? { status: 'booting' }
));

const REQUIRED_RUNTIME_FILES = Object.freeze([
  '/public/assets/core/cooking/mdl-negima-grill-raw-r1-b1.json',
  '/public/assets/core/cooking/mdl-skewer-base-r2-b1.glb',
  '/public/assets/core/cooking/mdl-skewer-base-pixel-albedo-r2-b1.png',
  '/public/assets/core/cooking/mdl-ingredient-chicken-r1-b1.glb',
  '/public/assets/core/cooking/mdl-ingredient-chicken-pixel-albedo-r1-b1.png',
  '/public/assets/core/cooking/mdl-ingredient-negi-r3-b1.glb',
  '/public/assets/core/cooking/mdl-ingredient-negi-pixel-albedo-r3-b1.png',
]);

test('approved RAW R1을 exact-load 뒤 staged 한 상태에만 실제 렌더하고 기존 입력을 보존한다', async ({ page }, testInfo) => {
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
    composedIngredientCount: 5,
    triangleCount: 476,
    rootNode: 'grillNegimaRoot',
    flipPivotNode: 'flipPivot',
  });
  expect(loaded.diagnostics.network).toHaveLength(7);
  expect(loaded.diagnostics.network.every(({ status, sha256Match }) => (
    status === 200 && sha256Match === true
  ))).toBe(true);
  expect(loaded.readiness.unboundApprovedIds).not.toContain('MDL-NEGIMA-GRILL-RAW');
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
    expect.objectContaining({ status: 'staged', contactFace: null }),
    expect.objectContaining({ status: 'empty' }),
  ]);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({
      approvedRawVisible: true,
      proceduralFallbackVisible: false,
      interactionVisible: true,
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
      if (g > 70 && g > r * 1.15 && g > b * 1.4) greenIngredientPixels += 1;
      if (r > 130 && r > g * 1.25 && g > b * 1.05) salmonIngredientPixels += 1;
    }
    return { greenIngredientPixels, salmonIngredientPixels };
  });
  expect(pixelEvidence.greenIngredientPixels).toBeGreaterThan(50);
  expect(pixelEvidence.salmonIngredientPixels).toBeGreaterThan(50);
  expect(await D(page, 'grillContract')).toMatchObject({ initialPlacementSlots: [1, 2] });
  await page.screenshot({
    path: testInfo.outputPath(`raw-staged-${page.viewportSize().width}x${page.viewportSize().height}.png`),
    fullPage: true,
  });

  await page.waitForTimeout(220);
  await waiting.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => D(page, 'cookSlots')).toEqual([
    expect.objectContaining({ status: 'front', contactFace: 'front' }),
    expect.objectContaining({ status: 'front', contactFace: 'front' }),
  ]);
  await expect.poll(async () => (await D(page, 'rawNegimaRuntime')).slots[0])
    .toMatchObject({
      approvedRawVisible: false,
      proceduralFallbackVisible: true,
      interactionVisible: true,
    });
});

test('exact source 하나라도 실패하면 RAW binding을 열지 않고 procedural fallback·inventory 증거를 유지한다', async ({ page }) => {
  await routeD1ReleaseDefinition(page);
  await page.route('**/mdl-ingredient-chicken-pixel-albedo-r1-b1.png', (route) => (
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
