// 멀티 잡 조리 모델 (순수 로직, GPL-004 v1.39.0).
//
// 조립·대기·다중 그릴 칸을 분리하고, 그릴 제작물은 방향·접촉면·양면 누적 시간을 독립 보존한다.
// 렌더러는 slotViews snapshot만 소비하며 품질·진행 판정은 이 모듈이 소유한다.

import { RECIPE, DONENESS, classifyDoneness } from '../config/recipe.js';

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
  initialBatchSize = 1,
} = {}) {
  const normalizedSlotCount = Math.max(1, slots);
  if (
    !Number.isInteger(initialBatchSize)
    || initialBatchSize < 1
    || initialBatchSize > normalizedSlotCount
  ) {
    throw new TypeError('initialBatchSize는 1 이상 전체 그릴 칸 이하의 정수여야 합니다.');
  }
  let assembly = { index: 0 };
  let waiting = 0;
  let grill = Array.from({ length: normalizedSlotCount }, () => emptySlot());
  let initialBatch = {
    required: initialBatchSize,
    placed: 0,
    started: initialBatchSize === 1,
  };

  function emptySlot() {
    return {
      status: 'empty',
      orientationFaceDown: FACE.FRONT,
      contactFace: null,
      elapsedSec: { front: 0, back: 0 },
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
      slot.elapsedSec[slot.contactFace] += (now - cursor) / 1000;
    }
    slot.lastUpdatedAt = Math.max(cursor, now);
  }

  // ── 조립 ───────────────────────────────────────────────────
  function clickIngredient(ingredient) {
    const expected = recipe[assembly.index];
    if (ingredient !== expected) return { ok: false, reason: 'order' };
    assembly.index += 1;
    if (assembly.index >= recipe.length) {
      waiting += 1;
      assembly = { index: 0 };
      return { ok: true, completed: true };
    }
    return { ok: true, completed: false };
  }
  const assemblyIndex = () => assembly.index;
  const assemblyComplete = () => false;
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
    const stagingInitialBatch = !initialBatch.started;
    grill[index] = {
      ...emptySlot(),
      status: stagingInitialBatch ? 'staged' : FACE.FRONT,
      orientationFaceDown: FACE.FRONT,
      contactFace: stagingInitialBatch ? null : FACE.FRONT,
      lastUpdatedAt: stagingInitialBatch ? null : now,
    };
    if (!stagingInitialBatch) return { ok: true, slot: index, batchStarted: false };

    initialBatch.placed += 1;
    if (initialBatch.placed < initialBatch.required) {
      return {
        ok: true,
        slot: index,
        staged: true,
        batchStarted: false,
        remainingForBatch: initialBatch.required - initialBatch.placed,
      };
    }

    const startedSlots = [];
    grill.forEach((slot, slotIndex) => {
      if (slot.status !== 'staged') return;
      slot.status = FACE.FRONT;
      slot.contactFace = FACE.FRONT;
      slot.lastUpdatedAt = now;
      startedSlots.push(slotIndex);
    });
    initialBatch.started = true;
    return {
      ok: true,
      slot: index,
      staged: false,
      batchStarted: true,
      startedSlots,
    };
  }

  function currentElapsedSec(slot) {
    return slot.contactFace ? slot.elapsedSec[slot.contactFace] : 0;
  }

  function nextActionFor(slot, now) {
    if (!slot || slot.status === 'empty') return COOK_SLOT_NEXT_ACTION.NONE;
    if (
      slot.status === 'staged'
      || slot.flip
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
        nextAction: nextActionFor(slot, now),
      };
    });
  }

  function snapshot(now) {
    grill.forEach((slot) => syncSlot(slot, now));
    return structuredClone({
      stateVersion: 1,
      assembly,
      waiting,
      grill,
      initialBatch,
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
    waiting = saved.waiting;
    grill = structuredClone(saved.grill);
    initialBatch = saved.initialBatch
      ? structuredClone(saved.initialBatch)
      : {
          required: initialBatchSize,
          placed: initialBatchSize,
          started: true,
        };
    for (const slot of grill) {
      // 저장 이후 실제 경과 시간은 영업 조리에 적용하지 않는다.
      slot.lastUpdatedAt = slot.status === 'empty' || slot.status === 'staged' ? null : now;
      if (slot.flip) {
        slot.flip.completeAt = now + FLIP_AIRBORNE_MS;
        slot.contactFace = null;
        slot.status = 'flipping';
      }
    }
    return { ok: true };
  }

  return {
    clickIngredient,
    assemblyIndex,
    assemblyComplete,
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
      assembly = { index: 0 };
    },
    reset() {
      assembly = { index: 0 };
      waiting = 0;
      grill = grill.map(() => emptySlot());
      initialBatch = {
        required: initialBatchSize,
        placed: 0,
        started: initialBatchSize === 1,
      };
    },
  };
}

export function createD1CookStations(options = {}) {
  return createCookStations({
    ...options,
    slots: 6,
    initialBatchSize: 3,
  });
}
