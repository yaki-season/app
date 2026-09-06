import { describe, expect, it } from 'vitest';
import { createPreparedDock } from '../../src/render/preparedDock.js';
import { createHighballStation } from '../../src/application/stations/highballStation.js';

describe('완성품 선택 보존', () => {
  it('선택한 ID를 소비해도 먼저 만든 다른 품질의 음식은 남는다', () => {
    const dock = createPreparedDock({ container: null });
    const bad = dock.add({ menuId: 'beer', quality: 'Fail' });
    const good = dock.add({ menuId: 'beer', quality: 'Perfect' });
    dock.select(good);
    expect(dock.consumeId(good)).toMatchObject({ id: good, quality: 'Perfect' });
    expect(dock.items()).toEqual([expect.objectContaining({ id: bad, quality: 'Fail' })]);
    expect(dock.consumeId(good)).toBeNull();
    expect(dock.count()).toBe(1);
  });
});

describe('하이볼 넘침 복구', () => {
  it.each(['whiskey', 'soda'])('한 재료(%s)만 넣은 넘침은 계속 대신 폐기할 수 있다', liquid => {
    const station = createHighballStation();
    station.placeGlass(); station.addIce(); station.press(liquid, 0); station.tick(5000);
    expect(station.acceptOverflow()).toMatchObject({ ok: false, reason: 'both-liquids-required' });
    expect(station.view()).toMatchObject({ overflow: true, canAcceptOverflow: false });
    expect(station.discard()).toBe(true);
    expect(station.placeGlass().ok).toBe(true);
  });
  it('두 재료가 들어간 넘침은 Fail 완성품 하나로 회수한다', () => {
    const station = createHighballStation();
    station.placeGlass(); station.addIce(); station.press('whiskey', 0); station.release(1000);
    station.press('soda', 1000); station.tick(5000);
    expect(station.view().canAcceptOverflow).toBe(true);
    expect(station.acceptOverflow().ok).toBe(true);
    expect(station.addLemon().completed.quality).toBe('Fail');
    expect(station.pickUp().ok).toBe(true);
    expect(station.pickUp().ok).toBe(false);
  });
  it('구형 저장의 불완전한 넘침 수락 상태도 버리고 다시 시작할 수 있다', () => {
    const station = createHighballStation({ snapshot: { stateVersion: 1, glassPlaced: true,
      iceAdded: true, whiskeyUnits: 4.8, sodaUnits: 0, overflowAccepted: true } });
    expect(station.view()).toMatchObject({ overflowAccepted: true, canAddLemon: false });
    station.discard();
    expect(station.placeGlass().ok).toBe(true);
  });
});
