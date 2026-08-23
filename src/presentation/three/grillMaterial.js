// 2.5D 장면 꼬치용 익힘 재질.
//
// 코덱스가 파라미터로 분리한 익힘 셰이더(`skewer.frag.glsl`, TECH-REND-001)를 Three.js
// ShaderMaterial(GLSL3)로 감싼다. 셰이더는 단일 원본(.glsl)을 그대로 번들에 실어 읽고, 헤더
// (`#version`·`precision`)만 떼어낸다 — 나머지 uniform·본문은 grill-shader.spec가 그대로 검증한다.
//
// 베이스 텍스처는 코드로 그린 절차적 네기마(닭·대파 교차)다. 아트가 오면 이 텍스처만 교체하면
// 셰이더는 그대로 익힌다. 익힘 진행(uDoneness)은 게임 로직이 경과 시간으로 만들어 넣는다.

import * as THREE from 'three';
import { RECIPE, INGREDIENT } from '../../config/recipe.js';
import { GRILL_PARAMS } from './grillShaderParams.js';
// 번들에 함께 실린다. 예전처럼 런타임에 fetch하면 배포본에서 /src 경로가 없어 404가 나고,
// 익힘 셰이더가 통째로 빠진 채(흰 판) 돌아간다.
import fragmentSource from '../../shaders/skewer.frag.glsl?raw';

const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// 파라미터 배열/스칼라 → THREE uniform 값
function toUniformValue(v) {
  if (Array.isArray(v)) {
    if (v.length === 2) return new THREE.Vector2(v[0], v[1]);
    if (v.length === 3) return new THREE.Vector3(v[0], v[1], v[2]);
  }
  return v;
}
const cap = (s) => 'u' + s[0].toUpperCase() + s.slice(1);

// GRILL_PARAMS의 모든 키를 u+PascalCase uniform으로 매핑 (rawTint→uRawTint …)
function paramUniforms() {
  const u = {};
  for (const [key, value] of Object.entries(GRILL_PARAMS)) {
    u[cap(key)] = { value: toUniformValue(value) };
  }
  return u;
}

