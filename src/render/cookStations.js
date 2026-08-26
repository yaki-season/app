// 멀티 잡 조리 모델 (순수 로직, GPL-004 v1.39.0).
//
// 조립·대기·다중 그릴 칸을 분리하고, 그릴 제작물은 방향·접촉면·양면 누적 시간을 독립 보존한다.
// 렌더러는 slotViews snapshot만 소비하며 품질·진행 판정은 이 모듈이 소유한다.

import {
  RECIPE,
  EARLY_CAMPAIGN_RECIPES,
  DONENESS,
  COOK_THRESHOLDS_SEC,
  classifyDoneness,
} from '../config/recipe.js';

const FLIP_AIRBORNE_MS = 300;
const INPUT_LOCK_MS = 300;
export const ASSEMBLY_TARE_MIN_COVERAGE = 0.8;
const LEGACY_ASSEMBLY_TARE_COATS = 2;
const FACE = Object.freeze({ FRONT: 'front', BACK: 'back' });

export const COOK_SLOT_NEXT_ACTION = Object.freeze({
  NONE: 'none',
  WAIT: 'wait',
  FLIP: 'flip',
  RETRIEVE: 'retrieve',
});

const otherFace = (face) => (face === FACE.FRONT ? FACE.BACK : FACE.FRONT);

function qualityFor(frontResult, backResult) {
  const pair = new Set([frontResult, backResult]);
  if (frontResult === DONENESS.BURNT && backResult === DONENESS.BURNT) {
    return { grade: null, good: false, servable: false, discardRequired: true };
  }
  if (pair.has(DONENESS.BURNT)) {
    return { grade: 'Fail', good: false, servable: true, discardRequired: false };
  }
  if (frontResult === DONENESS.PERFECT && backResult === DONENESS.PERFECT) {
    return { grade: 'Perfect', good: true, servable: true, discardRequired: false };
  }
  if (pair.has(DONENESS.PERFECT) && pair.has(DONENESS.OVER)) {
    return { grade: 'Good', good: true, servable: true, discardRequired: false };
  }
  if (
    (frontResult === DONENESS.OVER && backResult === DONENESS.OVER)
    || (pair.has(DONENESS.PERFECT) && pair.has(DONENESS.UNDER))
  ) {
    return { grade: 'OK', good: false, servable: true, discardRequired: false };
  }
  return { grade: 'Fail', good: false, servable: true, discardRequired: false };
}

