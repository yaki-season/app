// 화면 좌·우 이동 순서는 SCREENS 배열 순서가 그대로 정본이다(screenLayout §"좌·우 순서 = 배열 순서").
// 조리 동선은 조립 → 그릴 → 드링크로 끝나고, 사이드 메뉴는 D4에 나중에 끼어든 스테이션이라
// 맨 끝에 둔다. 중간에 끼면 그릴에서 드링크로 갈 때마다 한 칸을 더 지나야 한다.
import { describe, expect, it } from 'vitest';
import { SCREENS, SCREEN_IDS, INITIAL_SCREEN } from '../../src/config/screenLayout.js';

const activeOn = (dayNumber) => SCREENS
  .filter((screen) => !screen.introducedOn || dayNumber >= Number(screen.introducedOn.slice(1)))
  .map((screen) => screen.id);

describe('영업 화면 좌우 이동 순서', () => {
  it('사이드 메뉴가 열리기 전에는 손님·조립·그릴·드링크 순이다', () => {
    expect(activeOn(3)).toEqual([
      'SCR-SVC-CUSTOMERS',
      'SCR-SVC-ASSEMBLY',
      'SCR-SVC-GRILL',
      'SCR-SVC-DRINK',
    ]);
  });

  it('사이드 메뉴는 드링크 뒤에 붙어 기존 동선을 밀어내지 않는다', () => {
    expect(activeOn(4)).toEqual([
      'SCR-SVC-CUSTOMERS',
      'SCR-SVC-ASSEMBLY',
      'SCR-SVC-GRILL',
      'SCR-SVC-DRINK',
      'SCR-SVC-INSTANT',
    ]);
    expect(activeOn(5)).toEqual(activeOn(4));
  });

  it('첫 화면은 손님이고 SCREEN_IDS는 같은 순서를 따른다', () => {
    expect(INITIAL_SCREEN).toBe('SCR-SVC-CUSTOMERS');
    expect(SCREEN_IDS).toEqual(SCREENS.map(({ id }) => id));
  });
});

// 화면은 같은 PLAYER_EYE에서 시선(look)만 달리한다. 좌·우 이동 순서와 시선의 좌우가
// 어긋나면 오른쪽으로 넘겼는데 카메라가 왼쪽으로 도는 일이 생긴다.
describe('좌우 이동 방향과 시선 방향', () => {
  it('배열 순서대로 시선 x가 왼쪽에서 오른쪽으로만 간다', () => {
    const xs = SCREENS.map(({ look }) => look.x);
    for (let index = 1; index < xs.length; index += 1) {
      expect(xs[index], `${SCREENS[index].id} 시선 x`).toBeGreaterThanOrEqual(xs[index - 1]);
    }
  });

  it('측면 스테이션은 드링크 → 사이드 메뉴 순으로 더 오른쪽을 본다', () => {
    const lookOf = (id) => SCREENS.find((screen) => screen.id === id).look.x;
    expect(lookOf('SCR-SVC-GRILL')).toBe(0);
    expect(lookOf('SCR-SVC-DRINK')).toBeGreaterThan(lookOf('SCR-SVC-GRILL'));
    expect(lookOf('SCR-SVC-INSTANT')).toBeGreaterThan(lookOf('SCR-SVC-DRINK'));
  });
});
