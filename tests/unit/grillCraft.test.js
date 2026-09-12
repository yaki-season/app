import { describe, expect, it } from 'vitest';
import { createD1CookStations } from '../../src/render/cookStations.js';
import { grillCraftCopy, grillFlipPose } from '../../src/render/grillCraft.js';

describe('실제 조리 상태와 장인 그릴 표시', () => {
  function cookAtFront() {
    const cook = createD1CookStations({ slots: 2 });
    cook.currentRecipe().forEach(ingredient => cook.clickIngredient(ingredient));
    cook.transferAssembly(); cook.placeToGrill(0);
    return cook;
  }
  it('이미 탄 반대 면을 숨기고 양면 완벽이라고 안내하지 않는다', () => {
    expect(grillCraftCopy({ frontDoneness: 'burnt', backDoneness: 'perfect', doneness: 'perfect', nextAction: 'retrieve' }))
      .toEqual({ tone: 'burnt', action: '탄 면이 있어요 · 꺼내기', ready: true });
    expect(grillCraftCopy({ frontDoneness: 'over', backDoneness: 'perfect', doneness: 'perfect', nextAction: 'retrieve' }).tone).toBe('over');
  });
  it('조기 뒤집은 면은 보존되고 다시 접촉할 때만 익는다', () => {
    const cook = cookAtFront();
    expect(cook.slotViews(2000)[0]).toMatchObject({ frontDoneness: 'under', backDoneness: 'under' });
    cook.clickSlot(0, 2000);
    const air = cook.slotViews(2150)[0];
    expect(air).toMatchObject({ frontElapsedSec: 2, backElapsedSec: 0, contactFace: null });
    expect(grillCraftCopy(air).tone).toBe('turning');
    expect(cook.slotViews(10300)[0]).toMatchObject({ frontElapsedSec: 2, backDoneness: 'perfect', frontDoneness: 'under' });
    cook.clickSlot(0, 10300);
    expect(cook.slotViews(16600)[0]).toMatchObject({ frontDoneness: 'perfect', backDoneness: 'perfect', nextAction: 'retrieve' });
    expect(grillCraftCopy(cook.slotViews(16600)[0])).toMatchObject({ tone: 'perfect', ready: true });
    expect(cook.clickSlot(0, 16600).quality.grade).toBe('Perfect');
  });
  it('회전은 공중에서 들리고 끝에서 착지하며 종잇장처럼 사라지지 않는다', () => {
    for (let i = 0; i <= 100; i++) {
      const pose = grillFlipPose({ flipping: true, flipProgress: i / 100, orientationFaceDown: 'front' });
      expect(Math.abs(pose.scaleX)).toBeGreaterThanOrEqual(.8);
    }
    expect(grillFlipPose({ flipping: true, flipProgress: .5 }).y).toBeGreaterThan(.08);
    expect(grillFlipPose({ flipping: false, orientationFaceDown: 'back' })).toEqual({ x: 0, y: 0, roll: 0, scaleX: -1 });
    expect(grillFlipPose({ flipping: true, flipProgress: .5 }, true).y).toBeLessThan(.02);
  });
});
