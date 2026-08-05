import * as THREE from 'three';

const FRAG_URL = '/src/shaders/beerLiquid.frag.glsl';
const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export async function createBeerLiquidMaterial() {
  const response = await fetch(FRAG_URL);
  if (!response.ok) throw new Error(`beer liquid shader load failed (${response.status})`);
  const fragmentShader = (await response.text())
    .replace(/^#version.*$/m, '')
    .replace(/^precision.*$/m, '');
  const uniforms = {
    uTime: { value: 0 },
    uBeerFill: { value: 0 },
    uFoamFill: { value: 0 },
    uOverflow: { value: 0 },
  };
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
    setState({ beerFill = 0, foamFill = 0, overflow = false } = {}) {
      uniforms.uBeerFill.value = Math.max(0, Math.min(1, beerFill));
      uniforms.uFoamFill.value = Math.max(0, Math.min(1 - uniforms.uBeerFill.value, foamFill));
      uniforms.uOverflow.value = overflow ? 1 : 0;
    },
    setTime(seconds) { uniforms.uTime.value = seconds; },
    snapshot() {
      return {
        beerFill: uniforms.uBeerFill.value,
        foamFill: uniforms.uFoamFill.value,
        overflow: uniforms.uOverflow.value === 1,
      };
    },
    dispose() { material.dispose(); },
  };
}
