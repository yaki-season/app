// 그릴 화면 전용 WebGL2 렌더러. app/sources의 익힘 셰이더 스파이크를 재사용한다
// (SYS-001 §상세요구사항 12). 단, 단일 토글 대신 경과 시간 기반 연속 uDoneness를 받는다.
// 이 화면이 활성화된 동안에만 애니메이션 루프를 소유한다 — 다른 화면과 중복 루프를 만들지 않는다.

import { GRILL_PARAMS } from './grillShaderParams.js';
import { COOK_THRESHOLDS_SEC, DONENESS } from '../config/recipe.js';

async function loadText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 로드 실패 (${res.status})`);
  return res.text();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`));
    img.src = url;
  });
}

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`${label} 컴파일 실패:\n${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function link(gl, vsSrc, fsSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vsSrc, 'vertex shader'));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fsSrc, 'fragment shader'));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`program 링크 실패:\n${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

function createTexture(gl, img) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function setUniform(gl, location, value) {
  if (location == null) return;
  if (Array.isArray(value)) {
    if (value.length === 2) gl.uniform2fv(location, value);
    else if (value.length === 3) gl.uniform3fv(location, value);
    else throw new Error(`지원하지 않는 셰이더 파라미터 길이: ${value.length}`);
    return;
  }
  gl.uniform1f(location, value);
}

function applyShaderParams(gl, prog, params) {
  for (const [name, value] of Object.entries(params)) {
    const uniformName = `u${name[0].toUpperCase()}${name.slice(1)}`;
    setUniform(gl, gl.getUniformLocation(prog, uniformName), value);
  }
}

// 경과 초를 셰이더 uDoneness(0=날것, 0.5=Perfect, 1=탄 상태)로 매핑한다.
// 콘텐츠의 적정 구간 중심을 uDoneness=0.5로, 완전 탄 경계를 1로 맞춘다.
export function elapsedSecToUniform(elapsedSec) {
  const clamped = Math.max(0, elapsedSec);
  const perfectCenter = (COOK_THRESHOLDS_SEC[DONENESS.PERFECT] + COOK_THRESHOLDS_SEC[DONENESS.OVER]) / 2;
  const burnt = COOK_THRESHOLDS_SEC[DONENESS.BURNT];
  if (clamped <= perfectCenter) return (clamped / perfectCenter) * 0.5;
  const t = Math.min((clamped - perfectCenter) / (burnt - perfectCenter), 1);
  return 0.5 + t * 0.5;
}

/** 셰이더를 쓸 수 없을 때의 상태별 래스터 대체 렌더러 (ART-001 §예외조건 3).
 *  WebGL2가 없더라도 빈 캔버스를 보여주지 않는다 (SYS-001 §예외조건). */
export async function createRasterGrillRenderer(canvas, rasterUrls, classify) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스도 사용할 수 없는 환경입니다.');

  const entries = await Promise.all(
    Object.entries(rasterUrls).map(async ([state, url]) => [state, await loadImage(url)]),
  );
  const images = Object.fromEntries(entries);

  function render(nowMs, elapsedSec) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const px = Math.max(1, Math.round(canvas.clientWidth * dpr));
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (elapsedSec == null) return;
    // 덜 익음 구간은 시간에 따라 raw → cooking으로 한 번 더 나눠 보여준다
    const state = classify(elapsedSec) === 'under' && elapsedSec > 1.2 ? 'cooking' : classify(elapsedSec);
    const img = images[state] || images.raw;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  return { render, resize: () => {}, mode: 'raster' };
}

export async function createGrillRenderer(canvas, { textureUrl, vertUrl, fragUrl }) {
  // preserveDrawingBuffer: 합성 뒤에도 그린 내용을 남긴다. 이게 없으면 캔버스를
  // 다시 읽을 때 빈 이미지가 나와 QA-001 §시각 검증의 픽셀 검사를 할 수 없다.
  // 캔버스가 하나뿐이라 비용은 무시할 수준이다.
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    throw new Error('WebGL2를 사용할 수 없는 브라우저입니다.');
  }

  const [vsSrc, fsSrc, img] = await Promise.all([
    loadText(vertUrl),
    loadText(fragUrl),
    loadImage(textureUrl),
  ]);

  const prog = link(gl, vsSrc, fsSrc);
  gl.useProgram(prog);

  const tex = createTexture(gl, img);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);

  const u = {
    tex: gl.getUniformLocation(prog, 'uTex'),
    doneness: gl.getUniformLocation(prog, 'uDoneness'),
    tare: gl.getUniformLocation(prog, 'uTareAmount'),
    tareSeasoned: gl.getUniformLocation(prog, 'uTareSeasoned'),
    time: gl.getUniformLocation(prog, 'uTime'),
    texSize: gl.getUniformLocation(prog, 'uTexSize'),
  };
  gl.uniform1i(u.tex, 0);
  gl.uniform2f(u.texSize, img.width, img.height);
  applyShaderParams(gl, prog, GRILL_PARAMS);

  gl.bindVertexArray(gl.createVertexArray());
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const size = canvas.clientWidth;
    const px = Math.max(1, Math.round(size * dpr));
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // elapsedSec: null이면 그리지 않는다 (그릴이 비어 있음)
  // seasoned: 이 꼬치에 타레를 발랐는가(0/1). 소금 꼬치와 구분되는 갈색 코팅을 켠다.
  function render(nowMs, elapsedSec, tare = GRILL_PARAMS.tareAmount, seasoned = GRILL_PARAMS.tareSeasoned) {
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (elapsedSec == null) return;
    gl.uniform1f(u.doneness, elapsedSecToUniform(elapsedSec));
    gl.uniform1f(u.tare, tare);
    gl.uniform1f(u.tareSeasoned, seasoned ? 1 : 0);
    gl.uniform1f(u.time, nowMs / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return { render, resize, mode: 'webgl2' };
}
