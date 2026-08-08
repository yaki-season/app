import { describe, expect, it } from 'vitest';
import {
  D1_GRILL_FOOD_FOOTPRINT,
  D1_GRILL_FOOD_STATE_KEYS,
  D1_GRILL_FINISHED_TRAY,
  D1_GRILL_LAYER_OWNERSHIP,
  D1_GRILL_MASTER_GRATE_SAFE_RECT,
  D1_PUBLIC_GRILL_LAYOUT,
  D1_GRILL_SLOT_KEYS,
  D1_GRILL_SLOTS,
  createD1GrillObjects,
  rectAtViewport,
} from '../../src/config/d1GrillLayout.js';
import {
  computeGrillSlots,
  OBJECTS as PRODUCTION_OBJECTS,
  SCREEN_BY_ID as PRODUCTION_SCREENS,
} from '../../src/config/screenLayout.js';
import { OBJECTS as D1_OBJECTS, SCREEN_BY_ID as D1_SCREENS } from '../../src/config/d1Layout.js';

describe('D1 고정 6칸 그릴 레이아웃 계약', () => {
  it('public D1 첫 batch는 승인 R3의 첫 두 visual footprint를 pgSlot 시각·hit 단일 면으로 쓴다', () => {
    expect(D1_PUBLIC_GRILL_LAYOUT).toMatchObject({
      contractId: 'D1-FIRST-BATCH-R3',
      initialPlacementSlots: [1, 2],
    });
    const slots = computeGrillSlots(D1_PUBLIC_GRILL_LAYOUT);
    expect(slots.map(({ key, approvedVisualRect }) => ({
      key,
      approvedVisualRect: rectAtViewport(approvedVisualRect, 1920, 1080),
    }))).toEqual([
      { key: 'pgSlot0', approvedVisualRect: { x: 744, y: 274, width: 132, height: 438 } },
      { key: 'pgSlot1', approvedVisualRect: { x: 1052, y: 262, width: 126, height: 420 } },
    ]);
    for (const slot of slots) {
      expect(slot.rect.width).toBeLessThan(slot.approvedVisualRect.width);
      expect(slot.rect.height).toBeLessThan(slot.approvedVisualRect.height);
      expect(slot.rect.x + slot.rect.width / 2).toBeCloseTo(
        slot.approvedVisualRect.x + slot.approvedVisualRect.width / 2,
        12,
      );
      expect(slot.rect.y + slot.rect.height / 2).toBeCloseTo(
        slot.approvedVisualRect.y + slot.approvedVisualRect.height / 2,
        12,
      );
    }
  });

  it('generic game의 숫자형 2→8 슬롯 배치는 D1 요청과 독립적으로 유지된다', () => {
    const two = computeGrillSlots(2);
    const eight = computeGrillSlots(8);
    expect(two).toHaveLength(2);
    expect(eight).toHaveLength(8);
    expect(two.map(({ key }) => key)).toEqual(['pgSlot0', 'pgSlot1']);
    expect(eight.map(({ key }) => key)).toEqual(Array.from({ length: 8 }, (_, index) => `pgSlot${index}`));
    expect(two[0].rect.x).toBeCloseTo(0.2425, 10);
    expect(two[1].rect.x).toBeCloseTo(0.6725, 10);
    expect(two.map(({ rect }) => ({ y: rect.y, width: rect.width, height: rect.height }))).toEqual([
      { y: 0.46, width: 0.085, height: 0.24 },
      { y: 0.46, width: 0.085, height: 0.24 },
    ]);
  });

  it('승인 raw R3 footprint와 lane anchor를 slot0에 정규화해 노출한다', () => {
    expect(D1_GRILL_FOOD_FOOTPRINT).toMatchObject({
      stableAssetId: 'MDL-NEGIMA-GRILL-RAW',
      sourceRevision: 1,
      reviewRevision: 3,
      approvedReviewSha256: 'f13b3808b56c9462854c863c6b8843206aebfbbf2bf5669b1fb86d5bbc5a1579',
      runtimeRegistrationAllowed: false,
    });
    expect(rectAtViewport(D1_GRILL_FOOD_FOOTPRINT.slot0VisualRect, 1920, 1080)).toEqual({
      x: 545,
      y: 257,
      width: 131,
      height: 516,
    });
    expect(D1_GRILL_FOOD_FOOTPRINT.slot0Anchor.x * 1920).toBeCloseTo(609.6, 10);
    expect(D1_GRILL_FOOD_FOOTPRINT.slot0Anchor.y * 1080).toBeCloseTo(515, 10);

    const at720 = rectAtViewport(D1_GRILL_FOOD_FOOTPRINT.slot0VisualRect, 1280, 720);
    expect(at720.x).toBeCloseTo(363.3333333333333, 10);
    expect(at720.y).toBeCloseTo(171.3333333333333, 10);
    expect(at720.width).toBeCloseTo(87.3333333333333, 10);
    expect(at720.height).toBeCloseTo(344, 10);
    expect(D1_GRILL_FOOD_FOOTPRINT.approvedAlphaBBox720)
      .toEqual({ x: 363, y: 171, width: 88, height: 344 });
    expect(D1_GRILL_FOOD_FOOTPRINT.slot0Anchor.x * 1280).toBeCloseTo(406.4, 10);
    expect(D1_GRILL_FOOD_FOOTPRINT.slot0Anchor.y * 720).toBeCloseTo(343.3333333333333, 10);
  });

  it('raw·cooking·flipped·proper·burnt가 슬롯별 동일 위치·스케일 변환을 공유한다', () => {
    expect(D1_GRILL_FOOD_STATE_KEYS).toEqual([
      'raw',
      'cooking',
      'flipped',
      'proper',
      'burnt',
    ]);
    for (const slot of D1_GRILL_SLOTS) {
      const shared = slot.stateTransforms.raw;
      for (const state of D1_GRILL_FOOD_STATE_KEYS) {
        expect(slot.stateTransforms[state]).toBe(shared);
        expect(slot.stateTransforms[state].visualRect).toBe(slot.visualRect);
        expect(slot.stateTransforms[state].anchor).toBe(slot.anchor);
      }
    }
  });

  it('두 프로덕션 화면이 같은 여섯 rect와 실제 hit target을 소비한다', () => {
    expect(D1_GRILL_SLOT_KEYS).toEqual([
      'grillSlot0',
      'grillSlot1',
      'grillSlot2',
      'grillSlot3',
      'grillSlot4',
      'grillSlot5',
    ]);
    expect(PRODUCTION_SCREENS['SCR-SVC-GRILL'].objects).toEqual(
      expect.arrayContaining(D1_GRILL_SLOT_KEYS),
    );
    expect(D1_SCREENS['SCR-SVC-GRILL'].objects).toEqual(
      expect.arrayContaining(D1_GRILL_SLOT_KEYS),
    );

    const contractObjects = createD1GrillObjects();
    for (const slot of D1_GRILL_SLOTS) {
      expect(PRODUCTION_OBJECTS[slot.key]).toMatchObject({
        rect: slot.visualRect,
        hitTarget: slot.hitRect,
        hitRect: slot.hitRect,
        visualRect: slot.visualRect,
        anchor: slot.anchor,
        stateTransforms: slot.stateTransforms,
        slotIndex: slot.index,
      });
      expect(D1_OBJECTS[slot.key]).toEqual(PRODUCTION_OBJECTS[slot.key]);
      expect(contractObjects[slot.key].rect).toBe(slot.visualRect);
      expect(contractObjects[slot.key].hitRect).not.toBe(slot.visualRect);
    }
  });

  it('승인 R3 visual은 같은 Y축·크기로 0~5에 배치되고 기존 hitRect는 유지된다', () => {
    const expectedVisualLeft = [545, 698.6, 852.2, 1005.8, 1159.4, 1313];
    const expectedHitLeft = [547.2, 700.8, 854.4, 1008, 1161.6, 1315.2];
    const visuals = D1_GRILL_SLOTS.map((slot) => rectAtViewport(slot.visualRect, 1920, 1080));
    const hits = D1_GRILL_SLOTS.map((slot) => rectAtViewport(slot.hitRect, 1920, 1080));

    visuals.forEach((rect, index) => {
      expect(rect.x).toBeCloseTo(expectedVisualLeft[index], 10);
      expect(rect.y).toBeCloseTo(257, 10);
      expect(rect.width).toBeCloseTo(131, 10);
      expect(rect.height).toBeCloseTo(516, 10);
      expect(D1_GRILL_SLOTS[index].anchor.x * 1920).toBeCloseTo(609.6 + index * 153.6, 10);
      expect(D1_GRILL_SLOTS[index].anchor.y * 1080).toBeCloseTo(515, 10);
    });
    hits.forEach((rect, index) => {
      expect(rect.x).toBeCloseTo(expectedHitLeft[index], 10);
      expect(rect.y).toBeCloseTo(453.6, 10);
      expect(rect.width).toBeCloseTo(124.8, 10);
      expect(rect.height).toBeCloseTo(324, 10);
    });
    for (let index = 1; index < visuals.length; index += 1) {
      expect(visuals[index].x).toBeGreaterThanOrEqual(
        visuals[index - 1].x + visuals[index - 1].width,
      );
    }
  });

  it.each([
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ])('$width×$height에서 hit target이 겹치지 않고 44px보다 크다', ({ width, height }) => {
    const rects = D1_GRILL_SLOTS.map((slot) => rectAtViewport(slot.hitRect, width, height));
    for (const rect of rects) {
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    for (let index = 1; index < rects.length; index += 1) {
      expect(rects[index].x).toBeGreaterThanOrEqual(rects[index - 1].x + rects[index - 1].width);
    }
  });

  it.each([
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ])('$width×$height에서 여섯 visualRect와 hitRect가 master 석쇠 안전 경계 안에 있다', ({ width, height }) => {
    const grate = rectAtViewport(D1_GRILL_MASTER_GRATE_SAFE_RECT, width, height);
    for (const slot of D1_GRILL_SLOTS) {
      for (const rect of [
        rectAtViewport(slot.visualRect, width, height),
        rectAtViewport(slot.hitRect, width, height),
      ]) {
        expect(rect.x).toBeGreaterThanOrEqual(grate.x);
        expect(rect.y).toBeGreaterThanOrEqual(grate.y);
        expect(rect.x + rect.width).toBeLessThanOrEqual(grate.x + grate.width);
        expect(rect.y + rect.height).toBeLessThanOrEqual(grate.y + grate.height);
      }
    }
  });

  it('완성 트레이의 승인 visual bounds·독립 hit bounds·anchor를 두 화면에 노출한다', () => {
    expect(D1_GRILL_FINISHED_TRAY).toMatchObject({
      key: 'grillFinishedTray',
      componentId: 'grill.finished',
      stableAssetId: 'ST-GRILL-FINISHED-TRAY',
      sourceRevision: 6,
      approvedAssetSha256: '51abf390cbf31d40b50a7d99f08a5d37a2da70df6cf94d405788538bad7d9184',
      runtimeRegistrationAllowed: false,
      sourceMasterId: 'CM-GRILL-STATION-QUEUED-SELECTION',
      sourceMasterRevision: 3,
    });
    expect(rectAtViewport(D1_GRILL_FINISHED_TRAY.visualRect, 1920, 1080)).toEqual({
      x: 1534,
      y: 123,
      width: 266,
      height: 354,
    });
    expect(rectAtViewport(D1_GRILL_FINISHED_TRAY.hitRect, 1920, 1080)).toEqual({
      x: 1534,
      y: 123,
      width: 266,
      height: 354,
    });
    for (const rect of [
      rectAtViewport(D1_GRILL_FINISHED_TRAY.visualRect, 1280, 720),
      rectAtViewport(D1_GRILL_FINISHED_TRAY.hitRect, 1280, 720),
    ]) {
      expect(rect.x).toBeCloseTo(1022.6666666666666, 10);
      expect(rect.y).toBeCloseTo(82, 10);
      expect(rect.width).toBeCloseTo(177.3333333333333, 10);
      expect(rect.height).toBeCloseTo(236, 10);
    }
    expect(D1_GRILL_FINISHED_TRAY.anchor.x * 1920).toBeCloseTo(1643, 10);
    expect(D1_GRILL_FINISHED_TRAY.anchor.y * 1080).toBeCloseTo(301, 10);
    expect(D1_GRILL_FINISHED_TRAY.anchor.x * 1280).toBeCloseTo(1095.3333333333333, 10);
    expect(D1_GRILL_FINISHED_TRAY.anchor.y * 720).toBeCloseTo(200.66666666666666, 10);
    expect(D1_GRILL_FINISHED_TRAY.hitRect).not.toBe(D1_GRILL_FINISHED_TRAY.visualRect);
    expect(D1_GRILL_FINISHED_TRAY.hitRect).toEqual(D1_GRILL_FINISHED_TRAY.visualRect);
    expect(D1_GRILL_FINISHED_TRAY.reservedBounds).toBe(D1_GRILL_FINISHED_TRAY.visualRect);
    expect(PRODUCTION_OBJECTS.grillFinishedTray).toMatchObject({
      key: D1_GRILL_FINISHED_TRAY.key,
      componentId: D1_GRILL_FINISHED_TRAY.componentId,
      stableAssetId: D1_GRILL_FINISHED_TRAY.stableAssetId,
      sourceMasterId: D1_GRILL_FINISHED_TRAY.sourceMasterId,
      sourceMasterRevision: D1_GRILL_FINISHED_TRAY.sourceMasterRevision,
      visualRect: D1_GRILL_FINISHED_TRAY.visualRect,
      hitRect: D1_GRILL_FINISHED_TRAY.hitRect,
      reservedBounds: D1_GRILL_FINISHED_TRAY.reservedBounds,
      anchor: D1_GRILL_FINISHED_TRAY.anchor,
    });
    expect(D1_OBJECTS.grillFinishedTray).toEqual(PRODUCTION_OBJECTS.grillFinishedTray);
    expect(PRODUCTION_OBJECTS.grillFinishedTray.rect).toBe(D1_GRILL_FINISHED_TRAY.visualRect);
    expect(PRODUCTION_OBJECTS.grillFinishedTray.hitTarget).toBe(D1_GRILL_FINISHED_TRAY.hitRect);
    expect(D1_GRILL_LAYER_OWNERSHIP.foodOverlay.owner).toBe('developer-1');
  });
});