// ── 절차적 네기마 베이스 텍스처 ─────────────────────────────────
// 세로 꼬치: 대나무 꼬챙이 + 닭·대파 5조각(RECIPE 순서). 배경은 투명 → 셰이더가 실루엣을 남긴다.
// 셰이더가 굽기 때문에 여기 색은 "날것"(연분홍 닭·연녹색 대파)으로 둔다.
export function makeNegimaTexture() {
  // 꼬치 평면 비율(약 0.66)에 맞춘 크기 — 텍스처가 늘어나 보이지 않게.
  const W = 132;
  const H = 200;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);

  const cx = W / 2;
  const seg = 32; // 조각 높이
  const top = 18; // 첫 조각 상단
  const stickTop = 6;
  const stickBottom = top + RECIPE.length * seg + 14; // 아래로 손잡이

  // 꼬챙이 (조각 뒤)
  g.fillStyle = '#d8c187';
  roundRect(g, cx - 4, stickTop, 8, stickBottom - stickTop, 4);
  g.fill();
  g.fillStyle = 'rgba(120,96,48,0.5)';
  roundRect(g, cx - 4, stickTop, 3, stickBottom - stickTop, 3); // 왼쪽 음영
  g.fill();

  RECIPE.forEach((ingredient, i) => {
    const yc = top + i * seg + seg / 2;
    if (ingredient === INGREDIENT.CHICKEN) drawChicken(g, cx, yc);
    else drawLeek(g, cx, yc);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return { texture: tex, width: W, height: H };
}

function drawChicken(g, cx, yc) {
  const w = 90;
  const h = 30;
  // 살덩이 (연분홍, 세로 그라데이션)
  const grad = g.createLinearGradient(0, yc - h / 2, 0, yc + h / 2);
  grad.addColorStop(0, '#f0c6ab');
  grad.addColorStop(0.5, '#e6b193');
  grad.addColorStop(1, '#d99f80');
  g.fillStyle = grad;
  roundRect(g, cx - w / 2, yc - h / 2, w, h, 11);
  g.fill();
  // 지방·결 얼룩
  g.fillStyle = 'rgba(255,244,232,0.55)';
  blob(g, cx - 16, yc - 4, 7, 4);
  blob(g, cx + 18, yc + 4, 5, 3);
  g.fillStyle = 'rgba(190,120,96,0.45)';
  blob(g, cx + 4, yc - 6, 4, 2);
  // 외곽선
  g.strokeStyle = 'rgba(150,96,74,0.7)';
  g.lineWidth = 2;
  roundRect(g, cx - w / 2, yc - h / 2, w, h, 11);
  g.stroke();
}

function drawLeek(g, cx, yc) {
  const s = 30;
  // 대파 단면 (연녹색 둥근 사각)
  g.fillStyle = '#cfe0a6';
  roundRect(g, cx - s / 2, yc - s / 2, s, s, 8);
  g.fill();
  // 동심 링 (겹겹의 잎)
  const rings = [
    ['#b9d189', 0.72],
    ['#a6c473', 0.46],
  ];
  for (const [color, k] of rings) {
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    roundRect(g, cx - (s * k) / 2, yc - (s * k) / 2, s * k, s * k, 6 * k);
    g.stroke();
  }
  g.strokeStyle = 'rgba(110,140,70,0.7)';
  g.lineWidth = 2;
  roundRect(g, cx - s / 2, yc - s / 2, s, s, 8);
  g.stroke();
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function blob(g, x, y, rx, ry) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

// ── 재질 ────────────────────────────────────────────────────────
export async function createGrillMaterial() {
  // Three GLSL3가 #version·precision을 자동으로 붙이므로 원본 헤더는 제거한다.
  const fragBody = fragmentSource
    .replace(/^#version.*$/m, '')
    .replace(/^precision.*$/m, '');

  const { texture, width, height } = makeNegimaTexture();
  let ownedTexture = texture;

  const uniforms = {
    uTex: { value: texture },
    uTexSize: { value: new THREE.Vector2(width, height) },
    uDoneness: { value: 0 },
    uTime: { value: 0 },
    ...paramUniforms(),
  };
  // uTareAmount는 파라미터(tareAmount)에서 이미 왔다. 런타임에 바꾸고 싶으면 setTare로.

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: VERT,
    fragmentShader: fragBody,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return {
    material,
    uniforms,
    /** 익힘 0~1 (0=날것, 0.5=적정, 1=탄). 게임 로직이 계산해 넣는다. */
    setDoneness: (d) => { uniforms.uDoneness.value = d; },
    /** 숯불 깜빡임용 경과 시간(초). */
    setTime: (sec) => { uniforms.uTime.value = sec; },
    /** 타레 도포량 실시간 조정(선택). */
    setTare: (t) => { uniforms.uTareAmount.value = t; },
    /** Keep the approved source image and let GLSL change only its cooking colour. */
    setTexture: (nextTexture) => {
      if (!nextTexture || uniforms.uTex.value === nextTexture) return;
      if (ownedTexture) ownedTexture.dispose();
      ownedTexture = null;
      uniforms.uTex.value = nextTexture;
      uniforms.uTexSize.value.set(
        Number(nextTexture.image?.width ?? width),
        Number(nextTexture.image?.height ?? height),
      );
    },
    /** 런타임 튜너가 파라미터를 바꿀 때 uniform에 반영. */
    setParam: (key, value) => {
      const u = uniforms[cap(key)];
      if (!u) return;
      if (u.value && u.value.isVector2) u.value.set(value[0], value[1]);
      else if (u.value && u.value.isVector3) u.value.set(value[0], value[1], value[2]);
      else u.value = value;
    },
    dispose: () => { material.dispose(); ownedTexture?.dispose(); },
  };
}
