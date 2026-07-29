// 프로덕션 영업 화면 렌더러. Three.js 렌더러 하나·rAF 하나(SYS-002 §33).
//
// 모든 화면은 같은 PLAYER_EYE에서 시선(look)만 달리하는 고정 원근 프리셋이다(§68). 각 오브젝트는
// 자신이 속한 화면의 프리셋 카메라에 빌보드로 놓이고, 활성 화면의 오브젝트만 보인다(§69). 화면 전환은
// 라이브 카메라의 시선을 현재값→목표 프리셋으로 lerp하며, 재요청 시 현재값에서 다시 시작해 수렴한다(§104).

import * as THREE from 'three';
import { makeCamera, billboard, anchorToWorld, lerp } from './sceneMath.js';
import { PLAYER_EYE, LAYER_Z, OBJECTS, SCREENS, SCREEN_BY_ID } from '../config/screenLayout.js';

export function createProductionRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: false });
  renderer.setClearColor(0x0f0b08, 1);
  const scene = new THREE.Scene();

  const eye = new THREE.Vector3(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
  const lookOf = (s) => new THREE.Vector3(s.look.x, s.look.y, s.look.z);

  // 화면별 고정 프리셋 카메라 (오브젝트 배치 + 도착 포즈 기준)
  const presetCam = {};
  for (const s of SCREENS) presetCam[s.id] = makeCamera(eye, lookOf(s));

  // 오브젝트를 화면별로 만든다. 같은 key가 여러 화면에 있으면(bg) 화면마다 별도 평면을 둔다.
  const screenGroups = {}; // screenId → [mesh]
  const objectMesh = {}; // key → mesh (조작 대상은 화면 유일 → 모호하지 않음)

  function buildObject(cam, key) {
    const def = OBJECTS[key];
    const z = LAYER_Z[def.layer];
    const mat = new THREE.MeshBasicMaterial({ color: def.color, transparent: def.kind === 'grill', depthWrite: def.kind !== 'grill' });
    const rect = def.kind === 'fullframe' ? { x: 0, y: 0, width: 1, height: 1 } : def.rect;
    const mesh = billboard(cam, rect, z, mat);
    mesh.renderOrder = -z; // 먼 것 먼저
    mesh.userData.objectKey = key;
    return mesh;
  }

  for (const s of SCREENS) {
    const cam = presetCam[s.id];
    const group = [];
    for (const key of s.objects) {
      const mesh = buildObject(cam, key);
      mesh.visible = s.id === SCREENS[0].id; // 첫 화면만 보이게 시작
      scene.add(mesh);
      group.push(mesh);
      if (OBJECTS[key].kind !== 'fullframe') objectMesh[key] = mesh; // bg 제외
    }
    screenGroups[s.id] = group;
  }

  function setActiveScreenObjects(screenId) {
    for (const [id, group] of Object.entries(screenGroups)) {
      const show = id === screenId;
      for (const mesh of group) mesh.visible = show;
    }
  }

  // ── 라이브 카메라 + 시선 트윈 ─────────────────────────────
  let activeId = SCREENS[0].id;
  const currentLook = lookOf(SCREEN_BY_ID[activeId]);
  const camera = makeCamera(eye, currentLook);
  let lookTween = null; // { from:Vector3, to:Vector3, startMs, endMs }

  // 화면 전환: 시선을 현재값에서 목표 프리셋으로 트윈(수렴). 오브젝트는 즉시 활성 화면으로 토글.
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
    const e = 1 - Math.pow(1 - t, 3); // ease-out
    currentLook.lerpVectors(lookTween.from, lookTween.to, e);
    camera.lookAt(currentLook);
    if (t >= 1) lookTween = null;
  }

  // ── 프레임 통계 ───────────────────────────────────────────
  const frameDurations = [];
  let lastFrameAt = null;
  let frameCount = 0;

  let lastW = 0;
  let lastH = 0;
  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === lastW && height === lastH) return;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = 16 / 9;
    camera.updateProjectionMatrix();
    lastW = width;
    lastH = height;
  }

  function renderFrame(nowMs) {
    tickCamera(nowMs);
    resize();
    renderer.render(scene, camera);
    if (lastFrameAt != null) {
      const d = nowMs - lastFrameAt;
      if (d > 0 && d < 250) {
        frameDurations.push(d);
        if (frameDurations.length > 120) frameDurations.shift();
      }
    }
    lastFrameAt = nowMs;
    frameCount += 1;
  }

  function performanceStats() {
    const avg = frameDurations.length
      ? frameDurations.reduce((s, v) => s + v, 0) / frameDurations.length
      : 0;
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      dpr: renderer.getPixelRatio(),
      averageFrameMs: avg,
      fps: avg > 0 ? 1000 / avg : 0,
      canvasCount: document.querySelectorAll('canvas').length,
      renderLoopCount: 1,
    };
  }

  // 조작 대상 배치·화면 좌표 (game.js 핫스팟·레이캐스트용). 활성 프리셋 카메라 기준.
  function anchorFor(key) {
    const def = OBJECTS[key];
    const screen = SCREENS.find((s) => s.objects.includes(key));
    const cam = presetCam[screen.id];
    const c = def.rect;
    return anchorToWorld(cam, c.x + c.width / 2, c.y + c.height / 2, LAYER_Z[def.layer]);
  }

  return {
    scene,
    camera,
    renderer,
    objectMesh,
    presetCam,
    activeScreenId: () => activeId,
    goToScreen,
    renderFrame,
    resize,
    performanceStats,
    anchorFor,
    quaternionFor: (screenId) => presetCam[screenId].quaternion.clone(),
    dispose: () => renderer.dispose(),
  };
}
