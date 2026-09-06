import { it, expect } from 'vitest';
import { createDrinkPour } from '../../src/render/drinkStation.js';
import { createHighballStation, evaluateHighballQuality } from '../../src/application/stations/highballStation.js';

it('빈 잔·거품만 있는 잔·맥주 한 방울은 완성되지 않고 더 채울 수 있다', () => {
  for (const [beer, foam] of [[0, 0], [0, 150], [0, 3500], [100, 100]]) {
    const pour = createDrinkPour();
    pour.press('beer', 0); pour.release(beer);
    pour.press('foam', beer); pour.release(beer + foam);
    expect(pour.state().canFinish).toBe(false);
    expect(pour.finish()).toBeNull();
    expect(pour.state().phase).not.toBe('done');
  }
  const pour = createDrinkPour();
  pour.press('foam', 0); pour.release(1000);
  expect(pour.finish()).toBeNull();
  pour.press('beer', 1000); pour.release(4000);
  expect(pour.state().canFinish).toBe(true);
  expect(pour.finish()).toBe('Perfect');
});

it('극소량 하이볼은 레몬으로 완성되지 않으며 보충하면 정상 품질을 판정한다', () => {
  expect(evaluateHighballQuality({ whiskeyUnits: 0.01, sodaUnits: 0.03 })).toBeNull();
  const station = createHighballStation();
  station.placeGlass(); station.addIce();
  station.press('whiskey', 0); station.release(100);
  station.press('soda', 100); station.release(400);
  expect(station.view().canAddLemon).toBe(false);
  expect(station.addLemon()).toMatchObject({ ok: false, reason: 'more-liquid-required' });
  expect(station.pickUp().ok).toBe(false);
  station.press('whiskey', 400); station.release(1300);
  station.press('soda', 1300); station.release(4000);
  expect(station.addLemon().completed.quality).toBe('Perfect');
});
