import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  D1_GRILL_FOOD_FOOTPRINT,
  D1_GRILL_FINISHED_TRAY,
  D1_GRILL_MASTER_GRATE_SAFE_RECT,
  D1_GRILL_SLOTS,
} from '../../src/config/d1GrillLayout.js';

const MASTER_PATH = fileURLToPath(new URL(
  '../../../art-workspace/review/artist-000/d1-cooking/grill/master/r3/'
    + 'review-cm-grill-station-queued-selection-fhd-r3.png',
  import.meta.url,
));
const FINISHED_TRAY_R6_PATH = fileURLToPath(new URL(
  '../../../art-workspace/review/artist-000/d1-cooking/grill/finished-tray/r6/assets/'
    + 'st-grill-finished-tray-fhd-r6.png',
  import.meta.url,
));
const FINISHED_TRAY_R6_SHA256 = '51abf390cbf31d40b50a7d99f08a5d37a2da70df6cf94d405788538bad7d9184';

const pct = (value) => `${value * 100}%`;
const box = (rect, className, label) => (
  `<div class="${className}" style="left:${pct(rect.x)};top:${pct(rect.y)};`
  + `width:${pct(rect.width)};height:${pct(rect.height)}"><span>${label}</span></div>`
);

test('승인 master R3 위 FHD/720 슬롯·R6 완료 tray overlay가 좌표 계약과 일치한다', async ({
  page,
}, testInfo) => {
  const master = await readFile(MASTER_PATH);
  const finishedTrayR6 = await readFile(FINISHED_TRAY_R6_PATH);
  expect(createHash('sha256').update(finishedTrayR6).digest('hex')).toBe(FINISHED_TRAY_R6_SHA256);
  const slots = D1_GRILL_SLOTS.flatMap((slot) => [
    box(slot.hitRect, 'overlay slot-hit', `${slot.key} hit`),
    box(slot.visualRect, 'overlay slot-visual', `${slot.key} visual`),
  ]).join('');
  const tray = [
    box(D1_GRILL_FINISHED_TRAY.hitRect, 'overlay tray-hit', 'finished hit'),
    box(D1_GRILL_FINISHED_TRAY.visualRect, 'overlay tray-visual', 'finished visual / reserved'),
  ].join('');
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      html, body, main { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      main { position: relative; background: #111; }
      img { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
      .tray-art { position: absolute; inset: 0; pointer-events: none; }
      .overlay { position: absolute; pointer-events: none; }
      .overlay span {
        position: absolute; left: 2px; top: 2px; padding: 1px 3px;
        color: #fff; background: rgba(0,0,0,.72); font: 11px/1 monospace; white-space: nowrap;
      }
      .grate { border: 2px dashed #43ff86; }
      .slot-hit { border: 2px dashed #46d9ff; }
      .slot-visual { border: 2px solid #ffd84a; }
      .tray-hit { border: 3px dashed #46d9ff; outline: 2px dashed #46d9ff; outline-offset: 3px; }
      .tray-visual { border: 3px solid #ff4fd8; }
      .legend {
        position: absolute; left: 18px; top: 18px; padding: 9px 12px;
        color: #fff; background: rgba(0,0,0,.78); font: 14px/1.4 sans-serif;
      }
    </style>
    <main>
      <img alt="CM-GRILL-STATION-QUEUED-SELECTION R3"
        src="data:image/png;base64,${master.toString('base64')}">
      <img class="tray-art" alt="ST-GRILL-FINISHED-TRAY R6"
        src="data:image/png;base64,${finishedTrayR6.toString('base64')}">
      ${box(D1_GRILL_MASTER_GRATE_SAFE_RECT, 'overlay grate', 'runtime grate safe bounds')}
      ${slots}
      ${tray}
      <div class="legend">R3 master + R6 tray · yellow=visual · cyan=hit · magenta=finished reserved</div>
    </main>
  `);

  const viewport = page.viewportSize();
  const actualAlphaBBox = await page.locator('.tray-art').evaluate((image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let top = canvas.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  });
  expect(actualAlphaBBox).toEqual({ x: 1534, y: 123, width: 266, height: 354 });

  const visualBounds = await page.locator('.tray-visual').boundingBox();
  const hitBounds = await page.locator('.tray-hit').boundingBox();
  const scale = viewport.width / 1920;
  // CSS percentage 좌표는 1/64px 단위로 양자화될 수 있다. 최대 0.02px 오차만 허용해 시각 이동을 막는다.
  expect(Math.abs(visualBounds.x - 1534 * scale)).toBeLessThanOrEqual(0.02);
  expect(Math.abs(visualBounds.y - 123 * scale)).toBeLessThanOrEqual(0.02);
  expect(Math.abs(visualBounds.width - 266 * scale)).toBeLessThanOrEqual(0.02);
  expect(Math.abs(visualBounds.height - 354 * scale)).toBeLessThanOrEqual(0.02);
  expect(hitBounds).toEqual(visualBounds);

  const grate = await page.locator('.grate').boundingBox();
  const slotVisuals = [];
  for (const locator of await page.locator('.slot-visual').all()) {
    const slot = await locator.boundingBox();
    slotVisuals.push(slot);
    expect(slot.x).toBeGreaterThanOrEqual(grate.x);
    expect(slot.y).toBeGreaterThanOrEqual(grate.y);
    expect(slot.x + slot.width).toBeLessThanOrEqual(grate.x + grate.width);
    expect(slot.y + slot.height).toBeLessThanOrEqual(grate.y + grate.height);
  }
  const rawSlot0 = slotVisuals[0];
  expect(Math.abs(rawSlot0.x - 545 * scale)).toBeLessThanOrEqual(0.02);
  expect(Math.abs(rawSlot0.y - 257 * scale)).toBeLessThanOrEqual(0.02);
  expect(Math.abs(rawSlot0.width - 131 * scale)).toBeLessThanOrEqual(0.02);
  expect(Math.abs(rawSlot0.height - 516 * scale)).toBeLessThanOrEqual(0.02);
  expect(D1_GRILL_FOOD_FOOTPRINT.approvedAlphaBBox720)
    .toEqual({ x: 363, y: 171, width: 88, height: 344 });
  for (let index = 1; index < slotVisuals.length; index += 1) {
    expect(slotVisuals[index].x).toBeGreaterThanOrEqual(
      slotVisuals[index - 1].x + slotVisuals[index - 1].width,
    );
  }
  expect(slotVisuals.at(-1).x + slotVisuals.at(-1).width)
    .toBeLessThanOrEqual(1460 * scale + 0.02);
  expect(slotVisuals.at(-1).x + slotVisuals.at(-1).width)
    .toBeLessThanOrEqual(visualBounds.x);
  expect(D1_GRILL_FOOD_FOOTPRINT.runtimeRegistrationAllowed).toBe(false);

  await page.screenshot({
    path: testInfo.outputPath(`d1-grill-master-r3-tray-r6-overlay-${viewport.width}x${viewport.height}.png`),
  });
});

test('실제 프로덕션 renderer에서 R6 tray 중심·외곽 hit과 바깥 miss가 분리된다', async ({ page }) => {
  await page.goto('/src/game.html');
  await expect(page.getByTestId('scene-canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.__prodDebug))).toBe(true);
  await page.evaluate(() => window.__prodDebug.requestScreen('SCR-SVC-GRILL'));
  await expect.poll(() => page.evaluate(() => window.__prodDebug.activeScreen())).toBe('SCR-SVC-GRILL');
  await expect.poll(() => page.evaluate(() => window.__prodDebug.isTransitioning())).toBe(false);

  const viewport = page.viewportSize();
  const scale = viewport.width / 1920;
  const projected = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const mesh = window.__prodDebug.renderer.interactionMesh.grillFinishedTray;
    const camera = window.__prodDebug.renderer.camera;
    const canvasRect = document.querySelector('[data-testid="scene-canvas"]').getBoundingClientRect();
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.attributes.position;
    const points = Array.from({ length: positions.count }, (_, index) => {
      const point = mesh.position.clone()
        .fromBufferAttribute(positions, index)
        .applyMatrix4(mesh.matrixWorld)
        .project(camera);
      return {
        x: canvasRect.left + (point.x * 0.5 + 0.5) * canvasRect.width,
        y: canvasRect.top + (-point.y * 0.5 + 0.5) * canvasRect.height,
      };
    });
    const left = Math.min(...points.map(({ x }) => x));
    const right = Math.max(...points.map(({ x }) => x));
    const top = Math.min(...points.map(({ y }) => y));
    const bottom = Math.max(...points.map(({ y }) => y));
    return { x: left, y: top, width: right - left, height: bottom - top };
  });
  // rAF의 마지막 camera lerp가 같은 frame에 수렴할 때 생기는 sub-pixel 차이만 허용한다.
  expect(Math.abs(projected.x - 1534 * scale)).toBeLessThanOrEqual(0.25);
  expect(Math.abs(projected.y - 123 * scale)).toBeLessThanOrEqual(0.25);
  expect(Math.abs(projected.width - 266 * scale)).toBeLessThanOrEqual(0.25);
  expect(Math.abs(projected.height - 354 * scale)).toBeLessThanOrEqual(0.25);

  const rect = projected;
  const insidePoints = [
    { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    { x: rect.x + 2, y: rect.y + rect.height / 2 },
    { x: rect.x + rect.width - 2, y: rect.y + rect.height / 2 },
    { x: rect.x + rect.width / 2, y: rect.y + 2 },
    { x: rect.x + rect.width / 2, y: rect.y + rect.height - 2 },
  ];
  const clickCanvas = (point) => page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('[data-testid="scene-canvas"]');
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
    }));
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
    }));
  }, point);
  for (const point of insidePoints) {
    await page.locator('#hint').evaluate((hint) => {
      hint.textContent = '';
      hint.classList.remove('show');
    });
    await clickCanvas(point);
    await expect(page.locator('#hint')).toContainText('완료된 네기마');
    await page.waitForTimeout(250);
  }

  await page.locator('#hint').evaluate((hint) => {
    hint.textContent = '';
    hint.classList.remove('show');
  });
  await clickCanvas({ x: rect.x + rect.width + 4, y: rect.y + rect.height / 2 });
  await page.waitForTimeout(100);
  await expect(page.locator('#hint')).toHaveText('');

  const meshes = await page.evaluate(() => ({
    visualUuid: window.__prodDebug.renderer.artMesh.grillFinishedTray.uuid,
    hitUuid: window.__prodDebug.renderer.interactionMesh.grillFinishedTray.uuid,
    slotHitUuids: Array.from({ length: 6 }, (_, index) => (
      window.__prodDebug.renderer.interactionMesh[`grillSlot${index}`]?.uuid
    )),
  }));
  expect(meshes.hitUuid).not.toBe(meshes.visualUuid);
  expect(meshes.slotHitUuids).toEqual(Array.from({ length: 6 }, () => expect.any(String)));

  const projectedSlots = await page.evaluate(async () => {
    const runtimeRenderer = window.__prodDebug.renderer;
    for (let index = 0; index < 6; index += 1) {
      runtimeRenderer.setObjectVisible(`grillSlot${index}`, true);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const camera = runtimeRenderer.camera;
    const canvasRect = document.querySelector('[data-testid="scene-canvas"]').getBoundingClientRect();
    const projectBounds = (mesh) => {
      mesh.updateWorldMatrix(true, false);
      const positions = mesh.geometry.attributes.position;
      const points = Array.from({ length: positions.count }, (_, index) => {
        const point = mesh.position.clone()
          .fromBufferAttribute(positions, index)
          .applyMatrix4(mesh.matrixWorld)
          .project(camera);
        return {
          x: canvasRect.left + (point.x * 0.5 + 0.5) * canvasRect.width,
          y: canvasRect.top + (-point.y * 0.5 + 0.5) * canvasRect.height,
        };
      });
      const left = Math.min(...points.map(({ x }) => x));
      const right = Math.max(...points.map(({ x }) => x));
      const top = Math.min(...points.map(({ y }) => y));
      const bottom = Math.max(...points.map(({ y }) => y));
      return { x: left, y: top, width: right - left, height: bottom - top };
    };
    return Array.from({ length: 6 }, (_, index) => {
      const key = `grillSlot${index}`;
      const visualMesh = runtimeRenderer.objectMesh[key];
      const hitMesh = runtimeRenderer.interactionMesh[key];
      const hit = projectBounds(hitMesh);
      const points = [
        [hit.x + hit.width / 2, hit.y + hit.height / 2],
        [hit.x + 2, hit.y + hit.height / 2],
        [hit.x + hit.width - 2, hit.y + hit.height / 2],
      ];
      return {
        visual: projectBounds(visualMesh),
        hit,
        visualUuid: visualMesh.uuid,
        hitUuid: hitMesh.uuid,
        domOwners: points.map(([x, y]) => {
          const node = document.elementFromPoint(x, y);
          return node?.id ?? node?.className ?? node?.tagName ?? null;
        }),
      };
    });
  });
  for (const [index, projectedSlot] of projectedSlots.entries()) {
    const expectedVisual = {
      x: D1_GRILL_SLOTS[index].visualRect.x * viewport.width,
      y: D1_GRILL_SLOTS[index].visualRect.y * viewport.height,
      width: D1_GRILL_SLOTS[index].visualRect.width * viewport.width,
      height: D1_GRILL_SLOTS[index].visualRect.height * viewport.height,
    };
    const expectedHit = {
      x: D1_GRILL_SLOTS[index].hitRect.x * viewport.width,
      y: D1_GRILL_SLOTS[index].hitRect.y * viewport.height,
      width: D1_GRILL_SLOTS[index].hitRect.width * viewport.width,
      height: D1_GRILL_SLOTS[index].hitRect.height * viewport.height,
    };
    for (const key of ['x', 'y', 'width', 'height']) {
      expect(Math.abs(projectedSlot.visual[key] - expectedVisual[key])).toBeLessThanOrEqual(0.25);
      expect(Math.abs(projectedSlot.hit[key] - expectedHit[key])).toBeLessThanOrEqual(0.25);
    }
    expect(projectedSlot.visualUuid).not.toBe(projectedSlot.hitUuid);
    expect(projectedSlot.domOwners).toEqual(Array(3).fill('scene'));
  }
});
