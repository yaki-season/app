import { expect, test } from '@playwright/test';

// 타레를 바른 꼬치는 소금 꼬치와 한눈에 구분되는 갈색이어야 한다. 바른 직후(생),
// 적정, 탄 상태까지 전 구간에서 GLSL 코팅이 유지되는지 실제 WebGL2 픽셀로 확인한다.
test('타레 꼬치는 굽기 전·적정·탄 상태 모두에서 소금 꼬치보다 갈색이다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/src/single-customer-harness.html');
  const samples = await page.evaluate(async () => {
    const { createGrillRenderer } = await import('/src/render/grillRenderer.js');
    const canvas = document.createElement('canvas');
    canvas.style.width = '128px';
    canvas.style.height = '128px';
    document.body.append(canvas);
    const renderer = await createGrillRenderer(canvas, {
      textureUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#c77b3b"/></svg>')}`,
      vertUrl: '/src/shaders/skewer.vert.glsl',
      fragUrl: '/src/shaders/skewer.frag.glsl',
    });
    const gl = canvas.getContext('webgl2');

    // 시간에 따라 흔들리는 숯불 반사광을 고정해 두 조건을 같은 프레임 시각에서 비교한다.
    const meanColor = (elapsedSec, seasoned) => {
      renderer.render(0, elapsedSec, seasoned ? 0.34 : 0, seasoned);
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 8) continue;
        r += pixels[i];
        g += pixels[i + 1];
        b += pixels[i + 2];
        n += 1;
      }
      return { r: r / n, g: g / n, b: b / n, n };
    };

    return [0, 4, 7].map((elapsedSec) => ({
      elapsedSec,
      salt: meanColor(elapsedSec, 0),
      tare: meanColor(elapsedSec, 1),
    }));
  });

  expect(errors).toEqual([]);
  for (const { elapsedSec, salt, tare } of samples) {
    expect(salt.n, `doneness ${elapsedSec}s 표본`).toBeGreaterThan(0);
    // 간장 코팅은 파랑을 가장 많이 깎고 빨강은 거의 남긴다 → b/r가 확실히 내려간다.
    const saltRatio = salt.b / salt.r;
    const tareRatio = tare.b / tare.r;
    expect(tareRatio, `doneness ${elapsedSec}s b/r`).toBeLessThan(saltRatio - 0.02);
    // 눈으로 구분되려면 채널 차이가 양자화 잡음보다 훨씬 커야 한다.
    expect(Math.abs(salt.b - tare.b), `doneness ${elapsedSec}s 파랑 차이`).toBeGreaterThan(4);
  }
});
