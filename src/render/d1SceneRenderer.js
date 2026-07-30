// D1 단일 손님 플레이 씬 렌더러. productionRenderer와 같은 모델(단일 렌더러·rAF 하나, 같은 PLAYER_EYE에서
// 시선만 달리하는 화면 프리셋, 화면 전환 시선 트윈)을 따르되, 손님 화면은 승인 D1 아트를 깊이 이미지
// 레이어로 합성하고 조립·그릴·드링크는 더미 도형으로 구성한다. game.html(6석) 회귀를 피하려 별도 모듈이다.

import * as THREE from 'three';
import { makeCamera, billboard, lerp } from './sceneMath.js';
import { PLAYER_EYE, LAYER_Z, OBJECTS, SCREENS, SCREEN_BY_ID } from '../config/d1Layout.js';
import { runtimeAssetUrl } from '../assets/runtimeAssetResolver.js';

const FULL = { x: 0, y: 0, width: 1, height: 1 };
const COVER = 1.3; // 창 비율이 16:9와 달라도 아트 가장자리가 드러나지 않게 여유

export function createD1SceneRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setClearColor(0x0f0b08, 1);
  const scene = new THREE.Scene();
  const loader = new THREE.TextureLoader();
  let pending = 0;
  let errored = 0;
  const texCache = new Map();
  function texture(url) {
    const resolved = runtimeAssetUrl(url); // 매니페스트 URL → 정적 서버 경로(/public/assets)
    if (texCache.has(resolved)) return texCache.get(resolved);
    pending += 1;
    const tex = loader.load(resolved, () => { pending -= 1; }, undefined, () => { pending -= 1; errored += 1; });
    tex.colorSpace = THREE.SRGBColorSpace;
    texCache.set(resolved, tex);
    return tex;
  }

  const eye = new THREE.Vector3(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
  const lookOf = (s) => new THREE.Vector3(s.look.x, s.look.y, s.look.z);
  const presetCam = {};
  for (const s of SCREENS) presetCam[s.id] = makeCamera(eye, lookOf(s));

  const screenGroups = {}; // screenId → [mesh]
  const objectMesh = {}; // key → mesh (조작 대상 + 스왑 가능한 이미지)
  const interactionMesh = {}; // key → visual과 분리된 투명 hitRect mesh

  function buildObject(cam, key) {
    const def = OBJECTS[key];
    if (def.kind === 'image') {
      const z = LAYER_Z[def.z];
      const mat = new THREE.MeshBasicMaterial({ map: texture(def.url), transparent: !def.opaque, depthTest: false, depthWrite: false });
      const mesh = billboard(cam, FULL, z, mat);
      mesh.scale.multiplyScalar(COVER);
      mesh.renderOrder = key === 'custBg' ? 0 : key === 'custCustomer' ? 1 : 2; // painter 순서: 배경<손님<카운터
      mesh.userData.objectKey = key;
      return mesh;
    }
    const z = LAYER_Z[def.layer];
    const isGrill = def.kind === 'grill';
    const isHot = def.kind === 'hotspot';
    const mat = new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: isGrill || isHot,
      opacity: isHot ? 0.28 : 1,
      depthWrite: !isGrill,
    });
    const rect = def.kind === 'fullframe' ? FULL : def.rect;
    const mesh = billboard(cam, rect, z, mat);
    mesh.renderOrder = isHot ? 100 : -z;
    mesh.userData.objectKey = key;
    return mesh;
  }

  function buildInteraction(cam, key) {
    const def = OBJECTS[key];
    if (!def.hitRect) return null;
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      colorWrite: false,
    });
    const mesh = billboard(cam, def.hitRect, LAYER_Z.interactive + 0.01, mat);
    mesh.renderOrder = 200;
    mesh.userData.objectKey = key;
    mesh.userData.interactionTarget = true;
    return mesh;
  }

  for (const s of SCREENS) {
    const cam = presetCam[s.id];
    const group = [];
    for (const key of s.objects) {
      const mesh = buildObject(cam, key);
      mesh.visible = s.id === SCREENS[0].id;
      scene.add(mesh);
      group.push(mesh);
      if (OBJECTS[key].kind !== 'fullframe') objectMesh[key] = mesh; // sbg만 제외
      const hit = buildInteraction(cam, key);
      if (hit) {
        hit.visible = mesh.visible;
        scene.add(hit);
        group.push(hit);
        interactionMesh[key] = hit;
      }
    }
    screenGroups[s.id] = group;
  }

  function setActiveScreenObjects(screenId) {
    for (const [id, group] of Object.entries(screenGroups)) {
      const show = id === screenId;
      for (const mesh of group) mesh.visible = show;
    }
  }

  // 손님 아트 텍스처 교체 (phase 구동).
  function setCustomerTexture(url) {
    const mesh = objectMesh.custCustomer;
    if (!mesh) return;
    mesh.material.map = texture(url);
    mesh.material.needsUpdate = true;
  }

  // ── 라이브 카메라 + 시선 트윈 ──
  let activeId = SCREENS[0].id;
  const currentLook = lookOf(SCREEN_BY_ID[activeId]);
  const camera = makeCamera(eye, currentLook);
  let lookTween = null;

  function goToScreen(screenId, nowMs, transitionMs) {
    activeId = screenId;
    setActiveScreenObjects(screenId);
    const to = lookOf(SCREEN_BY_ID[screenId]);
    lookTween = { from: currentLook.clone(), to, startMs: nowMs, endMs: nowMs + transitionMs };
  }
  function tickCamera(nowMs) {
    if (!lookTween) return;
    const span = lookTween.endMs - lookTween.startMs;
    const t = span > 0 ? Math.min(1, (nowMs - lookTween.startMs) / span) : 1;
    const e = 1 - Math.pow(1 - t, 3);
    currentLook.lerpVectors(lookTween.from, lookTween.to, e);
    camera.lookAt(currentLook);
    if (t >= 1) lookTween = null;
  }

  let lastW = 0;
  let lastH = 0;
  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === lastW && height === lastH) return;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = height > 0 ? width / height : 16 / 9;
    camera.updateProjectionMatrix();
    lastW = width;
    lastH = height;
  }
  function renderFrame(nowMs) {
    tickCamera(nowMs);
    resize();
    renderer.render(scene, camera);
  }

  function projectToScreen(world) {
    const v = world.clone().project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  }

  return {
    scene,
    camera,
    renderer,
    objectMesh,
    interactionMesh,
    setObjectVisible: (key, visible) => {
      if (objectMesh[key]) objectMesh[key].visible = visible;
      if (interactionMesh[key]) interactionMesh[key].visible = visible;
    },
    presetCam,
    activeScreenId: () => activeId,
    setCustomerTexture,
    goToScreen,
    renderFrame,
    resize,
    projectToScreen,
    texturesReady: () => pending === 0,
    textureErrors: () => errored,
    dispose: () => renderer.dispose(),
  };
}
