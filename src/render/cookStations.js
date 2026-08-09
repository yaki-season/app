// 멀티 잡 조리 모델 (순수 로직, GPL-004 v1.39.0).
//
// 조립·대기·다중 그릴 칸을 분리하고, 그릴 제작물은 방향·접촉면·양면 누적 시간을 독립 보존한다.
// 렌더러는 slotViews snapshot만 소비하며 품질·진행 판정은 이 모듈이 소유한다.

import { RECIPE, DONENESS, COOK_THRESHOLDS_SEC, classifyDoneness } from '../config/recipe.js';

const FLIP_AIRBORNE_MS = 300;
const INPUT_LOCK_MS = 300;
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
  explicitAssemblyTransfer = false,
} = {}) {
  const normalizedSlotCount = Math.max(1, slots);
  let assembly = { index: 0, complete: false };
  let assembledCount = 0;
  let transferredCount = 0;
  let waiting = 0;
  let grill = Array.from({ length: normalizedSlotCount }, () => emptySlot());

  function emptySlot() {
    return {
      status: 'empty',
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
      const readySec = COOK_THRESHOLDS_SEC[DONENESS.PERFECT];
      if (slot.faceReadyAtMs?.[face] == null && before < readySec && slot.elapsedSec[face] >= readySec) {
        slot.faceReadyAtMs ??= { front: null, back: null };
        slot.faceReadyAtMs[face] = cursor + (readySec - before) * 1000;
      }
    }
    slot.lastUpdatedAt = Math.max(cursor, now);
  }

  // ── 조립 ───────────────────────────────────────────────────
  function clickIngredient(ingredient) {
    if (assembly.complete) return { ok: false, reason: 'transfer-required' };
    const expected = recipe[assembly.index];
    if (ingredient !== expected) return { ok: false, reason: 'order' };
    assembly.index += 1;
    if (assembly.index >= recipe.length) {
      assembledCount += 1;
      if (explicitAssemblyTransfer) {
        assembly.complete = true;
      } else {
        waiting += 1;
        transferredCount += 1;
        assembly = { index: 0, complete: false };
      }
      return { ok: true, completed: true };
    }
    return { ok: true, completed: false };
  }
  const assemblyIndex = () => assembly.index;
  const assemblyComplete = () => assembly.complete;
  function transferAssembly() {
    if (!assembly.complete) return { ok: false, reason: 'not-complete' };
    waiting += 1;
    transferredCount += 1;
    assembly = { index: 0, complete: false };
    return { ok: true, transferred: true, waiting, transferredCount };
  }
  const waitingCount = () => waiting;

  // ── 그릴 ───────────────────────────────────────────────────
  function freeSlotIndex() {
    return grill.findIndex((slot) => slot.status === 'empty');
  }

  function placeToGrill(now) {
    if (waiting <= 0) return { ok: false, reason: 'no-waiting' };
    const index = freeSlotIndex();
    if (index < 0) return { ok: false, reason: 'no-slot' };
    waiting -= 1;
    grill[index] = {
      ...emptySlot(),
      status: FACE.FRONT,
      orientationFaceDown: FACE.FRONT,
      contactFace: FACE.FRONT,
      lastUpdatedAt: now,
    };
    return { ok: true, slot: index };
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
    const frontResult = classifyDoneness(slot.elapsedSec.front);
    const backResult = classifyDoneness(slot.elapsedSec.back);
    return frontResult === DONENESS.UNDER || backResult === DONENESS.UNDER
      ? COOK_SLOT_NEXT_ACTION.FLIP
      : COOK_SLOT_NEXT_ACTION.RETRIEVE;
  }

  function slotDoneness(index, now) {
    const slot = grill[index];
    if (!slot) return null;
    syncSlot(slot, now);
    if (!slot.contactFace) return null;
    return classifyDoneness(currentElapsedSec(slot));
  }

  function beginFlip(index, now) {
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

    const frontResult = classifyDoneness(slot.elapsedSec.front);
    const backResult = classifyDoneness(slot.elapsedSec.back);
    if (nextAction === COOK_SLOT_NEXT_ACTION.FLIP) {
      const result = beginFlip(index, now);
      return { ...result, flipped: result.ok };
    }

    const quality = {
      ...qualityFor(frontResult, backResult),
      frontResult,
      backResult,
    };
    grill[index] = emptySlot();
    return quality.servable
      ? { ok: true, retrieved: true, quality }
      : { ok: false, retrieved: false, discarded: true, reason: 'fully-burnt', quality };
  }

  function removeFromGrill(index, now) {
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
    const slot = grill[index];
    if (!slot || slot.status !== 'off-grill') return { ok: false, reason: 'not-off-grill' };
    slot.contactFace = slot.orientationFaceDown;
    slot.status = slot.orientationFaceDown;
    slot.lastUpdatedAt = now;
    return { ok: true, contactFace: slot.contactFace };
  }

  // 양면 완전 탄 제작물만 자동 폐기한다. 한 면 탄은 Fail로 제공할 수 있다.
  function tickBurn(now) {
    const discarded = [];
    grill.forEach((slot, index) => {
      syncSlot(slot, now);
      if (
        classifyDoneness(slot.elapsedSec.front) === DONENESS.BURNT
        && classifyDoneness(slot.elapsedSec.back) === DONENESS.BURNT
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
        doneness: slot.contactFace ? classifyDoneness(faceElapsedSec) : null,
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
    grill.forEach((slot) => syncSlot(slot, now));
    return structuredClone({
      stateVersion: 1,
      assembly,
      assembledCount,
      transferredCount,
      waiting,
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
    assembly.complete = assembly.complete === true;
    transferredCount = Number.isInteger(saved.transferredCount) ? saved.transferredCount : saved.waiting;
    assembledCount = Number.isInteger(saved.assembledCount)
      ? saved.assembledCount
      : transferredCount + (assembly.complete ? 1 : 0);
    waiting = saved.waiting;
    grill = structuredClone(saved.grill);
    for (const slot of grill) {
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

  return {
    clickIngredient,
    assemblyIndex,
    assemblyComplete,
    transferAssembly,
    assemblyProgress: () => ({
      index: assembly.index,
      complete: assembly.complete,
      assembledCount,
      transferredCount,
    }),
    waitingCount,
    placeToGrill,
    clickSlot,
    beginFlip,
    completeFlip,
    removeFromGrill,
    reinsertToGrill,
    slotDoneness,
    tickBurn,
    setSlots,
    slotViews,
    snapshot,
    restore,
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
    debugFillAssembly() {
      waiting += 1;
      assembly = { index: 0, complete: false };
    },
    reset() {
      assembly = { index: 0, complete: false };
      assembledCount = 0;
      transferredCount = 0;
      waiting = 0;
      grill = grill.map(() => emptySlot());
    },
  };
}

export function createD1CookStations(options = {}) {
  return createCookStations({
    ...options,
    slots: 2,
    explicitAssemblyTransfer: true,
  });
}
