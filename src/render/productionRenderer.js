// 프로덕션 영업 화면 렌더러. Three.js 렌더러 하나·rAF 하나(SYS-002 §33).
//
// 모든 화면은 같은 PLAYER_EYE에서 시선(look)만 달리하는 고정 원근 프리셋이다(§68). 각 오브젝트는
// 자신이 속한 화면의 프리셋 카메라에 빌보드로 놓이고, 활성 화면의 오브젝트만 보인다(§69). 화면 전환은
// 라이브 카메라의 시선을 현재값→목표 프리셋으로 lerp하며, 재요청 시 현재값에서 다시 시작해 수렴한다(§104).

import * as THREE from 'three';
import { makeCamera, billboard, worldAtScreen, anchorToWorld, lerp, ASPECT, TAN_HALF } from './sceneMath.js';
import { PLAYER_EYE, LAYER_Z, OBJECTS, SCREENS, SCREEN_BY_ID, SEAT_IDS, SEAT_ACTOR_MOOD, SEAT_ACTOR_TEXTURE, SEAT_ACTOR_UV, computeSeats, DEFAULT_SEAT_CAP, computeGrillSlots, GRILL_SLOT_KEYS } from '../config/screenLayout.js';
import { runtimeAssetUrl } from '../assets/runtimeAssetResolver.js';

