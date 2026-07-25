import { test, expect } from '@playwright/test';

test('꼬치 셰이더가 WebGL2에서 컴파일되고 모든 익힘 단계가 렌더된다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/src/index.html');
  const result = await page.evaluate(async () => {
    const { createGrillRenderer } = await import('/src/render/grillRenderer.js');
    const canvas = document.createElement('canvas');
    canvas.style.width = '256px';
    canvas.style.height = '256px';
    document.body.append(canvas);

    const renderer = await createGrillRenderer(canvas, {
      textureUrl: '/art/generated/skewer-negima-raw.png',
      vertUrl: '/src/shaders/skewer.vert.glsl',
      fragUrl: '/src/shaders/skewer.frag.glsl',
    });

    for (const elapsedSec of [0, 4, 7]) {
      renderer.render(performance.now(), elapsedSec);
    }

    const gl = canvas.getContext('webgl2');
    return {
      mode: renderer.mode,
      error: gl.getError(),
      width: canvas.width,
      height: canvas.height,
    };
  });

  expect(result.mode).toBe('webgl2');
  expect(result.error).toBe(0);
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
