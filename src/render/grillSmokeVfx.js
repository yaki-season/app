import * as THREE from 'three';

// SYS-002의 연기 쿼드 최대 6장 계약 안에서만 동작한다. 평시 연기는 작고 자주,
// 뒤집기 연기는 같은 풀에서 큰 단발 버스트로 빌려 쓰며 게임 상태를 변경하지 않는다.
export const GRILL_SMOKE_LIMITS = Object.freeze({
  maxPuffs: 6,
  ambientShortDelayMs: Object.freeze([220, 820]),
  ambientLongDelayMs: Object.freeze([1_050, 1_800]),
  ambientLongDelayChance: 0.22,
  ambientLifetimeMs: Object.freeze([1_000, 1_400]),
  flipBurstCount: 3,
  flipLifetimeMs: Object.freeze([650, 950]),
});

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smokeTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  const random = seededRandom(seed);
  const cell = 3;

  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 1; y < 15; y += 1) {
    for (let x = 1; x < 15; x += 1) {
      const dx = (x - 7.5) / 6.7;
      const dy = (y - 7.7) / 6.2;
      const envelope = (dx * dx) + (dy * dy * 1.12);
      const lobes = [
        ((dx + 0.34) ** 2) + ((dy + 0.02) ** 2),
        ((dx - 0.04) ** 2) + ((dy + 0.22) ** 2),
        ((dx - 0.36) ** 2) + ((dy + 0.01) ** 2),
        ((dx + 0.05) ** 2) + ((dy - 0.34) ** 2),
      ];
      const inCloudLobe = lobes.some((distance, index) => (
        distance < [0.29, 0.38, 0.27, 0.31][index] + random() * 0.08
      ));
      if (envelope > 0.64 || !inCloudLobe || random() < 0.07) continue;
      const shade = Math.round(211 + random() * 34);
      const edgeFade = Math.max(0.4, 1 - envelope * 0.42);
      const alpha = (0.42 + random() * 0.42) * edgeFade;
      context.fillStyle = `rgba(${shade}, ${shade}, ${shade + 3}, ${alpha})`;
      context.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function range(random, [min, max]) {
  return min + (max - min) * random();
}

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

export function nextAmbientSmokeDelay(random = Math.random) {
  const longPause = random() < GRILL_SMOKE_LIMITS.ambientLongDelayChance;
  return range(random, longPause
    ? GRILL_SMOKE_LIMITS.ambientLongDelayMs
    : GRILL_SMOKE_LIMITS.ambientShortDelayMs);
}

export function createGrillSmokeVfx({
  scene,
  slotMeshes,
  random = Math.random,
  reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
} = {}) {
  if (!scene) throw new Error('그릴 연기 VFX scene이 필요합니다.');
  const textures = [smokeTexture(0x59414b), smokeTexture(0x715349), smokeTexture(0x94711d)];
  const slots = Array.from(slotMeshes ?? []);
  const slotSizes = slots.map((mesh) => meshSize(mesh));
  const activeCookingSlots = [];
  let nextAmbientAt = 0;
  let pausedAtMs = null;
  const pool = Array.from({ length: GRILL_SMOKE_LIMITS.maxPuffs }, (_, index) => {
    const material = new THREE.SpriteMaterial({
      map: textures[index % textures.length],
      color: 0xe7e1dc,
      opacity: 0,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 90;
    sprite.userData.grillSmoke = true;
    scene.add(sprite);
    return {
      sprite,
      active: false,
      kind: 'ambient',
      slotIndex: -1,
      startedAt: 0,
      lifetimeMs: 1,
      startX: 0,
      startY: 0,
      startZ: 0,
      driftX: 0,
      driftY: 0,
      startScale: 0,
      endScale: 0,
      maxOpacity: 0,
    };
  });

  function availablePuff(kind) {
    const inactive = pool.find((puff) => !puff.active);
    if (inactive || kind !== 'flip') return inactive ?? null;
    // 평시 연기보다 뒤집기 순간의 "칙"을 우선한다. 풀을 늘리지 않고 가장 오래된
    // ambient 한 장을 즉시 재사용해 버스트 세 장을 가능한 한 보장한다.
    let oldestAmbient = null;
    for (const puff of pool) {
      if (puff.kind !== 'ambient') continue;
      if (!oldestAmbient || puff.startedAt < oldestAmbient.startedAt) oldestAmbient = puff;
    }
    return oldestAmbient;
  }

  function meshSize(mesh) {
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    return {
      width: Math.max(0.2, bounds.max.x - bounds.min.x),
      height: Math.max(0.2, bounds.max.y - bounds.min.y),
    };
  }

  function emit(slotIndex, nowMs, kind, burstOrdinal = 0) {
    const puff = availablePuff(kind);
    const mesh = slots[slotIndex];
    if (!puff || !mesh) return false;
    const size = slotSizes[slotIndex];
    const burst = kind === 'flip';
    const motionScale = reducedMotion ? 0.55 : 1;
    const lateralBias = burst ? (burstOrdinal - 1) * size.width * 0.14 : 0;

    puff.active = true;
    puff.kind = kind;
    puff.slotIndex = slotIndex;
    puff.startedAt = nowMs;
    puff.lifetimeMs = range(random, burst
      ? GRILL_SMOKE_LIMITS.flipLifetimeMs
      : GRILL_SMOKE_LIMITS.ambientLifetimeMs);
    // 평시 연기는 꼬치 중심의 고정 굴뚝이 아니라 매번 다른 고기 조각 근처에서 시작한다.
    // 뒤집기 버스트만 세 장이 좁게 퍼지도록 ordinal lateral bias를 더한다.
    puff.startX = mesh.position.x + lateralBias + ((random() - 0.5) * size.width * 0.22);
    puff.startY = mesh.position.y + ((random() - 0.5) * size.height * (burst ? 0.38 : 0.56));
    puff.startZ = mesh.position.z + 0.36;
    puff.driftX = ((random() - 0.5) * (burst ? 0.8 : 0.42)) * motionScale;
    puff.driftY = range(random, burst ? [0.95, 1.42] : [0.62, 1.02]) * motionScale;
    puff.startScale = size.height * range(random, burst ? [0.24, 0.34] : [0.11, 0.17]);
    puff.endScale = puff.startScale * range(random, burst ? [2.0, 2.55] : [1.65, 2.05]);
    puff.maxOpacity = (burst ? range(random, [0.46, 0.60]) : range(random, [0.27, 0.37]))
      * (reducedMotion ? 0.72 : 1);
    puff.sprite.material.map = textures[Math.floor(random() * textures.length) % textures.length];
    puff.sprite.material.rotation = (random() - 0.5) * 0.34;
    puff.sprite.position.set(puff.startX, puff.startY, puff.startZ);
    puff.sprite.scale.setScalar(puff.startScale);
    puff.sprite.visible = true;
    return true;
  }

  function burst(slotIndex, nowMs) {
    if (pausedAtMs !== null) return 0;
    let emitted = 0;
    for (let index = 0; index < GRILL_SMOKE_LIMITS.flipBurstCount; index += 1) {
      if (emit(slotIndex, nowMs + index * 24, 'flip', index)) emitted += 1;
    }
    return emitted;
  }

  function update(nowMs, slotViews, { visible = true } = {}) {
    if (pausedAtMs !== null) return;
    activeCookingSlots.length = 0;
    slots.forEach((_, slotIndex) => {
      const view = slotViews?.[slotIndex];
      const cooking = visible && view?.cooking === true && view?.flipping !== true;
      if (cooking) activeCookingSlots.push(slotIndex);
    });
    if (activeCookingSlots.length === 0) nextAmbientAt = 0;
    else {
      if (nextAmbientAt === 0) nextAmbientAt = nowMs + range(random, [100, 720]);
      if (nowMs >= nextAmbientAt) {
        const selected = Math.min(
          activeCookingSlots.length - 1,
          Math.floor(random() * activeCookingSlots.length),
        );
        emit(activeCookingSlots[selected], nowMs, 'ambient');
        nextAmbientAt = nowMs + nextAmbientSmokeDelay(random) * (reducedMotion ? 1.65 : 1);
      }
    }

    for (const puff of pool) {
      if (!puff.active) continue;
      const progress = Math.max(0, Math.min(1, (nowMs - puff.startedAt) / puff.lifetimeMs));
      if (progress >= 1) {
        puff.active = false;
        puff.sprite.visible = false;
        puff.sprite.material.opacity = 0;
        continue;
      }
      const rise = easeOutCubic(progress);
      const fadeIn = Math.min(1, progress / 0.14);
      const fadeOut = 1 - Math.max(0, (progress - 0.42) / 0.58);
      const scale = THREE.MathUtils.lerp(puff.startScale, puff.endScale, rise);
      puff.sprite.position.set(
        puff.startX + puff.driftX * rise,
        puff.startY + puff.driftY * rise,
        puff.startZ,
      );
      puff.sprite.scale.setScalar(scale);
      puff.sprite.material.opacity = puff.maxOpacity * fadeIn * fadeOut;
      puff.sprite.visible = visible;
    }
  }

  function snapshot() {
    return {
      paused: pausedAtMs !== null,
      maxPuffs: pool.length,
      active: pool.filter((puff) => puff.active).length,
      ambient: pool.filter((puff) => puff.active && puff.kind === 'ambient').length,
      flip: pool.filter((puff) => puff.active && puff.kind === 'flip').length,
      visible: pool.filter((puff) => puff.sprite.visible).length,
    };
  }

  function pause(nowMs) {
    if (pausedAtMs !== null) return false;
    pausedAtMs = nowMs;
    return true;
  }

  function resume(nowMs) {
    if (pausedAtMs === null) return false;
    const pausedDurationMs = Math.max(0, nowMs - pausedAtMs);
    for (const puff of pool) {
      if (puff.active) puff.startedAt += pausedDurationMs;
    }
    if (nextAmbientAt > 0) nextAmbientAt += pausedDurationMs;
    pausedAtMs = null;
    return true;
  }

  function dispose() {
    for (const puff of pool) {
      scene.remove(puff.sprite);
      puff.sprite.material.dispose();
    }
    for (const texture of textures) texture.dispose();
  }

  return { burst, update, pause, resume, snapshot, dispose };
}
