import { describe, expect, it } from 'vitest';
import { createD3GrillSession } from '../../src/domain/cooking/d3GrillSession.js';

const MOMO_TARE = { id: 'D3-MOMO-001', menuId: 'momo', seasoning: 'tare', bothFacesCooked: true };

function properTorch(session, id = MOMO_TARE.id) {
  session.applyTare(id);
  session.beginTorch(id);
  [0.05, 0.25, 0.45, 0.65, 0.85].forEach((position) => {
    session.sweepTorch(id, { position, deltaMs: 200 });
  });
  session.finishTorch(id);
}

describe('D3 메뉴·그릴·저장 연결', () => {
  it('타레 모모는 양면 조리 뒤에도 토치 완료 전 회수를 막는다', () => {
    const session = createD3GrillSession();
    expect(session.stageCookedItem(MOMO_TARE).ok).toBe(true);
    expect(session.retrieve(MOMO_TARE.id)).toEqual({ ok: false, reason: 'tare-required' });
    session.applyTare(MOMO_TARE.id);
    expect(session.retrieve(MOMO_TARE.id)).toEqual({ ok: false, reason: 'torch-required' });
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
    source.beginTorch(MOMO_TARE.id);
    source.sweepTorch(MOMO_TARE.id, { position: 0.05, deltaMs: 200 });

    const restored = createD3GrillSession(JSON.parse(JSON.stringify(source.snapshot())));
    [0.25, 0.45, 0.65, 0.85].forEach((position) => {
      restored.sweepTorch(MOMO_TARE.id, { position, deltaMs: 200 });
    });
    expect(restored.finishTorch(MOMO_TARE.id)).toMatchObject({ torchState: 'proper' });
    expect(restored.retrieve(MOMO_TARE.id).ok).toBe(true);
  });
});