export function createProductionRenderer(canvas, { runtimeAssets = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: false });
  renderer.setClearColor(0x0f0b08, 1);
  const scene = new THREE.Scene();

  // 승인 아트 텍스처 (있을 때만). 없거나 실패해도 스테이션은 더미로 동작한다.
  const loader = new THREE.TextureLoader();
  const texCache = new Map();
  let pendingTextures = 0;
  let textureErrorCount = 0;
  // 매니페스트 URL(/assets/…)을 정적 서버 경로(/src에서 /public/assets/…)로 해석해 로드한다.
  function texture(url) {
    const resolved = runtimeAssetUrl(url);
    if (texCache.has(resolved)) return texCache.get(resolved);
    pendingTextures += 1;
    const tex = loader.load(
      resolved,
      () => { pendingTextures -= 1; },
      undefined,
      () => { pendingTextures -= 1; textureErrorCount += 1; },
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    texCache.set(resolved, tex);
    return tex;
  }
  // PlaneGeometry(1 세그먼트) UV를 서브렉트로 크롭 (풀프레임 아트에서 인물만 잘라 쓰기).
  function cropUV(geo, { u0, v0, u1, v1 }) {
    const uv = geo.attributes.uv;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
  }
  const runtimeAssetById = new Map(
    Object.values(runtimeAssets ?? {})
      .filter((asset) => asset?.id && asset?.url)
      .map((asset) => [asset.id, asset]),
  );
  // companionRole이 있으면 같은 stable ID의 승인 companion 래스터를 쓴다(레버 상태·잔 덱 등).
  // 미등록 role은 승인 없는 아트가 조용히 새어들지 않도록 즉시 실패시킨다.
  function runtimeUrlForId(stableAssetId, companionRole = null) {
    const asset = runtimeAssetById.get(stableAssetId);
    if (!asset) throw new Error(`승인 runtime asset resolver 누락: ${stableAssetId}`);
    if (!companionRole) return asset.url;
    const companion = (asset.companions ?? []).find((c) => c.role === companionRole);
    if (!companion) throw new Error(`승인 companion 누락: ${stableAssetId}#${companionRole}`);
    return companion.url;
  }

  const eye = new THREE.Vector3(PLAYER_EYE.x, PLAYER_EYE.y, PLAYER_EYE.z);
  const lookOf = (s) => new THREE.Vector3(s.look.x, s.look.y, s.look.z);

  // 화면별 고정 프리셋 카메라 (오브젝트 배치 + 도착 포즈 기준)
  const presetCam = {};
  for (const s of SCREENS) presetCam[s.id] = makeCamera(eye, lookOf(s));

  // 오브젝트를 화면별로 만든다. 같은 key가 여러 화면에 있으면(bg) 화면마다 별도 평면을 둔다.
  const screenGroups = {}; // screenId → [mesh]
  const objectMesh = {}; // key → mesh (조작 대상은 화면 유일 → 모호하지 않음)
  const artMesh = {}; // key → 승인 이미지 mesh (상태 texture 교체·가시성 제어)
  const interactionMesh = {}; // key → visual과 분리된 투명 hitRect mesh
  const inactiveObjects = new Set(GRILL_SLOT_KEYS);

  function buildObject(cam, key) {
    const def = OBJECTS[key];
    // 승인 아트 이미지 레이어 (배경·카운터 등 풀프레임). painter 순서(def.order)로 합성.
    if (def.kind === 'image') {
      const z = LAYER_Z[def.layer];
      const mat = new THREE.MeshBasicMaterial({ map: texture(runtimeUrlForId(def.stableAssetId, def.companionRole)), transparent: !def.opaque, depthTest: false, depthWrite: false });
      const mesh = billboard(cam, def.full ? { x: 0, y: 0, width: 1, height: 1 } : def.rect, z, mat);
      if (def.full) {
        const scale = def.imageScale ?? 1;
        mesh.scale.set(def.imageScaleX ?? scale, def.imageScaleY ?? scale, 1);
      }
      if (def.imageOffsetY) mesh.position.copy(worldAtScreen(cam, 0.5, 0.5 + def.imageOffsetY, z));
      mesh.renderOrder = def.order ?? 0;
      mesh.userData.objectKey = key;
      return mesh;
    }
    const z = LAYER_Z[def.layer];
    const isHotspot = def.kind === 'hotspot';
    const isInvisible = isHotspot || def.invisible === true;
    const mat = new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: def.kind === 'grill' || isInvisible,
      opacity: isInvisible ? 0 : 1,
      colorWrite: !isInvisible,
      depthWrite: def.kind !== 'grill' && !isInvisible,
      // pgSlot은 투명 시각면과 raycast 입력면을 함께 쓴다. 꼬치를 180° 뒤집은 뒤에도
      // 뒷면 클릭으로 개별 회수할 수 있도록 양면 raycast를 허용한다.
      side: def.prodGrillSlot ? THREE.DoubleSide : THREE.FrontSide,
    });
    const rect = def.kind === 'fullframe' ? { x: 0, y: 0, width: 1, height: 1 } : def.rect;
    const mesh = billboard(cam, rect, z, mat);
    mesh.renderOrder = -z; // 먼 것 먼저
    mesh.userData.objectKey = key;
    mesh.userData.runtimeControlled = def.prodGrillSlot === true;
    // 시각 전용 레이어는 레이캐스트 대상이 아니다(레버 등 실제 조작 대상을 가리지 않도록).
    mesh.userData.decorative = def.decorative === true;
    return mesh;
  }

  const seatBaseMesh = {}; // seatId → 서빙된 네기마 접시 mesh (legacy API 이름 유지)
  const seatBeerMesh = {}; // seatId → 서빙된 생맥주잔 mesh
  const seatEmptyDishMesh = {}; // seatId → 퇴장 뒤 정리 대상 빈 식기 mesh
  const seatCleanupOverlayMesh = {}; // seatId → 3초 홀드 중 행주 왕복 overlay
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
  const seatActorMesh = {}; // seatId → 손님 액터 mesh
  const seatBubbleWorld = {}; // seatId → 말풍선 앵커 월드 좌표
  const seatCleanupWorld = {}; // seatId → 빈 식기 위 원형 정리 게이지 앵커
  const inactiveSeats = new Set(); // 현재 좌석 수(capacity)를 넘어 비활성인 좌석
  let seatCam = null; // 손님 화면 프리셋 카메라 (좌석 재배치용)
  let seatCapacity = DEFAULT_SEAT_CAP;
  let seatLayoutMode = 'tsukioka';

  for (const s of SCREENS) {
    const cam = presetCam[s.id];
    const group = [];
    for (const key of s.objects) {
      const mesh = buildObject(cam, key);
      mesh.visible = s.id === SCREENS[0].id; // 첫 화면만 보이게 시작
      scene.add(mesh);
      group.push(mesh);
      if (OBJECTS[key].kind === 'image') artMesh[key] = mesh;
      else if (OBJECTS[key].kind !== 'fullframe') objectMesh[key] = mesh;
      const hit = buildInteraction(cam, key);
      if (hit) {
        hit.visible = mesh.visible;
        scene.add(hit);
        group.push(hit);
        interactionMesh[key] = hit;
      }
    }
    // 좌석: 손님 액터(카운터 뒤) + serve 대상(카운터 위). 최대 좌석 수만큼 만들고 capacity로 배치·표시.
    if (s.seats) {
      seatCam = cam;
      for (const seatId of SEAT_IDS) {
        // 승인 카운터 아트가 실제 상판을 제공하므로 예전 개발용 갈색 좌석 막대는 투명 hit 보조물로만 남긴다.
        const servingCompanions = runtimeAssets?.SERVING_PLATE?.companions ?? [];
        const plateUrl = servingCompanions.find(({ role }) => role === 'served-negima')?.url
          ?? runtimeAssets?.SERVING_PLATE?.url;
        const base = billboard(cam, { x: 0, y: 0, width: 0.05, height: 0.03 }, LAYER_Z.fixture, new THREE.MeshBasicMaterial({
          ...(plateUrl ? { map: texture(plateUrl), color: 0xffffff } : {}),
          transparent: true,
          opacity: plateUrl ? 1 : 0,
          colorWrite: !!plateUrl,
          depthWrite: false,
        }));
        // 전경 카운터(order 50) 위에 놓이는 실제 상판 소품이다.
        base.renderOrder = 60;
        base.userData.seatId = seatId;
        base.userData.runtimeControlled = true;
        base.visible = false;
        scene.add(base); group.push(base); seatBaseMesh[seatId] = base;

        const beerUrl = servingCompanions.find(({ role }) => role === 'served-beer')?.url;
        const beer = billboard(cam, { x: 0, y: 0, width: 0.05, height: 0.05 }, LAYER_Z.fixture - 0.005, new THREE.MeshBasicMaterial({
          ...(beerUrl ? { map: texture(beerUrl), color: 0xffffff } : {}),
          transparent: true,
          opacity: beerUrl ? 1 : 0,
          colorWrite: !!beerUrl,
          depthWrite: false,
        }));
        beer.renderOrder = 61;
        beer.userData.seatId = seatId;
        beer.userData.runtimeControlled = true;
        beer.visible = false;
        scene.add(beer); group.push(beer); seatBeerMesh[seatId] = beer;

        const emptyDishUrl = runtimeAssets?.EMPTY_DISH_SET?.url;
        const emptyDishes = billboard(cam, { x: 0, y: 0, width: 0.05, height: 0.04 }, LAYER_Z.fixture - 0.01, new THREE.MeshBasicMaterial({
          ...(emptyDishUrl ? { map: texture(emptyDishUrl), color: 0xffffff } : {}),
          transparent: true,
          opacity: emptyDishUrl ? 1 : 0,
          colorWrite: !!emptyDishUrl,
          depthWrite: false,
        }));
        emptyDishes.renderOrder = 62;
        emptyDishes.userData.seatId = seatId;
        emptyDishes.userData.runtimeControlled = true;
        emptyDishes.visible = false;
        scene.add(emptyDishes); group.push(emptyDishes); seatEmptyDishMesh[seatId] = emptyDishes;

        const cleanupUrl = runtimeAssets?.CLEANUP_OVERLAY?.url;
        const cleanupOverlay = billboard(cam, { x: 0, y: 0, width: 0.05, height: 0.03 }, LAYER_Z.fixture - 0.02, new THREE.MeshBasicMaterial({
          ...(cleanupUrl ? { map: texture(cleanupUrl), color: 0xffffff } : {}),
          transparent: true,
          opacity: cleanupUrl ? 1 : 0,
          colorWrite: !!cleanupUrl,
          depthWrite: false,
        }));
        if (cleanupUrl) cropUV(cleanupOverlay.geometry, { u0: 0, v0: 0, u1: 0.5, v1: 1 });
        cleanupOverlay.renderOrder = 63;
        cleanupOverlay.userData.seatId = seatId;
        cleanupOverlay.userData.runtimeControlled = true;
        cleanupOverlay.visible = false;
        scene.add(cleanupOverlay); group.push(cleanupOverlay); seatCleanupOverlayMesh[seatId] = cleanupOverlay;

        const actorMat = new THREE.MeshBasicMaterial({ color: SEAT_ACTOR_MOOD.waiting });
        if (SEAT_ACTOR_TEXTURE) { actorMat.map = texture(SEAT_ACTOR_TEXTURE); actorMat.transparent = true; actorMat.color.setHex(0xffffff); }
        const actor = billboard(cam, { x: 0, y: 0, width: 0.05, height: 0.05 }, LAYER_Z.actor, actorMat);
        // 손님은 의자 등받이(order 10) 앞에, 카운터 상판(order 50) 뒤에 선다.
        // z값만 사용하면 투명 좌석 PNG의 등받이가 손님을 다시 덮으므로 명시적으로 고정한다.
        actor.renderOrder = OBJECTS.custTsukioka.order;
        actor.visible = false;
        actor.userData.seatId = seatId;
        actor.userData.runtimeControlled = true;
        scene.add(actor); group.push(actor); seatActorMesh[seatId] = actor;

        // 주문·서빙은 시각 좌석과 분리된 투명 raycast 대상으로 처리한다.
        const serve = billboard(cam, { x: 0, y: 0, width: 0.05, height: 0.05 }, LAYER_Z.interactive, new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
          colorWrite: false,
        }));
        serve.renderOrder = 100;
        serve.visible = false;
        serve.userData.objectKey = `seatServe:${seatId}`;
        serve.userData.seatId = seatId;
        serve.userData.runtimeControlled = true; // 점유·phase는 영업 어댑터가 소유한다
        scene.add(serve); group.push(serve); objectMesh[`seatServe:${seatId}`] = serve;
      }
    }
    screenGroups[s.id] = group;
  }

  function setActiveScreenObjects(screenId) {
    for (const [id, group] of Object.entries(screenGroups)) {
      const show = id === screenId;
      for (const mesh of group) {
        // 좌석 손님·serve와 그릴 칸은 영업 상태 어댑터가 점유·phase별로 직접 제어한다.
        // 화면 활성화가 빈 좌석까지 다시 켜면 매 프레임 숨김/표시가 교차해 깜빡인다.
        // 반대로 좌석 base는 어댑터가 켜주지 않으므로 화면 활성화가 계속 소유한다.
        if (mesh.userData.runtimeControlled) {
          if (!show || inactiveSeats.has(mesh.userData.seatId)) mesh.visible = false;
          continue;
        }
        mesh.visible = show
          && !inactiveObjects.has(mesh.userData.objectKey)
          && !(mesh.userData.seatId && inactiveSeats.has(mesh.userData.seatId));
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
  function setSeatCapacity(cap, { layoutMode = seatLayoutMode } = {}) {
    if (!seatCam) return;
    seatCapacity = cap;
    seatLayoutMode = layoutMode;
    const seats = computeSeats(cap, { layoutMode });
    inactiveSeats.clear();
    SEAT_IDS.forEach((seatId, i) => {
      if (i < seats.length) {
        const seat = seats[i];
        // 승인 R3 검토 좌표. 음식과 잔을 분리하고 좌석 중심을 기준으로 배치한다.
        // 잔은 165×165px 체급이며, 음용 프레임에서도 같은 잔으로 읽히도록 접지점을 고정한다.
        placeBillboard(seatBaseMesh[seatId], seatCam, {
          x: seat.bubble.x - (130 / 1920),
          y: 710 / 1080,
          width: 260 / 1920,
          height: 156 / 1080,
        }, LAYER_Z.fixture);
        placeBillboard(seatBeerMesh[seatId], seatCam, {
          x: seat.bubble.x - (20.7 / 1920),
          y: 705 / 1080,
          width: 165 / 1920,
          height: 165 / 1080,
        }, LAYER_Z.fixture - 0.005);
        placeBillboard(seatEmptyDishMesh[seatId], seatCam, {
          x: seat.bubble.x - (130 / 1920),
          y: 710 / 1080,
          width: 260 / 1920,
          height: 156 / 1080,
        }, LAYER_Z.fixture - 0.01);
        // 행주는 손님 액터가 아니라 카운터 위 빈 식기에서만 왕복한다.
        // 2:1 프레임 비율을 유지해 천과 닦임 궤적이 눌리지 않게 한다.
        placeBillboard(seatCleanupOverlayMesh[seatId], seatCam, {
          x: seat.bubble.x - (64 / 1920),
          y: 742 / 1080,
          width: 128 / 1920,
          height: 64 / 1080,
        }, LAYER_Z.fixture - 0.02);
        placeBillboard(seatActorMesh[seatId], seatCam, seat.actor, LAYER_Z.actor);
        seatActorMesh[seatId].userData.frameKey = null;
        if (SEAT_ACTOR_TEXTURE && SEAT_ACTOR_UV) cropUV(seatActorMesh[seatId].geometry, SEAT_ACTOR_UV);
        placeBillboard(objectMesh[`seatServe:${seatId}`], seatCam, seat.hit ?? seat.serve, LAYER_Z.interactive); // 손님 위 정렬된 투명 hit target(원격 D1 계약)
        seatBubbleWorld[seatId] = worldAtScreen(seatCam, seat.bubble.x, seat.bubble.y, LAYER_Z.actor);
        seatCleanupWorld[seatId] = worldAtScreen(seatCam, seat.bubble.x, 700 / 1080, LAYER_Z.actor);
      } else {
        inactiveSeats.add(seatId);
      }
    });
    setActiveScreenObjects(activeId);
  }

  function setSeatLayoutMode(layoutMode) {
    if (layoutMode === seatLayoutMode) return false;
    setSeatCapacity(seatCapacity, { layoutMode });
    return true;
  }

  // game.html 프로덕션 그릴 칸 수(명성 해금)에 맞춰 pgSlot 칸을 그릴 바디에 균등 재배치한다.
  function setGrillSlots(n) {
    const cam = presetCam['SCR-SVC-GRILL'];
    if (!cam) return;
    const slots = computeGrillSlots(n);
    const activeKeys = new Set(slots.map(({ key }) => key));
    for (const key of Object.keys(OBJECTS)) if (key.startsWith('grillSlot')) inactiveObjects.add(key);
    for (const key of GRILL_SLOT_KEYS) {
      if (activeKeys.has(key)) inactiveObjects.delete(key);
      else inactiveObjects.add(key);
    }
    for (const { key, rect } of slots) {
      const mesh = objectMesh[key];
      if (mesh) placeBillboard(mesh, cam, rect, LAYER_Z.interactive);
    }
    setActiveScreenObjects(activeId);
  }

  function setObjectEnabled(key, enabled) {
    if (enabled) inactiveObjects.delete(key);
    else inactiveObjects.add(key);
    const screenActive = SCREEN_BY_ID[activeId]?.objects.includes(key) === true;
    const visible = enabled && screenActive;
    if (objectMesh[key]) objectMesh[key].visible = visible;
    if (artMesh[key]) artMesh[key].visible = visible;
    if (interactionMesh[key]) interactionMesh[key].visible = visible;
  }

  // 승인 아트 레이어(artMesh)와 더미 평면(objectMesh) 어느 쪽이든 같은 key로 상태 텍스처를 교체한다.
  // 파일명이 아니라 stable ID + companion role로만 지정한다(미승인 아트 차단).
  function setObjectTexture(key, stableAssetId, companionRole = null) {
    const mesh = artMesh[key] ?? objectMesh[key];
    if (!mesh?.material) return;
    const next = texture(runtimeUrlForId(stableAssetId, companionRole));
    if (mesh.material.map === next) return;
    mesh.material.map = next;
    mesh.material.needsUpdate = true;
  }

  // ── 라이브 카메라 + 시선 트윈 ─────────────────────────────
  let activeId = SCREENS[0].id;
  const currentLook = lookOf(SCREEN_BY_ID[activeId]);
  const camera = makeCamera(eye, currentLook);
  let lookTween = null; // { from:Vector3, to:Vector3, startMs, endMs }
  let pausedAtMs = null;

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
    if (pausedAtMs !== null) return;
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

  function pause(nowMs) {
    if (pausedAtMs !== null) return false;
    tickCamera(nowMs);
    pausedAtMs = nowMs;
    lastFrameAt = null;
    return true;
  }

  function resume(nowMs) {
    if (pausedAtMs === null) return false;
    const pausedDurationMs = Math.max(0, nowMs - pausedAtMs);
    if (lookTween) {
      lookTween.startMs += pausedDurationMs;
      lookTween.endMs += pausedDurationMs;
    }
    pausedAtMs = null;
    lastFrameAt = null;
    return true;
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
      frameCount,
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

  function projectWithCamera(world, targetCamera) {
    const v = world.clone().project(targetCamera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  }

  // 월드 좌표 → 화면 픽셀 (라이브 카메라 기준). DOM 오버레이(말풍선·게이지) 배치용.
  function projectToScreen(world) {
    return projectWithCamera(world, camera);
  }

  // 특정 화면 프리셋의 정규화 좌표를 월드에 고정한 뒤 라이브 카메라로 투영한다.
  // Three.js 장면 위 DOM 조작물을 전환 중에도 같은 깊이의 장면 소품과 함께 움직일 때 쓴다.
  function projectScreenPointAtPreset(screenId, xRatio, yRatio, layer = 'interactive') {
    const sourceCamera = presetCam[screenId];
    const z = LAYER_Z[layer];
    if (!sourceCamera || !Number.isFinite(z)) return null;
    return projectToScreen(worldAtScreen(sourceCamera, xRatio, yRatio, z));
  }

  // 승인 아트 내부의 정규화 좌표를 해당 화면의 도착 카메라 기준 픽셀로 변환한다.
  // DOM 작업대를 Three.js 아트의 실제 시각 기준선에 붙일 때 전환 중 카메라 위치에 흔들리지 않는다.
  function projectArtUvAtPreset(key, xRatio, yRatio) {
    const mesh = artMesh[key];
    const screen = SCREENS.find((item) => item.objects.includes(key));
    const targetCamera = screen ? presetCam[screen.id] : null;
    if (!mesh || !targetCamera) return null;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    const point = bounds.min.clone();
    point.set(
      lerp(bounds.min.x, bounds.max.x, xRatio),
      lerp(bounds.max.y, bounds.min.y, yRatio),
      0,
    );
    mesh.localToWorld(point);
    return projectWithCamera(point, targetCamera);
  }

  setSeatCapacity(DEFAULT_SEAT_CAP); // 초기 좌석 배치(기본 6석). activeId 정의 후 호출.
  return {
    scene,
    camera,
    renderer,
    objectMesh,
    artMesh,
    interactionMesh,
    setObjectVisible: (key, visible) => {
      const show = visible && !inactiveObjects.has(key);
      if (objectMesh[key]) objectMesh[key].visible = show;
      if (artMesh[key]) artMesh[key].visible = show;
      if (interactionMesh[key]) interactionMesh[key].visible = show;
    },
    setArtAsset: (key, stableAssetId) => {
      const mesh = artMesh[key];
      if (!mesh) return;
      const next = texture(runtimeUrlForId(stableAssetId));
      if (mesh.material.map !== next) {
        mesh.material.map = next;
        mesh.material.needsUpdate = true;
      }
    },
    // 아직 화면에 걸지 않은 그림을 미리 받아 둔다. 교체 순간 디코딩이 끝나 있지 않으면
    // 그 한 프레임이 비어 검게 뜬다(교대 프레임 애니메이션의 첫 전환).
    warmTexture: (url) => { if (url) texture(url); },
    setArtUrl: (key, url) => {
      const mesh = artMesh[key];
      if (!mesh) return;
      const next = texture(url);
      if (mesh.material.map !== next) {
        mesh.material.map = next;
        mesh.material.needsUpdate = true;
      }
    },
    seatActorMesh,
    seatBaseMesh,
    seatBeerMesh,
    seatEmptyDishMesh,
    seatCleanupOverlayMesh,
    seatBubbleWorld,
    seatCleanupWorld,
    setSeatCapacity,
    setSeatLayoutMode,
    setSeatPlateVisible: (seatId, visible) => {
      const plate = seatBaseMesh[seatId];
      if (plate) plate.visible = visible && !inactiveSeats.has(seatId);
    },
    setSeatPlateUrl: (seatId, url) => {
      const plate = seatBaseMesh[seatId];
      if (!plate?.material || !url) return false;
      const next = texture(url);
      if (plate.material.map === next) return false;
      plate.material.map = next;
      plate.material.color.setHex(0xffffff);
      plate.material.colorWrite = true;
      plate.material.needsUpdate = true;
      return true;
    },
    setSeatBeerVisible: (seatId, visible) => {
      const beer = seatBeerMesh[seatId];
      if (beer) beer.visible = visible && !inactiveSeats.has(seatId);
    },
    setSeatEmptyDishesVisible: (seatId, visible) => {
      const dishes = seatEmptyDishMesh[seatId];
      if (dishes) dishes.visible = visible && !inactiveSeats.has(seatId);
    },
    setSeatCleanupOverlayVisible: (seatId, visible) => {
      const overlay = seatCleanupOverlayMesh[seatId];
      if (overlay) overlay.visible = visible && !inactiveSeats.has(seatId);
    },
    setCleanupOverlayFrame: (frame) => {
      const index = Math.abs(Math.trunc(frame)) % 2;
      for (const overlay of Object.values(seatCleanupOverlayMesh)) {
        cropUV(overlay.geometry, { u0: index * 0.5, v0: 0, u1: (index + 1) * 0.5, v1: 1 });
      }
    },
    setGrillSlots,
    setObjectEnabled,
    setObjectTexture,
    hasSeatActorArt: () => !!SEAT_ACTOR_TEXTURE,
    // 좌석 손님 아트 텍스처 교체 (phase 구동). UV 크롭은 지오메트리에 남는다.
    setSeatActorTexture: (seatId, url) => {
      const a = seatActorMesh[seatId];
      if (!a) return;
      const tex = texture(url);
      if (a.material.map !== tex) {
        a.material.map = tex;
        a.material.transparent = true;
        a.material.color.setHex(0xffffff);
        a.material.needsUpdate = true;
      }
    },
    setSeatActorFrame: (seatId, { scale = 1, offsetY = 0 } = {}) => {
      const actor = seatActorMesh[seatId];
      const seatIndex = SEAT_IDS.indexOf(seatId);
      if (!actor || seatIndex < 0 || seatIndex >= seatCapacity) return;
      const frameKey = `${seatCapacity}:${seatLayoutMode}:${scale}:${offsetY}`;
      if (actor.userData.frameKey === frameKey) return;
      const seat = computeSeats(seatCapacity, { layoutMode: seatLayoutMode })[seatIndex];
      placeBillboard(actor, seatCam, {
        ...seat.actor,
        y: seat.actor.y + offsetY,
      }, LAYER_Z.actor);
      actor.scale.set(scale, scale, 1);
      actor.userData.frameKey = frameKey;
    },
    presetCam,
    activeScreenId: () => activeId,
    goToScreen,
    renderFrame,
    pause,
    resume,
    isPaused: () => pausedAtMs !== null,
    resize,
    performanceStats,
    texturesReady: () => pendingTextures === 0,
    textureErrors: () => textureErrorCount,
    anchorFor,
    projectToScreen,
    projectScreenPointAtPreset,
    projectArtUvAtPreset,
    quaternionFor: (screenId) => presetCam[screenId].quaternion.clone(),
    dispose: () => renderer.dispose(),
  };
}
