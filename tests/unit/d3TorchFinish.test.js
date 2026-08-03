import { describe, expect, it } from 'vitest';
import {
  TORCH_STATE,
  applyTare,
  beginTorch,
  canRetrieveTorchMenu,
  createD3TorchFinishState,
  finishTorch,
  sweepTorch,
} from '../../src/domain/cooking/d3TorchFinish.js';

function sweepAll(state, deltaMs = 200) {
  [0.05, 0.25, 0.45, 0.65, 0.85].forEach((position) => {
    expect(sweepTorch(state, { position, deltaMs }).ok).toBe(true);
  });
}

describe('D3 타레 모모 토치 마감', () => {
  it('양면 굽기와 타레를 선행해야 시작하며 시작 시 화재 위험을 1 높인다', () => {
    const state = createD3TorchFinishState();
    expect(beginTorch(state, { bothFacesCooked: false })).toEqual({ ok: false, reason: 'both-faces-required' });
    expect(beginTorch(state, { bothFacesCooked: true })).toEqual({ ok: false, reason: 'tare-required' });
    expect(applyTare(state)).toEqual({ ok: true });
    expect(beginTorch(state, { bothFacesCooked: true })).toEqual({ ok: true, fireRiskDelta: 1 });
  });

  it('고르게 훑으면 적정·Perfect·불향 보너스로 완료되고 회수할 수 있다', () => {
    const state = createD3TorchFinishState();
    applyTare(state);
    beginTorch(state, { bothFacesCooked: true });
    sweepAll(state);
    expect(finishTorch(state)).toMatchObject({
      ok: true,
      torchState: TORCH_STATE.PROPER,
      quality: { grade: 'Perfect', smokyBonus: true },
    });
    expect(state.torchCoverage).toBe(1);
    expect(canRetrieveTorchMenu(state)).toEqual({ ok: true });
  });

  it('적용 범위가 부족하면 Good 상한이고 완료 전 회수를 막는다', () => {
    const state = createD3TorchFinishState();
    applyTare(state);
    expect(canRetrieveTorchMenu(state)).toEqual({ ok: false, reason: 'torch-required' });
    beginTorch(state, { bothFacesCooked: true });
    sweepTorch(state, { position: 0.1, deltaMs: 200 });
    expect(finishTorch(state)).toMatchObject({ torchState: TORCH_STATE.UNDER, quality: { grade: 'Good' } });
  });

  it('한 지점 집중 가열은 Fail 판정한다', () => {
    const state = createD3TorchFinishState();
    applyTare(state);
    beginTorch(state, { bothFacesCooked: true });
    sweepTorch(state, { position: 0.5, deltaMs: 1_200 });
    expect(finishTorch(state)).toMatchObject({ torchState: TORCH_STATE.FAILED, quality: { grade: 'Fail' } });
  });

  it('상태는 JSON 저장·복원 뒤에도 판정 결과가 같다', () => {
    const source = createD3TorchFinishState();
    applyTare(source);
    beginTorch(source, { bothFacesCooked: true });
    sweepAll(source);
    const restored = JSON.parse(JSON.stringify(source));
    expect(finishTorch(restored)).toMatchObject({ torchState: TORCH_STATE.PROPER });
  });
});
