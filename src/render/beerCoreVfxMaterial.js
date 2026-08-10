import * as THREE from 'three';

const FRAG_URL = '/src/shaders/beerCoreVfx.frag.glsl';
const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export async function createBeerCoreVfxMaterial() {
  const response = await fetch(FRAG_URL);
  if (!response.ok) throw new Error(`beer core VFX shader load failed (${response.status})`);
  const fragmentShader = (await response.text())
    .replace(/^#version.*$/m, '')
    .replace(/^precision.*$/m, '');
  const uniforms = Object.fromEntries(
    ['uTime', 'uPourBeer', 'uPourFoam', 'uFoamCrown', 'uOverflow', 'uFinished']
      .map((key) => [key, { value: 0 }]),
  );
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: VERT,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return {
    material,
    setTime(seconds) { uniforms.uTime.value = seconds; },
    setState({ active = null, foamFill = 0, overflow = false, finished = false } = {}) {
      uniforms.uPourBeer.value = active === 'beer' ? 1 : 0;
      uniforms.uPourFoam.value = active === 'foam' ? 1 : 0;
      // 포말 덩어리는 거품을 실제로 따르는 동안만 보인다. 완성 잔의 거품층은 liquid material이 담당한다.
      uniforms.uFoamCrown.value = active === 'foam'
        ? Math.max(0, Math.min(1, foamFill * 4))
        : 0;
      uniforms.uOverflow.value = overflow ? 1 : 0;
      uniforms.uFinished.value = finished ? 1 : 0;
    },
    snapshot() {
      return {
        time: uniforms.uTime.value,
        pourBeer: uniforms.uPourBeer.value === 1,
        pourFoam: uniforms.uPourFoam.value === 1,
        foamCrown: uniforms.uFoamCrown.value,
        overflow: uniforms.uOverflow.value === 1,
        finished: uniforms.uFinished.value === 1,
      };
    },
    dispose() { material.dispose(); },
  };
}
