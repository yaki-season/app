// 멀티 잡 조리 모델 검증 (GPL-004). 익힘 임계값은 recipe.js 기본값(적정 8s·과다 16s·탄 21s).
import { describe, it, expect } from 'vitest';
import {
  COOK_SLOT_NEXT_ACTION,
  createCookStations,
  createD1CookStations,
} from '../../src/render/cookStations.js';

const NEGIMA = ['chicken', 'leek', 'chicken', 'leek', 'chicken'];
const MOMO = ['chicken', 'chicken', 'chicken', 'chicken', 'chicken'];
const assemble = (cook) => NEGIMA.forEach((ing) => cook.clickIngredient(ing));

describe('createCookStations', () => {
  it('정지 경과를 면 조리·뒤집기·입력 잠금에 포함하지 않는다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook);
    cook.placeToGrill(0);
    expect(cook.beginFlip(0, 1_000)).toMatchObject({ ok: true });
    expect(cook.pause(1_100)).toBe(true);
    expect(cook.slotViews(51_100)[0]).toMatchObject({
      flipping: true,
      frontElapsedSec: 1,
      backElapsedSec: 0,
    });
    expect(cook.clickSlot(0, 51_100)).toEqual({ ok: false, reason: 'paused' });
    expect(cook.resume(51_100)).toBe(true);
    expect(cook.slotViews(51_299)[0].flipping).toBe(true);
    expect(cook.slotViews(51_300)[0]).toMatchObject({
      flipping: false,
      contactFace: 'back',
      backElapsedSec: 0,
    });
  });

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

  it('D2 모모는 메뉴를 고른 뒤 닭 다섯 조각을 조립하고 메뉴별 대기 재고를 보존한다', () => {
    const cook = createD1CookStations();
    expect(cook.selectRecipe('momo')).toMatchObject({ ok: true, menuId: 'momo', recipe: MOMO });
    MOMO.forEach((ingredient) => expect(cook.clickIngredient(ingredient).ok).toBe(true));
    expect(cook.assemblyComplete()).toBe(true);
    expect(cook.transferAssembly()).toMatchObject({ ok: true, menuId: 'momo' });
    expect(cook.waitingCount()).toBe(1);
    expect(cook.waitingCount('momo')).toBe(1);
    expect(cook.waitingCount('negima')).toBe(0);
    expect(cook.waitingItems()).toEqual(['momo']);
  });

  it('네기마와 모모는 메뉴별로 선택 배치되고 슬롯·회수 결과에 메뉴가 따라간다', () => {
    const cook = createD1CookStations();
    cook.debugFillAssembly('negima');
    cook.debugFillAssembly('momo');
    expect(cook.placeToGrill(0, 'momo')).toMatchObject({ ok: true, slot: 0, menuId: 'momo' });
    expect(cook.placeToGrill(1_000, 'negima')).toMatchObject({ ok: true, slot: 1, menuId: 'negima' });
    expect(cook.slotViews(9_000)).toEqual([
      expect.objectContaining({ menuId: 'momo', frontElapsedSec: 9 }),
      expect.objectContaining({ menuId: 'negima', frontElapsedSec: 8 }),
    ]);
    cook.clickSlot(0, 9_000);
    expect(cook.clickSlot(0, 17_300)).toMatchObject({ ok: true, retrieved: true, menuId: 'momo' });
  });

  it('진행 중인 조립에서는 레시피를 바꾸지 못하고 저장 복구 뒤에도 메뉴를 보존한다', () => {
    const source = createD1CookStations();
    source.selectRecipe('momo');
    source.clickIngredient('chicken');
    expect(source.selectRecipe('negima')).toEqual({ ok: false, reason: 'assembly-in-progress' });
    MOMO.slice(1).forEach((ingredient) => source.clickIngredient(ingredient));
    source.transferAssembly();
    source.placeToGrill(1_000, 'momo');
    const saved = source.snapshot(3_000);

    const restored = createD1CookStations();
    expect(restored.restore(saved, 10_000)).toEqual({ ok: true });
    expect(restored.selectedMenuId()).toBe('momo');
    expect(restored.slotViews(10_000)[0]).toMatchObject({ menuId: 'momo', frontElapsedSec: 2 });
  });

  it('대기 꼬치를 빈 칸에 올려 굽고, 앞→뒤→회수로 완성품이 나온다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook);
    expect(cook.placeToGrill(0).ok).toBe(true);
    // 덜 익었어도 반대 면으로 뒤집을 수 있다.
    const flip = cook.clickSlot(0, 3000);
    expect(flip.flipped).toBe(true);
    // 앞면 3+5초, 뒷면 4+4초를 번갈아 누적한 뒤 최종 시간으로 Perfect를 판정한다.
    expect(cook.clickSlot(0, 7300).flipped).toBe(true);
    expect(cook.clickSlot(0, 12600).flipped).toBe(true);
    const done = cook.clickSlot(0, 16900);
    expect(done.retrieved).toBe(true);
    expect(done.quality).toMatchObject({
      good: true,
      grade: 'Perfect',
      frontResult: 'perfect',
      backResult: 'perfect',
    });
  });

  it('빈 칸이 없으면 올리지 못한다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook); assemble(cook); // waiting 2
    expect(cook.placeToGrill(0).ok).toBe(true); // 1칸 채움
    expect(cook.placeToGrill(0)).toEqual({ ok: false, reason: 'no-slot' });
  });

  it('다중 칸: 두 꼬치를 서로 다른 시각부터 독립적으로 굽는다', () => {
    const cook = createCookStations({ slots: 2 });
    assemble(cook); assemble(cook);
    expect(cook.placeToGrill(0).slot).toBe(0);
    expect(cook.placeToGrill(1000).slot).toBe(1); // 다른 시점에 두 번째 칸
    const v = cook.slotViews(10000);
    expect(v[0].doneness).toBe('perfect'); // 0s부터 10s
    expect(v[1].doneness).toBe('perfect'); // 1s부터 9s
    expect(v[0].cooking && v[1].cooking).toBe(true);
  });

  it('한 면 탄은 Fail 제공 대상으로 보존하고 양면 완전 탄만 폐기한다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook); cook.placeToGrill(0);
    expect(cook.tickBurn(21100)).toEqual([]);
    expect(cook.clickSlot(0, 21100).flipped).toBe(true);
    const discarded = cook.tickBurn(21100 + 300 + 21100);
    expect(discarded).toEqual([0]);
    expect(cook.slotViews(50000)[0].status).toBe('empty');
  });

  it('setSlots로 그릴 칸을 늘린다 (업그레이드)', () => {
    const cook = createCookStations({ slots: 1 });
    expect(cook.slotCount()).toBe(1);
    cook.setSlots(2);
    expect(cook.slotCount()).toBe(2);
  });

  it('접촉면 한 면만 진행하고 공중 회전 0.3초 동안 양면이 정지한다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook);
    cook.placeToGrill(0);
    expect(cook.slotViews(9000)[0]).toMatchObject({
      orientationFaceDown: 'front',
      contactFace: 'front',
      frontElapsedSec: 9,
      backElapsedSec: 0,
    });
    expect(cook.beginFlip(0, 9000).ok).toBe(true);
    expect(cook.slotViews(9200)[0]).toMatchObject({
      status: 'flipping',
      contactFace: null,
      frontElapsedSec: 9,
      backElapsedSec: 0,
      flipProgress: expect.closeTo(2 / 3, 6),
      visualRotationRad: expect.closeTo((Math.PI * 2) / 3, 6),
    });
    expect(cook.completeFlip(0, 9300)).toMatchObject({
      ok: true,
      orientationFaceDown: 'back',
      contactFace: 'back',
    });
    expect(cook.slotViews(10300)[0]).toMatchObject({
      frontElapsedSec: 9,
      backElapsedSec: 1,
      flipProgress: null,
      visualRotationRad: Math.PI,
    });
  });

  it('조기 뒤집기를 반복할 수 있지만 0.3초 공중 회전 잠금 중에는 중복 입력을 막는다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook);
    cook.placeToGrill(0);

    expect(cook.beginFlip(0, 1000)).toMatchObject({
      ok: true,
      fromFace: 'front',
      targetFace: 'back',
    });
    expect(cook.clickSlot(0, 1100)).toEqual({ ok: false, reason: 'flipping' });
    expect(cook.clickSlot(0, 1299)).toEqual({ ok: false, reason: 'flipping' });
    expect(cook.clickSlot(0, 1300)).toMatchObject({
      ok: true,
      flipped: true,
      fromFace: 'back',
      targetFace: 'front',
    });
    expect(cook.slotViews(1300)[0]).toMatchObject({
      contactFace: null,
      frontElapsedSec: 1,
      backElapsedSec: 0,
      flipping: true,
    });
  });

  it('slotViews는 빈 칸·배치 즉시 조리·공중 회전의 다음 행동을 도메인 값으로 제공한다', () => {
    const cook = createD1CookStations();
    expect(cook.slotViews(0)[0].nextAction).toBe(COOK_SLOT_NEXT_ACTION.NONE);

    cook.debugFillAssembly();
    expect(cook.placeToGrill(0)).toMatchObject({ slot: 0 });
    expect(cook.slotViews(10_000)[0]).toMatchObject({
      status: 'front',
      cooking: true,
      frontElapsedSec: 10,
      nextAction: COOK_SLOT_NEXT_ACTION.FLIP,
    });

    cook.debugFillAssembly();
    cook.debugFillAssembly();
    cook.placeToGrill(0);
    cook.placeToGrill(0);
    expect(cook.clickSlot(0, 13_000)).toMatchObject({ ok: true, flipped: true });
    expect(cook.slotViews(13_200)[0]).toMatchObject({
      status: 'flipping',
      inputLocked: true,
      nextAction: COOK_SLOT_NEXT_ACTION.WAIT,
    });
  });

  it('앞면 3초 뒤 0.3초 회전 잠금이 끝나면 뒷면 0초 상태의 다음 행동은 flip이다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook);
    cook.placeToGrill(0);

    expect(cook.slotViews(3_000)[0].nextAction).toBe(COOK_SLOT_NEXT_ACTION.FLIP);
    expect(cook.clickSlot(0, 3_000)).toMatchObject({ ok: true, flipped: true });
    expect(cook.slotViews(3_300)[0]).toMatchObject({
      status: 'back',
      frontElapsedSec: 3,
      backElapsedSec: 0,
      inputLocked: false,
      nextAction: COOK_SLOT_NEXT_ACTION.FLIP,
    });
  });

  it('앞면과 뒷면이 모두 적정 구간에 도달한 상태만 retrieve를 제공한다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook);
    cook.placeToGrill(0);

    expect(cook.slotViews(8_000)[0]).toMatchObject({
      frontElapsedSec: 8,
      backElapsedSec: 0,
      nextAction: COOK_SLOT_NEXT_ACTION.FLIP,
    });
    expect(cook.clickSlot(0, 8_000)).toMatchObject({ ok: true, flipped: true });
    expect(cook.slotViews(8_300)[0]).toMatchObject({
      frontElapsedSec: 8,
      backElapsedSec: 0,
      nextAction: COOK_SLOT_NEXT_ACTION.FLIP,
    });
    expect(cook.slotViews(16_300)[0]).toMatchObject({
      frontElapsedSec: 8,
      backElapsedSec: 8,
      nextAction: COOK_SLOT_NEXT_ACTION.RETRIEVE,
    });
    expect(cook.clickSlot(0, 16_300)).toMatchObject({
      ok: true,
      retrieved: true,
      quality: {
        grade: 'Perfect',
        frontResult: 'perfect',
        backResult: 'perfect',
      },
    });
  });

  it('그릴 밖에서는 정지하고 재투입하면 보존된 방향 면만 이어서 굽는다', () => {
    const cook = createCookStations({ slots: 1 });
    assemble(cook);
    cook.placeToGrill(0);
    expect(cook.removeFromGrill(0, 9000)).toMatchObject({
      ok: true,
      orientationFaceDown: 'front',
    });
    expect(cook.slotViews(19000)[0]).toMatchObject({
      status: 'off-grill',
      contactFace: null,
      frontElapsedSec: 9,
      backElapsedSec: 0,
    });
    expect(cook.reinsertToGrill(0, 19000)).toEqual({ ok: true, contactFace: 'front' });
    expect(cook.slotViews(20000)[0]).toMatchObject({
      frontElapsedSec: 10,
      backElapsedSec: 0,
    });
  });

  it('snapshot 복구 뒤 숨김 경과 시간을 더하지 않고 방향·양면 시간을 보존한다', () => {
    const source = createCookStations({ slots: 1 });
    assemble(source);
    source.placeToGrill(0);
    source.clickSlot(0, 3000);
    source.clickSlot(0, 7300);
    const saved = source.snapshot(9600);
    expect(saved.stateVersion).toBe(1);
    expect(saved.grill[0]).not.toHaveProperty('nextAction');

    const restored = createCookStations({ slots: 1 });
    expect(restored.restore(saved, 100000)).toEqual({ ok: true });
    expect(restored.slotViews(100000)[0]).toMatchObject({
      orientationFaceDown: 'front',
      contactFace: 'front',
      frontElapsedSec: 5,
      backElapsedSec: 4,
    });
    expect(restored.clickSlot(0, 103000)).toMatchObject({
      ok: true,
      flipped: true,
      fromFace: 'front',
      targetFace: 'back',
    });
    expect(restored.clickSlot(0, 107300)).toMatchObject({
      ok: true,
      retrieved: true,
      quality: {
        grade: 'Perfect',
        frontResult: 'perfect',
        backResult: 'perfect',
      },
    });
  });

  it('구형 staged 저장은 이어하기 시 첫 꼬치의 앞면 조리로 즉시 복구한다', () => {
    const restored = createD1CookStations();
    const legacy = {
      stateVersion: 1,
      assembly: { index: 0, complete: false },
      waiting: 1,
      initialBatch: { required: 2, placed: 1, started: false },
      grill: [
        {
          status: 'staged',
          orientationFaceDown: 'front',
          contactFace: null,
          elapsedSec: { front: 0, back: 0 },
          faceReadyAtMs: { front: null, back: null },
          lastUpdatedAt: null,
          flip: null,
          inputLockedUntil: 0,
        },
        {
          status: 'empty',
          orientationFaceDown: 'front',
          contactFace: null,
          elapsedSec: { front: 0, back: 0 },
          faceReadyAtMs: { front: null, back: null },
          lastUpdatedAt: null,
          flip: null,
          inputLockedUntil: 0,
        },
      ],
    };

    expect(restored.restore(legacy, 10_000)).toEqual({ ok: true });
    expect(restored.slotViews(12_000)).toEqual([
      expect.objectContaining({
        status: 'front',
        contactFace: 'front',
        cooking: true,
        frontElapsedSec: 2,
      }),
      expect.objectContaining({ status: 'empty' }),
    ]);
  });

  it('새 페이지 이어하기는 이전 performance.now 기준의 만료된 입력 잠금을 제거한다', () => {
    const source = createCookStations({ slots: 1 });
    assemble(source);
    source.placeToGrill(100_000);
    source.clickSlot(0, 108_000);
    source.slotViews(108_300);
    const saved = source.snapshot(116_300);
    expect(saved.grill[0]).toMatchObject({
      status: 'back',
      inputLockedUntil: 108_300,
      elapsedSec: { front: 8, back: 8 },
    });

    const restored = createCookStations({ slots: 1 });
    expect(restored.restore(saved, 100)).toEqual({ ok: true });
    expect(restored.slotViews(100)[0]).toMatchObject({
      status: 'back',
      inputLocked: false,
      nextAction: 'retrieve',
      frontElapsedSec: 8,
      backElapsedSec: 8,
    });
    expect(restored.clickSlot(0, 100)).toMatchObject({
      ok: true,
      retrieved: true,
      quality: { grade: 'Perfect' },
    });
  });

  it('D1은 2칸을 열고 explicit transfer된 각 꼬치를 놓는 즉시 독립적으로 굽는다', () => {
    const cook = createD1CookStations();
    expect(cook.slotCount()).toBe(2);

    assemble(cook);
    expect(cook.assemblyComplete()).toBe(true);
    expect(cook.waitingCount()).toBe(0);
    expect(cook.transferAssembly()).toMatchObject({ ok: true, transferred: true, waiting: 1 });

    assemble(cook);
    expect(cook.assemblyComplete()).toBe(true);
    expect(cook.waitingCount()).toBe(1);
    expect(cook.transferAssembly()).toMatchObject({ ok: true, transferred: true, waiting: 2 });

    expect(cook.placeToGrill(1_000)).toEqual({ ok: true, slot: 0 });
    expect(cook.slotViews(3_000)[0]).toMatchObject({
      status: 'front',
      cooking: true,
      frontElapsedSec: 2,
      backElapsedSec: 0,
    });

    expect(cook.placeToGrill(3_000)).toEqual({ ok: true, slot: 1 });
    expect(cook.slotViews(11_000)).toEqual([
      expect.objectContaining({ status: 'front', frontElapsedSec: 10 }),
      expect.objectContaining({ status: 'front', frontElapsedSec: 8 }),
    ]);
  });

  it('타레 모모는 조립대 붓질을 완료해야 전달되고 양념 상태가 회수까지 보존된다', () => {
    const cook = createD1CookStations();
    cook.selectRecipe('momo', 'tare');
    MOMO.forEach((ingredient) => cook.clickIngredient(ingredient));
    expect(cook.transferAssembly()).toEqual({ ok: false, reason: 'tare-brush-required' });
    expect(cook.brushAssemblyTare()).toMatchObject({ brushCount: 1, complete: false });
    expect(cook.brushAssemblyTare()).toMatchObject({ brushCount: 2, complete: false });
    expect(cook.brushAssemblyTare()).toMatchObject({ brushCount: 3, complete: true });
    expect(cook.transferAssembly()).toMatchObject({ ok: true });
    expect(cook.placeToGrill(0, 'momo')).toMatchObject({ seasoning: 'tare' });
    cook.debugElapse(8);
    cook.clickSlot(0, 0);
    cook.debugElapse(8);
    expect(cook.clickSlot(0, 0)).toMatchObject({
      retrieved: true,
      seasoning: 'tare',
      tarePrepared: true,
    });
  });
});
