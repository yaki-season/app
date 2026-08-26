import { describe, expect, it } from 'vitest';
import { createD3GrillSession } from '../../src/domain/cooking/d3GrillSession.js';

const MOMO_TARE = { id: 'D3-MOMO-001', menuId: 'momo', seasoning: 'tare', bothFacesCooked: true };

function properTorch(session, id = MOMO_TARE.id) {
  for (let cycle = 0; cycle < 2; cycle += 1) {
    session.applyTare(id);
    session.reheatTare(id);
  }
  session.beginTorch(id);
  [0.05, 0.25, 0.45, 0.65, 0.85].forEach((position) => {
    session.sweepTorch(id, { position, deltaMs: 200 });
  });
  session.finishTorch(id);
}

describe('D3 메뉴·그릴·저장 연결', () => {
  it('타레 모모는 타레 전 회수를 막지만 토치는 요구하지 않는다', () => {
    const session = createD3GrillSession();
    expect(session.stageCookedItem(MOMO_TARE).ok).toBe(true);
    expect(session.retrieve(MOMO_TARE.id)).toEqual({ ok: false, reason: 'tare-required' });
    session.applyTare(MOMO_TARE.id);
    expect(session.retrieve(MOMO_TARE.id)).toEqual({ ok: false, reason: 'tare-finish-required' });
  });

  it('두 번 도포·재가열하면 토치 없이 Perfect로 회수한다', () => {
    const session = createD3GrillSession();
    session.stageCookedItem(MOMO_TARE);
    session.applyTare(MOMO_TARE.id);
    session.reheatTare(MOMO_TARE.id);
    session.applyTare(MOMO_TARE.id);
    session.reheatTare(MOMO_TARE.id);
    expect(session.retrieve(MOMO_TARE.id)).toMatchObject({
      ok: true,
      item: { id: MOMO_TARE.id, seasoning: 'tare', quality: { grade: 'Perfect', smokyBonus: false } },
    });
  });

  it('복수 타레 모모의 상태를 제작물 ID별로 독립 보존한다', () => {
    const session = createD3GrillSession();
    session.stageCookedItem(MOMO_TARE);
    session.stageCookedItem({ ...MOMO_TARE, id: 'D3-MOMO-002' });
    session.applyTare(MOMO_TARE.id);
    expect(session.job(MOMO_TARE.id).finish.tareCoatCount).toBe(1);
    expect(session.job('D3-MOMO-002').finish.tareCoatCount).toBe(0);
  });

  it('적정 토치가 끝난 타레 모모를 Perfect·불향 보너스로 회수한다', () => {
    const session = createD3GrillSession();
    session.stageCookedItem(MOMO_TARE);
    properTorch(session);
    expect(session.retrieve(MOMO_TARE.id)).toMatchObject({
      ok: true,
      item: {
        menuId: 'momo',
        seasoning: 'tare',
        quality: { grade: 'Perfect', smokyBonus: true },
      },
    });
  });

  it('일반·소금 메뉴는 토치 없이 기존 그릴 품질로 회수한다', () => {
    const session = createD3GrillSession();
    session.stageCookedItem({ id: 'D3-NEGIMA-001', menuId: 'negima', seasoning: 'salt', bothFacesCooked: true });
    expect(session.retrieve('D3-NEGIMA-001', { grade: 'Good', good: true, servable: true })).toMatchObject({
      ok: true,
      item: { menuId: 'negima', seasoning: 'salt', quality: { grade: 'Good' } },
    });
  });

  it('토치 진행 중 저장하고 복원해 같은 구간부터 계속한다', () => {
    const source = createD3GrillSession();
    source.stageCookedItem(MOMO_TARE);
    source.applyTare(MOMO_TARE.id);
    source.reheatTare(MOMO_TARE.id);
    source.applyTare(MOMO_TARE.id);
    source.reheatTare(MOMO_TARE.id);
    source.beginTorch(MOMO_TARE.id);
    source.sweepTorch(MOMO_TARE.id, { position: 0.05, deltaMs: 200 });

    const restored = createD3GrillSession(JSON.parse(JSON.stringify(source.snapshot())));
    [0.25, 0.45, 0.65, 0.85].forEach((position) => {
      restored.sweepTorch(MOMO_TARE.id, { position, deltaMs: 200 });
    });
    expect(restored.finishTorch(MOMO_TARE.id)).toMatchObject({ torchState: 'proper' });
    expect(restored.retrieve(MOMO_TARE.id).ok).toBe(true);
  });

  it('타레 토리카와는 두 번 마감하며 최종 품질은 기본 그릴과 마감 중 낮은 쪽이다', () => {
    const session = createD3GrillSession();
    const kawa = {
      id: 'D5-KAWA-001',
      menuId: 'kawa',
      seasoning: 'tare',
      bothFacesCooked: true,
      baseQuality: { grade: 'OK', good: false, servable: true },
    };
    expect(session.stageCookedItem(kawa).ok).toBe(true);
    for (let cycle = 0; cycle < 2; cycle += 1) {
      session.applyTare(kawa.id);
      session.reheatTare(kawa.id);
    }
    expect(session.retrieve(kawa.id)).toMatchObject({
      ok: true,
      item: { menuId: 'kawa', quality: { grade: 'OK', good: false, smokyBonus: false } },
    });
  });

  it('선택 토치를 시작한 뒤에는 토치 판정을 끝내기 전 회수할 수 없다', () => {
    const session = createD3GrillSession();
    session.stageCookedItem(MOMO_TARE);
    for (let cycle = 0; cycle < 2; cycle += 1) {
      session.applyTare(MOMO_TARE.id);
      session.reheatTare(MOMO_TARE.id);
    }
    expect(session.beginTorch(MOMO_TARE.id)).toMatchObject({ ok: true });
    expect(session.retrieve(MOMO_TARE.id)).toEqual({ ok: false, reason: 'torch-active' });
  });
});
