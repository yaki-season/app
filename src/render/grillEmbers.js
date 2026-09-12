import * as THREE from 'three';

// 한 번의 Points 드로콜만 쓴다. 기름방울과 뒤집기 착지 위치에 작은 불씨가 반응한다.
export function createGrillEmbers({ scene, slotMeshes, reducedMotion = false }) {
  const count = 18;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: reducedMotion ? 2 : 3, sizeAttenuation: false, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 335;
  points.frustumCulled = false;
  points.raycast = () => {};
  scene.add(points);
  const particles = Array.from({ length: count }, () => ({ until: 0 }));
  let cursor = 0;
  let nextDrip = 0;
  let bursts = 0;
  function burst(index, now, strength = 1) {
    const mesh = slotMeshes[index];
    if (!mesh) return;
    bursts++;
    const quantity = reducedMotion ? 2 : strength === 1 ? 5 : 2;
    for (let i = 0; i < quantity; i++) {
      const p = particles[cursor++ % count];
      Object.assign(p, { start: now, until: now + 500 + i * 45, x: mesh.position.x + (i - quantity / 2) * .06, y: mesh.position.y - .18, z: mesh.position.z + .4, dx: (i - quantity / 2) * .28, dy: .7 + (i % 3) * .25 });
    }
  }
  function update(now, views, visible) {
    points.visible = visible;
    if (!visible) { particles.forEach(p => { p.until = 0; }); nextDrip = now + 800; return; }
    const cooking = views.filter(v => v.cooking && v.faceElapsedSec > 2 && v.doneness !== 'burnt');
    if (cooking.length && now >= nextDrip) {
      const selected = cooking[Math.floor(now / 1800) % cooking.length];
      burst(selected.index, now, .4);
      nextDrip = now + (reducedMotion ? 2300 : 1200);
    }
    particles.forEach((p, i) => {
      const t = p.until > now ? (now - p.start) / (p.until - p.start) : 1;
      const alpha = Math.max(0, 1 - t);
      positions.set([p.x ?? 0, (p.y ?? 0) + (reducedMotion ? .1 : 1) * (p.dy ?? 0) * t, p.z ?? 0], i * 3);
      positions[i * 3] += (p.dx ?? 0) * t;
      colors.set([alpha, alpha * (.34 + alpha * .25), alpha * .06], i * 3);
    });
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }
  return { burst, update, snapshot: () => ({ capacity: count, bursts, visible: points.visible }), dispose() { scene.remove(points); geometry.dispose(); material.dispose(); } };
}
