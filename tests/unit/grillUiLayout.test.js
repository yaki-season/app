import { describe, expect, it } from 'vitest';
import { D1_GRILL_SLOTS } from '../../src/config/d1GrillLayout.js';
import {
  GRILL_FINISHED_TRAY_APPROVED_INPUT,
  GRILL_FINISHED_TRAY_ART_FHD,
  GRILL_FINISHED_TRAY_RESERVED_FHD,
  GRILL_UI_AREAS_FHD,
  GRILL_UI_LAYOUT_CONTRACT_VERSION,
  receiptCardsAtViewport,
  rectIntersectionArea,
  rectContains,
  rectsOverlap,
  reportGrillUiNonIntrusion,
  scaleRect,
} from '../../src/config/grillUiLayout.js';

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
];

describe('SCR-SVC-GRILL 완료 tray UI 비침범 계약', () => {
  it('소비자가 명시적으로 고정할 수 있는 계약 버전을 노출한다', () => {
    expect(GRILL_UI_LAYOUT_CONTRACT_VERSION).toBe('1.1.0');
    expect(GRILL_FINISHED_TRAY_APPROVED_INPUT).toEqual({
      id: 'ST-GRILL-FINISHED-TRAY',
      sourceRevision: 6,
      sha256: '51abf390cbf31d40b50a7d99f08a5d37a2da70df6cf94d405788538bad7d9184',
      runtimeRegistrationAllowed: false,
    });
  });

  it('승인 master의 실제 tray를 FHD 32px 여백을 둔 reserved zone이 포함한다', () => {
    expect(GRILL_FINISHED_TRAY_ART_FHD).toEqual({
      x: 1534,
      y: 123,
      width: 266,
      height: 354,
    });
    expect(GRILL_FINISHED_TRAY_RESERVED_FHD).toEqual({
      x: 1502,
      y: 91,
      width: 330,
      height: 418,
    });
    expect(rectContains(GRILL_FINISHED_TRAY_RESERVED_FHD, GRILL_FINISHED_TRAY_ART_FHD)).toBe(true);
  });

  it.each(VIEWPORTS)('$width×$height에서 모든 semantic UI가 reserved zone 밖에 있다', (viewport) => {
    const report = reportGrillUiNonIntrusion(viewport);
    expect(report).toMatchObject({ compatible: true, conflicts: [], receiptCount: 6 });
    expect(report.intersectionAreas).toEqual({
      serviceStatus: 0,
      receiptRail: 0,
      orderDetailRail: 0,
      helpRail: 0,
      preparedDock: 0,
    });
    expect(rectContains(report.uiAreas.safeFrame, scaleRect(GRILL_FINISHED_TRAY_ART_FHD, viewport))).toBe(true);
  });

  it.each(VIEWPORTS)('$width×$height에서 상태·receipt·order·help·dock 교차 면적이 각각 0이다', (viewport) => {
    const report = reportGrillUiNonIntrusion(viewport);
    for (const id of [
      'serviceStatus',
      'receiptRail',
      'orderDetailRail',
      'helpRail',
      'preparedDock',
    ]) {
      expect(rectIntersectionArea(report.uiAreas[id], report.reserved)).toBe(0);
    }
  });

  it.each(VIEWPORTS)('$width×$height에서 6개 receipt card가 모두 보이고 tray와 겹치지 않는다', (viewport) => {
    const reserved = scaleRect(GRILL_FINISHED_TRAY_RESERVED_FHD, viewport);
    const rail = scaleRect(GRILL_UI_AREAS_FHD.receiptRail, viewport);
    const cards = receiptCardsAtViewport(viewport);
    expect(cards).toHaveLength(6);
    for (const card of cards) {
      expect(rectContains(rail, card)).toBe(true);
      expect(rectsOverlap(card, reserved)).toBe(false);
    }
  });

  it.each(VIEWPORTS)('$width×$height에서 6개 그릴 hit rect를 UI가 가리지 않는다', (viewport) => {
    const blockingUi = [
      GRILL_UI_AREAS_FHD.serviceStatus,
      GRILL_UI_AREAS_FHD.receiptRail,
      GRILL_UI_AREAS_FHD.orderDetailRail,
      GRILL_UI_AREAS_FHD.helpRail,
      GRILL_UI_AREAS_FHD.preparedDock,
    ].map((rect) => scaleRect(rect, viewport));
    const slots = D1_GRILL_SLOTS.map((slot) => scaleRect({
      x: slot.hitRect.x * 1920,
      y: slot.hitRect.y * 1080,
      width: slot.hitRect.width * 1920,
      height: slot.hitRect.height * 1080,
    }, viewport));
    for (const slot of slots) {
      expect(blockingUi.some((ui) => rectsOverlap(slot, ui))).toBe(false);
      expect(slot.width).toBeGreaterThanOrEqual(44);
      expect(slot.height).toBeGreaterThanOrEqual(44);
    }
  });
});
