// 멀티 잡 조리 모델 검증 (GPL-004). 익힘 임계값은 recipe.js 기본값(적정 8s·과다 16s·탄 21s).
import { describe, it, expect } from 'vitest';
import { createCookStations } from '../../src/render/cookStations.js';

const NEGIMA = ['chicken', 'leek', 'chicken', 'leek', 'chicken'];
const assemble = (cook) => NEGIMA.forEach((ing) => cook.clickIngredient(ing));

describe('createCookStations', () => {
  it('조립: 순서대로 5개를 끼우면 완성돼 대기 트레이로 간다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook);
    expect(cook.waitingCount()).toBe(1);
    expect(cook.assemblyIndex()).toBe(0); // 완성 후 리셋
  });

  it('조립: 순서가 틀리면 무효(진행 안 함)', () => {
    const cook = createCookStations();
    expect(cook.clickIngredient('leek').ok).toBe(false); // 첫 재료는 닭
    expect(cook.assemblyIndex()).toBe(0);
  });

  it('굽는 중에도 다음 꼬치를 조립할 수 있다 (조립·그릴 독립)', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook); // waiting 1
    cook.placeToGrill(0); // 그릴에서 굽는 중
    expect(cook.waitingCount()).toBe(0);
    assemble(cook); // 굽는 동안 또 조립
    expect(cook.waitingCount()).toBe(1);
  });

  it('대기 꼬치를 빈 칸에 올려 굽고, 앞→뒤→회수로 완성품이 나온다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook);
    expect(cook.placeToGrill(0).ok).toBe(true);
    // 덜 익었을 때 클릭은 무효
    expect(cook.clickSlot(0, 1000).ok).toBe(false);
    // 적정(8s~)에서 뒤집기
    const flip = cook.clickSlot(0, 9000);
    expect(flip.flipped).toBe(true);
    // 뒷면 적정에서 회수 → 완성품 good
    const done = cook.clickSlot(0, 9000 + 9000);
    expect(done.retrieved).toBe(true);
    expect(done.quality.good).toBe(true);
  });

  it('빈 칸이 없으면 올리지 못한다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook); assemble(cook); // waiting 2
    expect(cook.placeToGrill(0).ok).toBe(true); // 1칸 채움
    expect(cook.placeToGrill(0)).toEqual({ ok: false, reason: 'no-slot' });
  });

  it('다중 칸: 두 꼬치를 동시에 독립적으로 굽는다', () => {
    const cook = createCookStations({ slots: 2 });
    assemble(cook); assemble(cook);
    expect(cook.placeToGrill(0).slot).toBe(0);
    expect(cook.placeToGrill(1000).slot).toBe(1); // 다른 시점에 두 번째 칸
    const v = cook.slotViews(10000);
    expect(v[0].doneness).toBe('perfect'); // 0s부터 10s
    expect(v[1].doneness).toBe('perfect'); // 1s부터 9s
    expect(v[0].cooking && v[1].cooking).toBe(true);
  });

  it('방치하면 탄 칸이 폐기된다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook); cook.placeToGrill(0);
    const discarded = cook.tickBurn(21100); // 21초 초과 → 탄 상태
    expect(discarded).toEqual([0]);
    expect(cook.slotViews(21100)[0].status).toBe('empty');
  });

  it('setSlots로 그릴 칸을 늘린다 (업그레이드)', () => {
    const cook = createCookStations({ slots: 1 });
    expect(cook.slotCount()).toBe(1);
    cook.setSlots(2);
    expect(cook.slotCount()).toBe(2);
  });
});
