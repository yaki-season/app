// 프로덕션 영업 화면 렌더러. Three.js 렌더러 하나·rAF 하나(SYS-002 §33).
//
// 모든 화면은 같은 PLAYER_EYE에서 시선(look)만 달리하는 고정 원근 프리셋이다(§68). 각 오브젝트는
// 자신이 속한 화면의 프리셋 카메라에 빌보드로 놓이고, 활성 화면의 오브젝트만 보인다(§69). 화면 전환은
// 라이브 카메라의 시선을 현재값→목표 프리셋으로 lerp하며, 재요청 시 현재값에서 다시 시작해 수렴한다(§104).

import * as THREE from 'three';
import { makeCamera, billboard, worldAtScreen, anchorToWorld, lerp, ASPECT, TAN_HALF } from './sceneMath.js';
import { PLAYER_EYE, LAYER_Z, OBJECTS, SCREENS, SCREEN_BY_ID, SEAT_IDS, SEAT_ACTOR_MOOD, SEAT_ACTOR_TEXTURE, SEAT_ACTOR_UV, computeSeats, DEFAULT_SEAT_CAP } from '../config/screenLayout.js';

export function createProductionRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: false });
  renderer.setClearColor(0x0f0b08, 1);
  const scene = new THREE.Scene();

  // 승인 아트 텍스처 (있을 때만). 없거나 실패해도 스테이션은 더미로 동작한다.
  const loader = new THREE.TextureLoader();
  const texCache = new Map();
  function texture(url) {
    if (texCache.has(url)) return texCache.get(url);
    const tex = loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    texCache.set(url, tex);
    return tex;
  }
  // PlaneGeometry(1 세그먼트) UV를 서브렉트로 크롭 (풀프레임 아트에서 인물만 잘라 쓰기).
  function cropUV(geo, { u0, v0, u1, v1 }) {
    const uv = geo.attributes.uv;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
  }
  const COVER = 1.3; // 이미지 레이어가 전환 중에도 화면을 덮도록 여유

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
    // 승인 아트 이미지 레이어 (배경·카운터 등 풀프레임). painter 순서(def.order)로 합성.
    if (def.kind === 'image') {
      const z = LAYER_Z[def.layer];
      const mat = new THREE.MeshBasicMaterial({ map: texture(def.url), transparent: !def.opaque, depthTest: false, depthWrite: false });
      const mesh = billboard(cam, def.full ? { x: 0, y: 0, width: 1, height: 1 } : def.rect, z, mat);
      if (def.full) mesh.scale.multiplyScalar(COVER);
      mesh.renderOrder = def.order ?? 0;
      mesh.userData.objectKey = key;
      return mesh;
    }
    const z = LAYER_Z[def.layer];
    const mat = new THREE.MeshBasicMaterial({ color: def.color, transparent: def.kind === 'grill', depthWrite: def.kind !== 'grill' });
    const rect = def.kind === 'fullframe' ? { x: 0, y: 0, width: 1, height: 1 } : def.rect;
    const mesh = billboard(cam, rect, z, mat);
    mesh.renderOrder = -z; // 먼 것 먼저
    mesh.userData.objectKey = key;
    return mesh;
  }

  const seatBaseMesh = {}; // seatId → 좌석 표식 mesh
  const seatActorMesh = {}; // seatId → 손님 액터 mesh
  const seatBubbleWorld = {}; // seatId → 말풍선 앵커 월드 좌표
  const inactiveSeats = new Set(); // 현재 좌석 수(capacity)를 넘어 비활성인 좌석
  let seatCam = null; // 손님 화면 프리셋 카메라 (좌석 재배치용)

  for (const s of SCREENS) {
    const cam = presetCam[s.id];
    const group = [];
    for (const key of s.objects) {
      const mesh = buildObject(cam, key);
      mesh.visible = s.id === SCREENS[0].id; // 첫 화면만 보이게 시작
      scene.add(mesh);
      group.push(mesh);
      if (OBJECTS[key].kind !== 'fullframe' && OBJECTS[key].kind !== 'image') objectMesh[key] = mesh; // 배경·아트 레이어 제외
    }
    // 좌석: 손님 액터(카운터 뒤) + serve 대상(카운터 위). 최대 좌석 수만큼 만들고 capacity로 배치·표시.
    if (s.seats) {
      seatCam = cam;
      for (const seatId of SEAT_IDS) {
        const base = billboard(cam, { x: 0, y: 0, width: 0.05, height: 0.03 }, LAYER_Z.fixture, new THREE.MeshBasicMaterial({ color: 0x574433 }));
        base.renderOrder = -LAYER_Z.fixture + 0.5;
        base.userData.seatId = seatId;
        base.visible = false;
        scene.add(base); group.push(base); seatBaseMesh[seatId] = base;

        const actorMat = new THREE.MeshBasicMaterial({ color: SEAT_ACTOR_MOOD.waiting });
        if (SEAT_ACTOR_TEXTURE) { actorMat.map = texture(SEAT_ACTOR_TEXTURE); actorMat.transparent = true; actorMat.color.setHex(0xffffff); }
        const actor = billboard(cam, { x: 0, y: 0, width: 0.05, height: 0.05 }, LAYER_Z.actor, actorMat);
        actor.renderOrder = -LAYER_Z.actor;
        actor.visible = false;
        actor.userData.seatId = seatId;
        scene.add(actor); group.push(actor); seatActorMesh[seatId] = actor;

        const serve = billboard(cam, { x: 0, y: 0, width: 0.05, height: 0.05 }, LAYER_Z.interactive, new THREE.MeshBasicMaterial({ color: 0x584636, transparent: true, opacity: 0.85 }));
        serve.renderOrder = 100;
        serve.visible = false;
        serve.userData.objectKey = `seatServe:${seatId}`;
        serve.userData.seatId = seatId;
        scene.add(serve); group.push(serve); objectMesh[`seatServe:${seatId}`] = serve;
      }
    }
    screenGroups[s.id] = group;
  }

  function setActiveScreenObjects(screenId) {
    for (const [id, group] of Object.entries(screenGroups)) {
      const show = id === screenId;
      for (const mesh of group) {
        mesh.visible = show && !(mesh.userData.seatId && inactiveSeats.has(mesh.userData.seatId));
      }
    }
  }

  // 빌보드를 새 rect로 제자리 재배치(지오메트리·위치 갱신). 좌석 확장 시 좌석 재배치에 쓴다.
  function placeBillboard(mesh, cam, rect, z) {
    const center = worldAtScreen(cam, rect.x + rect.width / 2, rect.y + rect.height / 2, z);
    const dist = center.distanceTo(cam.position);
    const fullH = 2 * dist * TAN_HALF;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(fullH * ASPECT * rect.width, fullH * rect.height);
    mesh.position.copy(center);
  }

  // 좌석 수(capacity)에 맞춰 활성 좌석을 카운터에 균등 재배치하고 나머지는 숨긴다(seatCap 업그레이드).
  function setSeatCapacity(cap) {
    if (!seatCam) return;
    const seats = computeSeats(cap);
    inactiveSeats.clear();
    SEAT_IDS.forEach((seatId, i) => {
      if (i < seats.length) {
        const seat = seats[i];
        placeBillboard(seatBaseMesh[seatId], seatCam, { x: seat.serve.x, y: 0.50, width: seat.serve.width, height: 0.03 }, LAYER_Z.fixture);
        placeBillboard(seatActorMesh[seatId], seatCam, seat.actor, LAYER_Z.actor);
        if (SEAT_ACTOR_TEXTURE && SEAT_ACTOR_UV) cropUV(seatActorMesh[seatId].geometry, SEAT_ACTOR_UV);
        placeBillboard(objectMesh[`seatServe:${seatId}`], seatCam, seat.serve, LAYER_Z.interactive);
        seatBubbleWorld[seatId] = worldAtScreen(seatCam, seat.bubble.x, seat.bubble.y, LAYER_Z.actor);
      } else {
        inactiveSeats.add(seatId);
      }
    });
    setActiveScreenObjects(activeId);
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

  // 월드 좌표 → 화면 픽셀 (라이브 카메라 기준). DOM 오버레이(말풍선·게이지) 배치용.
  function projectToScreen(world) {
    const v = world.clone().project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  }

  setSeatCapacity(DEFAULT_SEAT_CAP); // 초기 좌석 배치(기본 6석). activeId 정의 후 호출.

  return {
    scene,
    camera,
    renderer,
    objectMesh,
    seatActorMesh,
    seatBaseMesh,
    seatBubbleWorld,
    setSeatCapacity,
    hasSeatActorArt: () => !!SEAT_ACTOR_TEXTURE,
    // 좌석 손님 아트 텍스처 교체 (phase 구동). UV 크롭은 지오메트리에 남는다.
    setSeatActorTexture: (seatId, url) => {
      const a = seatActorMesh[seatId];
      if (!a || !SEAT_ACTOR_TEXTURE) return;
      const tex = texture(url);
      if (a.material.map !== tex) { a.material.map = tex; a.material.needsUpdate = true; }
    },
    presetCam,
    activeScreenId: () => activeId,
    goToScreen,
    renderFrame,
    resize,
    performanceStats,
    anchorFor,
    projectToScreen,
    quaternionFor: (screenId) => presetCam[screenId].quaternion.clone(),
    dispose: () => renderer.dispose(),
  };
}
