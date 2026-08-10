import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createGrillSmokeVfx,
  GRILL_SMOKE_LIMITS,
  nextAmbientSmokeDelay,
} from '../../src/render/grillSmokeVfx.js';

function fakeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      set fillStyle(value) { this.currentFillStyle = value; },
    }),
  };
}

function slotMesh(x = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 3), new THREE.MeshBasicMaterial());
  mesh.position.set(x, -1, -1.6);
  return mesh;
}

describe('그릴 연기 VFX', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => fakeCanvas() });
  });

  it('평시 조리 중에만 작은 연기를 내고 6장 풀을 넘지 않는다', () => {
    const scene = new THREE.Scene();
    const vfx = createGrillSmokeVfx({
      scene,
      slotMeshes: [slotMesh(), slotMesh(1)],
      random: () => 0.5,
      reducedMotion: false,
    });

    vfx.update(0, [{ cooking: true }, { cooking: false }]);
    expect(vfx.snapshot().active).toBe(0);
    vfx.update(450, [{ cooking: true }, { cooking: false }]);
    expect(vfx.snapshot()).toMatchObject({ ambient: 1, flip: 0 });
    for (let now = 700; now <= 3_500; now += 500) {
      vfx.update(now, [{ cooking: true }, { cooking: true }]);
    }
    expect(vfx.snapshot().active).toBeLessThanOrEqual(GRILL_SMOKE_LIMITS.maxPuffs);
  });

  it('평시 방출 사이에 짧은 간격과 긴 휴지를 불규칙하게 섞는다', () => {
    const shortValues = [0.5, 0.25];
    const longValues = [0.1, 0.75];
    const shortDelay = nextAmbientSmokeDelay(() => shortValues.shift());
    const longDelay = nextAmbientSmokeDelay(() => longValues.shift());

    expect(shortDelay).toBeGreaterThanOrEqual(GRILL_SMOKE_LIMITS.ambientShortDelayMs[0]);
    expect(shortDelay).toBeLessThanOrEqual(GRILL_SMOKE_LIMITS.ambientShortDelayMs[1]);
    expect(longDelay).toBeGreaterThanOrEqual(GRILL_SMOKE_LIMITS.ambientLongDelayMs[0]);
    expect(longDelay).toBeLessThanOrEqual(GRILL_SMOKE_LIMITS.ambientLongDelayMs[1]);
  });

  it('뒤집기 성공 이벤트는 큰 연기 세 장을 한 번 방출한다', () => {
    const vfx = createGrillSmokeVfx({
      scene: new THREE.Scene(),
      slotMeshes: [slotMesh()],
      random: () => 0.5,
      reducedMotion: false,
    });

    expect(vfx.burst(0, 1_000)).toBe(GRILL_SMOKE_LIMITS.flipBurstCount);
    vfx.update(1_050, [{ cooking: false }]);
    expect(vfx.snapshot()).toMatchObject({ active: 3, ambient: 0, flip: 3, visible: 3 });
    vfx.update(2_100, [{ cooking: false }]);
    expect(vfx.snapshot().active).toBe(0);
  });

  it('풀이 평시 연기로 차 있어도 뒤집기 버스트 세 장을 우선한다', () => {
    const vfx = createGrillSmokeVfx({
      scene: new THREE.Scene(),
      slotMeshes: [slotMesh(), slotMesh(1)],
      random: () => 0.5,
      reducedMotion: false,
    });

    for (let now = 0; now <= 2_200; now += 200) {
      vfx.update(now, [{ cooking: true }, { cooking: true }]);
    }
    expect(vfx.burst(0, 2_210)).toBe(3);
    expect(vfx.snapshot().flip).toBe(3);
    expect(vfx.snapshot().active).toBeLessThanOrEqual(GRILL_SMOKE_LIMITS.maxPuffs);
  });

  it('그릴 화면이 아니면 연기 방출과 표시를 멈춘다', () => {
    const vfx = createGrillSmokeVfx({
      scene: new THREE.Scene(),
      slotMeshes: [slotMesh()],
      random: () => 0.5,
      reducedMotion: false,
    });

    vfx.burst(0, 1_000);
    vfx.update(1_050, [{ cooking: true }], { visible: false });
    expect(vfx.snapshot()).toMatchObject({ active: 3, visible: 0 });
  });
});
