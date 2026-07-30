// SCR-SVC-GRILL 전용 semantic DOM 안전영역 계약.
// 승인 master의 tray/art 좌표는 이 모듈이 이동시키지 않는다. UI는 reserved zone 밖에만 놓인다.

export const GRILL_UI_LAYOUT_CONTRACT_VERSION = '1.1.0';

export const GRILL_UI_REFERENCE_VIEWPORT = Object.freeze({ width: 1920, height: 1080 });

export const GRILL_FINISHED_TRAY_APPROVED_INPUT = Object.freeze({
  id: 'ST-GRILL-FINISHED-TRAY',
  sourceRevision: 6,
  sha256: '51abf390cbf31d40b50a7d99f08a5d37a2da70df6cf94d405788538bad7d9184',
  runtimeRegistrationAllowed: false,
});

export const GRILL_FINISHED_TRAY_ART_FHD = Object.freeze({
  x: 1534,
  y: 123,
  width: 266,
  height: 354,
});

export const GRILL_FINISHED_TRAY_RESERVED_FHD = Object.freeze({
  x: 1502,
  y: 91,
  width: 330,
  height: 418,
});

export const GRILL_UI_AREAS_FHD = Object.freeze({
  safeFrame: Object.freeze({ x: 64, y: 40, width: 1792, height: 1000 }),
  serviceStatus: Object.freeze({ x: 64, y: 32, width: 1390, height: 64 }),
  receiptRail: Object.freeze({ x: 176, y: 104, width: 1278, height: 64 }),
  orderDetailRail: Object.freeze({ x: 176, y: 176, width: 1278, height: 72 }),
  helpRail: Object.freeze({ x: 176, y: 792, width: 1278, height: 64 }),
  preparedDock: Object.freeze({ x: 104, y: 872, width: 1712, height: 168 }),
  previousControl: Object.freeze({ x: 24, y: 456, width: 64, height: 168 }),
  nextControl: Object.freeze({ x: 1832, y: 456, width: 64, height: 168 }),
});

export const GRILL_ART_AREAS_FHD = Object.freeze({
  waiting: Object.freeze({ x: 64, y: 270, width: 352, height: 518 }),
  grillSlots: Object.freeze({ x: 448, y: 214, width: 1044, height: 642 }),
  finished: GRILL_FINISHED_TRAY_ART_FHD,
  discard: Object.freeze({ x: 1558, y: 464, width: 194, height: 278 }),
});

export function scaleRect(rect, viewport = GRILL_UI_REFERENCE_VIEWPORT) {
  const scale = Math.min(
    viewport.width / GRILL_UI_REFERENCE_VIEWPORT.width,
    viewport.height / GRILL_UI_REFERENCE_VIEWPORT.height,
  );
  const offsetX = (viewport.width - GRILL_UI_REFERENCE_VIEWPORT.width * scale) / 2;
  const offsetY = (viewport.height - GRILL_UI_REFERENCE_VIEWPORT.height * scale) / 2;
  return {
    x: offsetX + rect.x * scale,
    y: offsetY + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function rectIntersectionArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

export function rectContains(outer, inner) {
  const epsilon = 1e-6;
  return inner.x + epsilon >= outer.x
    && inner.y + epsilon >= outer.y
    && inner.x + inner.width <= outer.x + outer.width + epsilon
    && inner.y + inner.height <= outer.y + outer.height + epsilon;
}

export function receiptCardsAtViewport(viewport, count = 6) {
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    throw new RangeError('그릴 receipt card 수는 1~6이어야 합니다.');
  }
  const rail = scaleRect(GRILL_UI_AREAS_FHD.receiptRail, viewport);
  const gap = 12 * (rail.width / GRILL_UI_AREAS_FHD.receiptRail.width);
  const width = (rail.width - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: rail.x + index * (width + gap),
    y: rail.y,
    width,
    height: rail.height,
  }));
}

export function reportGrillUiNonIntrusion(viewport) {
  const reserved = scaleRect(GRILL_FINISHED_TRAY_RESERVED_FHD, viewport);
  const uiAreas = Object.fromEntries(
    Object.entries(GRILL_UI_AREAS_FHD).map(([id, rect]) => [id, scaleRect(rect, viewport)]),
  );
  const criticalUiAreaIds = Object.freeze([
    'serviceStatus',
    'receiptRail',
    'orderDetailRail',
    'helpRail',
    'preparedDock',
  ]);
  const intersectionAreas = Object.fromEntries(
    criticalUiAreaIds.map((id) => [id, rectIntersectionArea(uiAreas[id], reserved)]),
  );
  const conflicts = Object.entries(intersectionAreas)
    .filter(([, area]) => area > 0)
    .map(([id]) => id);
  return Object.freeze({
    viewport: Object.freeze({ ...viewport }),
    reserved,
    uiAreas: Object.freeze(uiAreas),
    intersectionAreas: Object.freeze(intersectionAreas),
    conflicts: Object.freeze(conflicts),
    receiptCount: receiptCardsAtViewport(viewport, 6).length,
    compatible: conflicts.length === 0,
  });
}