export function createCookStations({
  slots = 1,
  recipe = RECIPE,
  recipes = null,
  defaultMenuId = 'negima',
  explicitAssemblyTransfer = false,
  thresholdsByMenu = {},
} = {}) {
  const normalizedSlotCount = Math.max(1, slots);
  const recipeBook = Object.freeze(recipes
    ? Object.fromEntries(Object.entries(recipes).map(([menuId, sequence]) => [menuId, [...sequence]]))
    : { [defaultMenuId]: [...recipe] });
  if (!recipeBook[defaultMenuId]) throw new Error(`기본 조립 레시피 누락: ${defaultMenuId}`);
  const menuThresholds = Object.fromEntries(Object.entries(thresholdsByMenu).map(([menuId, thresholds]) => [
    menuId,
    { ...COOK_THRESHOLDS_SEC, ...thresholds },
  ]));
  const thresholdsFor = (menuId) => menuThresholds[menuId] ?? COOK_THRESHOLDS_SEC;
  const classifyFor = (menuId, elapsedSec) => classifyDoneness(elapsedSec, thresholdsFor(menuId));
  const emptyAssembly = (menuId = defaultMenuId) => ({
    menuId,
    seasoning: 'none',
    index: 0,
    complete: false,
    tarePrepared: false,
    tareCoverage: 0,
  });
  const normalizedSeasoning = (seasoning, fallback = 'salt') => (
    seasoning === 'tare' ? 'tare' : seasoning === 'salt' ? 'salt' : fallback
  );
  let assembly = emptyAssembly();
  let assembledCount = 0;
  const learnedMenuIds = new Set();
  let transferredCount = 0;
  let waitingItems = [];
  let grill = Array.from({ length: normalizedSlotCount }, () => emptySlot());
  let pausedAtMs = null;
  let productSequence = 0;

  const makeProduct = (
    menuId,
    seasoning = 'salt',
    id = null,
    tarePrepared = false,
    tareCoverage = 0,
  ) => {
    const resolvedSeasoning = normalizedSeasoning(seasoning);
    const prepared = resolvedSeasoning === 'tare' && tarePrepared === true;
    return {
      id: id ?? `COOK-${++productSequence}`,
      menuId,
      seasoning: resolvedSeasoning,
      tarePrepared: prepared,
      tareCoverage: prepared ? Math.max(0, Math.min(1, Number(tareCoverage) || 1)) : 0,
    };
  };

  const effectiveNow = (now) => pausedAtMs ?? now;

  function emptySlot() {
    return {
      status: 'empty',
      id: null,
      menuId: null,
      seasoning: 'none',
      tarePrepared: false,
      tareCoverage: 0,
      orientationFaceDown: FACE.FRONT,
      contactFace: null,
      elapsedSec: { front: 0, back: 0 },
      faceReadyAtMs: { front: null, back: null },
      lastUpdatedAt: null,
      flip: null,
      inputLockedUntil: 0,
    };
  }

  function syncSlot(slot, now) {
    now = effectiveNow(now);
    if (!slot || slot.status === 'empty' || slot.lastUpdatedAt == null) return;
    let cursor = slot.lastUpdatedAt;
    if (slot.flip && now >= slot.flip.completeAt) {
      // 공중 회전 시작 전 접촉 시간은 beginFlip에서 이미 반영됐다.
      slot.orientationFaceDown = slot.flip.targetFace;
      slot.contactFace = slot.orientationFaceDown;
      slot.status = slot.orientationFaceDown;
      cursor = Math.max(cursor, slot.flip.completeAt);
      slot.flip = null;
    }
    if (slot.contactFace && now > cursor) {
      const face = slot.contactFace;
      const before = slot.elapsedSec[face];
      slot.elapsedSec[face] += (now - cursor) / 1000;
      const readySec = thresholdsFor(slot.menuId)[DONENESS.PERFECT];
      if (slot.faceReadyAtMs?.[face] == null && before < readySec && slot.elapsedSec[face] >= readySec) {
        slot.faceReadyAtMs ??= { front: null, back: null };
        slot.faceReadyAtMs[face] = cursor + (readySec - before) * 1000;
      }
    }
    slot.lastUpdatedAt = Math.max(cursor, now);
  }

  // ── 조립 ───────────────────────────────────────────────────
  function selectRecipe(menuId) {
    if (!recipeBook[menuId]) return { ok: false, reason: 'unknown-recipe' };
    if (assembly.index > 0 || assembly.complete) return { ok: false, reason: 'assembly-in-progress' };
    assembly.menuId = menuId;
    // 꼬치 종류를 먼저 완성한 뒤 조립대에서 소금/타래 마감을 정한다.
    assembly.seasoning = 'none';
    assembly.tarePrepared = false;
    assembly.tareCoverage = 0;
    return { ok: true, menuId, recipe: [...recipeBook[menuId]] };
  }

  function clickIngredient(ingredient) {
    if (assembly.complete) return { ok: false, reason: 'transfer-required' };
    const activeRecipe = recipeBook[assembly.menuId];
    const expected = activeRecipe[assembly.index];
    if (ingredient !== expected) return { ok: false, reason: 'order' };
    assembly.index += 1;
    if (assembly.index >= activeRecipe.length) {
      const completedMenuId = assembly.menuId;
      assembledCount += 1;
      // 끝까지 만들어 본 메뉴. 화면 위 조립 안내를 언제 접을지 이 기록이 정한다.
      learnedMenuIds.add(completedMenuId);
      if (explicitAssemblyTransfer) {
        assembly.complete = true;
      } else {
        waitingItems.push(makeProduct(completedMenuId, 'salt'));
        transferredCount += 1;
        assembly = emptyAssembly(completedMenuId);
      }
      return { ok: true, completed: true, menuId: completedMenuId };
    }
    return { ok: true, completed: false, menuId: assembly.menuId };
  }
  const assemblyIndex = () => assembly.index;
  const assemblyComplete = () => assembly.complete;
  function selectAssemblySeasoning(seasoning) {
    if (!assembly.complete) return { ok: false, reason: 'assembly-not-complete' };
    if (seasoning !== 'salt' && seasoning !== 'tare') {
      return { ok: false, reason: 'invalid-seasoning' };
    }
    if (assembly.seasoning !== seasoning) {
      assembly.seasoning = seasoning;
      assembly.tarePrepared = false;
      assembly.tareCoverage = 0;
    }
    return {
      ok: true,
      seasoning: assembly.seasoning,
      tarePrepared: assembly.tarePrepared === true,
      tareCoverage: assembly.tareCoverage ?? 0,
    };
  }
  function brushAssemblyTare(coverage = 0) {
    if (!assembly.complete) return { ok: false, reason: 'assembly-not-complete' };
    if (assembly.seasoning !== 'tare') return { ok: false, reason: 'tare-selection-required' };
    if (assembly.tarePrepared === true) {
      return { ok: true, complete: true, coverage: assembly.tareCoverage };
    }
    assembly.tareCoverage = Math.max(
      assembly.tareCoverage ?? 0,
      Math.max(0, Math.min(1, Number(coverage) || 0)),
    );
    if (assembly.tareCoverage < ASSEMBLY_TARE_MIN_COVERAGE) {
      return {
        ok: false,
        reason: 'insufficient-coverage',
        coverage: assembly.tareCoverage,
      };
    }
    assembly.tarePrepared = true;
    return { ok: true, complete: true, coverage: assembly.tareCoverage };
  }
  function transferAssembly() {
    if (!assembly.complete) return { ok: false, reason: 'not-complete' };
    const menuId = assembly.menuId;
    const seasoning = normalizedSeasoning(assembly.seasoning);
    if (seasoning === 'tare' && assembly.tarePrepared !== true) {
      return { ok: false, reason: 'tare-brush-required' };
    }
    const product = makeProduct(
      menuId,
      seasoning,
      null,
      assembly.tarePrepared,
      assembly.tareCoverage,
    );
    waitingItems.push(product);
    transferredCount += 1;
    assembly = emptyAssembly(menuId);
    return {
      ok: true,
      transferred: true,
      menuId,
      seasoning,
      tarePrepared: product.tarePrepared,
      waiting: waitingItems.length,
      transferredCount,
    };
  }
  const waitingCount = (menuId = null, seasoning = null) => waitingItems.filter((item) => (
    (menuId == null || item.menuId === menuId)
    && (seasoning == null || item.seasoning === normalizedSeasoning(seasoning))
  )).length;

  // ── 그릴 ───────────────────────────────────────────────────
  function freeSlotIndex() {
    return grill.findIndex((slot) => slot.status === 'empty');
  }

  function placeToGrill(now, menuId = null, requestedSeasoning = 'salt') {
    if (pausedAtMs !== null) return { ok: false, reason: 'paused' };
    if (waitingItems.length <= 0) return { ok: false, reason: 'no-waiting' };
    const seasoning = normalizedSeasoning(requestedSeasoning);
    const waitingIndex = waitingItems.findIndex((item) => (
      (menuId == null || item.menuId === menuId) && item.seasoning === seasoning
    ));
    if (waitingIndex < 0) {
      if (menuId != null && !waitingItems.some((item) => item.menuId === menuId)) {
        return { ok: false, reason: 'no-menu-waiting' };
      }
      return { ok: false, reason: 'no-seasoning-waiting', menuId, seasoning };
    }
    const index = freeSlotIndex();
    if (index < 0) return { ok: false, reason: 'no-slot' };
    const [placed] = waitingItems.splice(waitingIndex, 1);
    grill[index] = {
      ...emptySlot(),
      status: FACE.FRONT,
      id: placed.id,
      menuId: placed.menuId,
      seasoning: placed.seasoning,
      tarePrepared: placed.tarePrepared === true,
      tareCoverage: placed.tareCoverage ?? (placed.tarePrepared ? 1 : 0),
      orientationFaceDown: FACE.FRONT,
      contactFace: FACE.FRONT,
      lastUpdatedAt: now,
    };
    return menuId == null
      ? { ok: true, slot: index }
      : { ok: true, slot: index, id: placed.id, menuId: placed.menuId, seasoning };
  }

  function currentElapsedSec(slot) {
    return slot.contactFace ? slot.elapsedSec[slot.contactFace] : 0;
  }

  function nextActionFor(slot, now) {
    if (!slot || slot.status === 'empty') return COOK_SLOT_NEXT_ACTION.NONE;
    if (
      slot.flip
      || now < slot.inputLockedUntil
      || !slot.contactFace
    ) {
      return COOK_SLOT_NEXT_ACTION.WAIT;
    }
    const frontResult = classifyFor(slot.menuId, slot.elapsedSec.front);
    const backResult = classifyFor(slot.menuId, slot.elapsedSec.back);
    if (frontResult === DONENESS.UNDER || backResult === DONENESS.UNDER) {
      return COOK_SLOT_NEXT_ACTION.FLIP;
    }
    return COOK_SLOT_NEXT_ACTION.RETRIEVE;
  }

  function slotDoneness(index, now) {
    const slot = grill[index];
    if (!slot) return null;
    syncSlot(slot, now);
    if (!slot.contactFace) return null;
    return classifyFor(slot.menuId, currentElapsedSec(slot));
  }

  function beginFlip(index, now) {
    if (pausedAtMs !== null) return { ok: false, reason: 'paused' };
    const slot = grill[index];
    if (!slot) return { ok: false, reason: 'invalid-slot' };
    syncSlot(slot, now);
    if (!slot.contactFace) return { ok: false, reason: slot.flip ? 'flipping' : 'not-cooking' };
    if (now < slot.inputLockedUntil) return { ok: false, reason: 'input-locked' };
    const fromFace = slot.contactFace;
    slot.contactFace = null;
    slot.status = 'flipping';
    slot.flip = {
      fromFace,
      targetFace: otherFace(slot.orientationFaceDown),
      completeAt: now + FLIP_AIRBORNE_MS,
    };
    slot.inputLockedUntil = now + INPUT_LOCK_MS;
    slot.lastUpdatedAt = now;
    return {
      ok: true,
      flipping: true,
      fromFace,
      targetFace: slot.flip.targetFace,
      completeAt: slot.flip.completeAt,
    };
  }

  function completeFlip(index, now) {
    if (pausedAtMs !== null) return { ok: false, reason: 'paused' };
    const slot = grill[index];
    if (!slot?.flip) return { ok: false, reason: 'not-flipping' };
    if (now < slot.flip.completeAt) {
      syncSlot(slot, now);
      return { ok: false, reason: 'flip-not-complete', remainingMs: slot.flip.completeAt - now };
    }
    syncSlot(slot, now);
    return {
      ok: true,
      flipped: true,
      orientationFaceDown: slot.orientationFaceDown,
      contactFace: slot.contactFace,
    };
  }

  // 한 면이라도 under이면 현재 접촉면과 무관하게 반대 면으로 뒤집는다. 두 면이 모두
  // under를 벗어난 뒤에만 최종 누적 시간을 다시 분류해 회수 품질을 계산한다.
  function clickSlot(index, now) {
    if (pausedAtMs !== null) return { ok: false, reason: 'paused' };
    const slot = grill[index];
    if (!slot) return { ok: false, reason: 'invalid-slot' };
    syncSlot(slot, now);
    const nextAction = nextActionFor(slot, now);
    if (nextAction === COOK_SLOT_NEXT_ACTION.NONE) {
      return { ok: false, reason: 'not-cooking' };
    }
    if (nextAction === COOK_SLOT_NEXT_ACTION.WAIT) {
      if (slot.flip) return { ok: false, reason: 'flipping' };
      if (now < slot.inputLockedUntil) return { ok: false, reason: 'input-locked' };
      return { ok: false, reason: 'not-cooking' };
    }

    const frontResult = classifyFor(slot.menuId, slot.elapsedSec.front);
    const backResult = classifyFor(slot.menuId, slot.elapsedSec.back);
    if (nextAction === COOK_SLOT_NEXT_ACTION.FLIP) {
      const result = beginFlip(index, now);
      return { ...result, flipped: result.ok };
    }
    const menuId = slot.menuId ?? defaultMenuId;
    const { id, seasoning, tarePrepared } = slot;
    const quality = {
      ...qualityFor(frontResult, backResult),
      frontResult,
      backResult,
    };
    grill[index] = emptySlot();
    return quality.servable
      ? { ok: true, retrieved: true, id, menuId, seasoning, tarePrepared, quality }
      : { ok: false, retrieved: false, discarded: true, id, menuId, seasoning, reason: 'fully-burnt', quality };
  }

  function removeFromGrill(index, now) {
    if (pausedAtMs !== null) return { ok: false, reason: 'paused' };
    const slot = grill[index];
    if (!slot) return { ok: false, reason: 'invalid-slot' };
    syncSlot(slot, now);
    if (!slot.contactFace || slot.flip) return { ok: false, reason: 'not-removable' };
    slot.contactFace = null;
    slot.status = 'off-grill';
    slot.lastUpdatedAt = now;
    return { ok: true, orientationFaceDown: slot.orientationFaceDown };
  }

  function reinsertToGrill(index, now) {
    if (pausedAtMs !== null) return { ok: false, reason: 'paused' };
    const slot = grill[index];
    if (!slot || slot.status !== 'off-grill') return { ok: false, reason: 'not-off-grill' };
    slot.contactFace = slot.orientationFaceDown;
    slot.status = slot.orientationFaceDown;
    slot.lastUpdatedAt = now;
    return { ok: true, contactFace: slot.contactFace };
  }

  // 양면 완전 탄 제작물만 자동 폐기한다. 한 면 탄은 Fail로 제공할 수 있다.
  function tickBurn(now) {
    if (pausedAtMs !== null) return [];
    const discarded = [];
    grill.forEach((slot, index) => {
      syncSlot(slot, now);
      if (
        classifyFor(slot.menuId, slot.elapsedSec.front) === DONENESS.BURNT
        && classifyFor(slot.menuId, slot.elapsedSec.back) === DONENESS.BURNT
      ) {
        grill[index] = emptySlot();
        discarded.push(index);
      }
    });
    return discarded;
  }

  function setSlots(count) {
    const target = Math.max(1, count);
    if (target > grill.length) {
      while (grill.length < target) grill.push(emptySlot());
    } else if (target < grill.length) {
      const removable = grill.slice(target);
      if (removable.some((slot) => slot.status !== 'empty')) return { ok: false, reason: 'occupied-slot' };
      grill = grill.slice(0, target);
    }
    return { ok: true, slots: grill.length };
  }

  function slotViews(now) {
    now = effectiveNow(now);
    return grill.map((slot, index) => {
      syncSlot(slot, now);
      const faceElapsedSec = currentElapsedSec(slot);
      const settledRotationRad = slot.orientationFaceDown === FACE.BACK ? Math.PI : 0;
      const flipProgress = slot.flip
        ? Math.max(0, Math.min(1, 1 - (slot.flip.completeAt - now) / FLIP_AIRBORNE_MS))
        : null;
      const visualRotationRad = slot.flip
        ? (slot.flip.fromFace === FACE.BACK ? Math.PI : 0)
          + ((slot.flip.targetFace === FACE.BACK ? Math.PI : 0)
            - (slot.flip.fromFace === FACE.BACK ? Math.PI : 0)) * flipProgress
        : settledRotationRad;
      const nextAction = nextActionFor(slot, now);
      const actionReadyAtMs = nextAction === COOK_SLOT_NEXT_ACTION.RETRIEVE
        ? Math.max(slot.faceReadyAtMs?.front ?? now, slot.faceReadyAtMs?.back ?? now)
        : slot.faceReadyAtMs?.[slot.contactFace] ?? Number.POSITIVE_INFINITY;
      return {
        index,
        status: slot.status,
        menuId: slot.menuId,
        id: slot.id,
        seasoning: slot.seasoning,
        tarePrepared: slot.tarePrepared === true,
        tareCoverage: slot.tareCoverage ?? 0,
        doneness: slot.contactFace ? classifyFor(slot.menuId, faceElapsedSec) : null,
        faceElapsedSec,
        frontElapsedSec: slot.elapsedSec.front,
        backElapsedSec: slot.elapsedSec.back,
        orientationFaceDown: slot.orientationFaceDown,
        contactFace: slot.contactFace,
        flipping: !!slot.flip,
        flipProgress,
        visualRotationRad,
        cooking: slot.contactFace !== null,
        inputLocked: now < slot.inputLockedUntil,
        nextAction,
        actionReadyAtMs,
      };
    });
  }

  function snapshot(now) {
    now = effectiveNow(now);
    grill.forEach((slot) => syncSlot(slot, now));
    return structuredClone({
      stateVersion: 1,
      assembly,
      assembledCount,
      transferredCount,
      waiting: waitingItems.length,
      waitingItems,
      learnedMenuIds: [...learnedMenuIds],
      productSequence,
      grill,
    });
  }

  function restore(saved, now) {
    if (
      saved?.stateVersion !== 1
      || !Array.isArray(saved.grill)
      || !Number.isInteger(saved.waiting)
      || !Number.isInteger(saved.assembly?.index)
    ) {
      return { ok: false, reason: 'invalid-snapshot' };
    }
    assembly = structuredClone(saved.assembly);
    assembly.menuId = recipeBook[assembly.menuId] ? assembly.menuId : defaultMenuId;
    assembly.complete = assembly.complete === true;
    assembly.seasoning = normalizedSeasoning(assembly.seasoning, 'none');
    const legacyTareBrushCount = Number.isInteger(assembly.tareBrushCount)
      ? assembly.tareBrushCount
      : 0;
    assembly.tarePrepared = assembly.seasoning === 'tare'
      && (assembly.tarePrepared === true || legacyTareBrushCount >= LEGACY_ASSEMBLY_TARE_COATS);
    assembly.tareCoverage = assembly.tarePrepared
      ? 1
      : Math.max(0, Math.min(1, Number(assembly.tareCoverage) || 0));
    delete assembly.tareBrushCount;
    transferredCount = Number.isInteger(saved.transferredCount) ? saved.transferredCount : saved.waiting;
    assembledCount = Number.isInteger(saved.assembledCount)
      ? saved.assembledCount
      : transferredCount + (assembly.complete ? 1 : 0);
    productSequence = Number.isInteger(saved.productSequence) ? saved.productSequence : 0;
    waitingItems = Array.isArray(saved.waitingItems)
      ? saved.waitingItems.map((item) => {
        if (typeof item === 'string') return makeProduct(item, 'salt');
        const seasoning = normalizedSeasoning(item?.seasoning);
        // 구형 대기 재고에서 tare가 명시됐다면 당시 조립 도포를 통과한 제품이다.
        return makeProduct(item?.menuId, seasoning, item?.id, seasoning === 'tare');
      }).filter((item) => recipeBook[item.menuId])
      : Array.from({ length: saved.waiting }, () => makeProduct(defaultMenuId));
    while (waitingItems.length < saved.waiting) waitingItems.push(makeProduct(defaultMenuId));
    if (waitingItems.length > saved.waiting) waitingItems = waitingItems.slice(0, saved.waiting);
    learnedMenuIds.clear();
    for (const menuId of saved.learnedMenuIds ?? []) {
      if (recipeBook[menuId]) learnedMenuIds.add(menuId);
    }
    grill = structuredClone(saved.grill);
    pausedAtMs = null;
    for (const slot of grill) {
      slot.menuId = slot.status === 'empty' ? null : (recipeBook[slot.menuId] ? slot.menuId : defaultMenuId);
      slot.id = slot.status === 'empty' ? null : (slot.id ?? `COOK-${++productSequence}`);
      slot.seasoning = slot.seasoning === 'tare' ? 'tare' : 'salt';
      // 이전 버전에서 이미 그릴에 올라간 타래 꼬치는 진행 불능에 빠지지 않도록
      // 조립 도포가 끝난 상태로 승격한다. 새 흐름에서는 미도포 타래가 그릴에 올 수 없다.
      slot.tarePrepared = slot.seasoning === 'tare';
      slot.tareCoverage = slot.tarePrepared ? 1 : 0;
      slot.faceReadyAtMs ??= { front: null, back: null };
      // 구형 D1 저장은 첫 두 꼬치를 staged로 보관했다. 독립 조리 규칙에서는
      // 이어하기 직후 그 꼬치도 앞면 접촉 상태로 전환해 멈춘 제작물을 남기지 않는다.
      if (slot.status === 'staged') {
        slot.status = FACE.FRONT;
        slot.orientationFaceDown = FACE.FRONT;
        slot.contactFace = FACE.FRONT;
      }
      // 저장 이후 실제 경과 시간은 영업 조리에 적용하지 않는다.
      slot.lastUpdatedAt = slot.status === 'empty' ? null : now;
      if (slot.flip) {
        slot.flip.completeAt = now + FLIP_AIRBORNE_MS;
        slot.inputLockedUntil = now + INPUT_LOCK_MS;
        slot.contactFace = null;
        slot.status = 'flipping';
      } else {
        // inputLockedUntil은 performance.now() 기준 절대값이다. 새 문서에서 이어하기를 하면
        // 시간 원점이 다시 0부터 시작하므로 저장된 값을 유지할 경우 이미 끝난 0.3초 잠금이
        // 이전 페이지의 전체 실행 시간만큼 되살아난다. 뒤집기 중이 아니면 잠금은 만료 상태다.
        slot.inputLockedUntil = 0;
      }
    }
    return { ok: true };
  }

  function pause(now) {
    if (pausedAtMs !== null) return false;
    grill.forEach((slot) => syncSlot(slot, now));
    pausedAtMs = now;
    return true;
  }

  function resume(now) {
    if (pausedAtMs === null) return false;
    const pausedDurationMs = Math.max(0, now - pausedAtMs);
    for (const slot of grill) {
      if (slot.status === 'empty') continue;
      if (slot.flip?.completeAt > pausedAtMs) slot.flip.completeAt += pausedDurationMs;
      if (slot.inputLockedUntil > pausedAtMs) slot.inputLockedUntil += pausedDurationMs;
      for (const face of [FACE.FRONT, FACE.BACK]) {
        if (slot.faceReadyAtMs?.[face] > pausedAtMs) {
          slot.faceReadyAtMs[face] += pausedDurationMs;
        }
      }
      slot.lastUpdatedAt = now;
    }
    pausedAtMs = null;
    return true;
  }

  return {
    clickIngredient,
    selectRecipe,
    selectAssemblySeasoning,
    selectedMenuId: () => assembly.menuId,
    selectedSeasoning: () => assembly.seasoning ?? 'none',
    learnedMenuIds: () => new Set(learnedMenuIds),
    currentRecipe: () => [...recipeBook[assembly.menuId]],
    recipeIds: () => Object.keys(recipeBook),
    assemblyIndex,
    assemblyComplete,
    brushAssemblyTare,
    transferAssembly,
    assemblyProgress: () => ({
      index: assembly.index,
      complete: assembly.complete,
      menuId: assembly.menuId,
      seasoning: assembly.seasoning ?? 'none',
      tarePrepared: assembly.tarePrepared === true,
      tareCoverage: assembly.tareCoverage ?? 0,
      assembledCount,
      transferredCount,
    }),
    waitingCount,
    waitingItems: () => waitingItems.map((item) => item.menuId),
    waitingProducts: () => structuredClone(waitingItems),
    placeToGrill,
    clickSlot,
    beginFlip,
    completeFlip,
    removeFromGrill,
    reinsertToGrill,
    slotDoneness,
    tickBurn,
    setSlots,
    setMenuThresholds(menuId, thresholds) {
      if (!recipeBook[menuId] || !thresholds) return false;
      menuThresholds[menuId] = { ...COOK_THRESHOLDS_SEC, ...thresholds };
      return true;
    },
    slotViews,
    snapshot,
    restore,
    pause,
    resume,
    isPaused: () => pausedAtMs !== null,
    slotCount: () => grill.length,
    debugElapse(sec) {
      for (const slot of grill) {
        if (slot.lastUpdatedAt == null) continue;
        slot.lastUpdatedAt -= sec * 1000;
        // 테스트 훅은 "현재 공정을 sec만큼 진행"하는 의미다. 공중 회전 중 호출되면
        // 회전 0.3초도 함께 경과시키고, 남은 양을 새 접촉면 조리 시간으로 적용한다.
        if (slot.flip) slot.flip.completeAt -= sec * 1000 + FLIP_AIRBORNE_MS;
        if (slot.inputLockedUntil) slot.inputLockedUntil -= sec * 1000;
      }
    },
    debugFillAssembly(menuId = assembly.menuId, seasoning = 'salt') {
      if (!recipeBook[menuId]) return false;
      learnedMenuIds.add(menuId);
      const resolvedSeasoning = normalizedSeasoning(seasoning);
      waitingItems.push(makeProduct(menuId, resolvedSeasoning, null, resolvedSeasoning === 'tare'));
      assembly = emptyAssembly(menuId);
      return true;
    },
    reset() {
      assembly = emptyAssembly();
      assembledCount = 0;
      transferredCount = 0;
      waitingItems = [];
      learnedMenuIds.clear();
      grill = grill.map(() => emptySlot());
    },
  };
}

export function createD1CookStations(options = {}) {
  return createCookStations({
    ...options,
    slots: options.slots ?? 2,
    recipes: options.recipes ?? EARLY_CAMPAIGN_RECIPES,
    defaultMenuId: options.defaultMenuId ?? 'negima',
    explicitAssemblyTransfer: true,
  });
}
