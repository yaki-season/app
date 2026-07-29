// 멀티 잡 조리 모델 (순수 로직, GPL-004 §18-2 다중 그릴 칸).
//
// 단일 gameState와 달리, 조립을 그릴과 분리한다: 조립은 언제든 가능하고 완성분은 대기 트레이로 쌓인다.
// 그릴은 N개의 칸을 가지며 각 칸이 독립 타이머(앞/뒤)로 굽는다. 대기 트레이의 꼬치를 빈 칸에 올리고,
// 칸을 눌러 뒤집기·회수한다. 익힘 판정은 recipe.js를 재사용해 SCN-001 테스트 화면과 동일 규칙을 쓴다.

import { RECIPE, DONENESS, classifyDoneness, canAdvance } from '../config/recipe.js';

export function createCookStations({ slots = 1, recipe = RECIPE } = {}) {
  let assembly = { index: 0 }; // 진행 중 조립 (index = 끼운 재료 수)
  let waiting = 0; // 완성돼 그릴 대기 중인 꼬치 수
  let grill = Array.from({ length: Math.max(1, slots) }, () => emptySlot());

  function emptySlot() {
    return { status: 'empty', faceStartAt: null, frontResult: null, backResult: null };
  }

  // ── 조립 (그릴과 독립) ─────────────────────────────────────
  function clickIngredient(ingredient) {
    const expected = recipe[assembly.index];
    if (ingredient !== expected) return { ok: false, reason: 'order' }; // 순서 틀림 → 무효(패널티 없음)
    assembly.index += 1;
    if (assembly.index >= recipe.length) { waiting += 1; assembly = { index: 0 }; return { ok: true, completed: true }; }
    return { ok: true, completed: false };
  }
  const assemblyIndex = () => assembly.index;
  const assemblyComplete = () => false; // 완성 즉시 트레이로 이동하므로 "완성 대기" 상태는 없다
  const waitingCount = () => waiting;

  // ── 그릴 (N칸 독립) ────────────────────────────────────────
  function freeSlotIndex() { return grill.findIndex((s) => s.status === 'empty'); }

  // 대기 트레이의 꼬치 하나를 빈 칸에 올린다.
  function placeToGrill(now) {
    if (waiting <= 0) return { ok: false, reason: 'no-waiting' };
    const i = freeSlotIndex();
    if (i < 0) return { ok: false, reason: 'no-slot' };
    waiting -= 1;
    grill[i] = { status: 'front', faceStartAt: now, frontResult: null, backResult: null };
    return { ok: true, slot: i };
  }

  function faceElapsedSec(slot, now) {
    if (slot.faceStartAt == null) return 0;
    return Math.max(0, (now - slot.faceStartAt) / 1000);
  }
  function slotDoneness(i, now) {
    const s = grill[i];
    if (!s || (s.status !== 'front' && s.status !== 'back')) return null;
    return classifyDoneness(faceElapsedSec(s, now));
  }

  // 칸을 누른다: 앞면 적정↑이면 뒤집기, 뒷면 적정↑이면 회수(완성품 반환).
  function clickSlot(i, now) {
    const s = grill[i];
    if (!s) return { ok: false };
    const d = classifyDoneness(faceElapsedSec(s, now));
    if (s.status === 'front') {
      if (!canAdvance(d)) return { ok: false, reason: 'not-ready', doneness: d };
      grill[i] = { ...s, status: 'back', frontResult: d, faceStartAt: now };
      return { ok: true, flipped: true };
    }
    if (s.status === 'back') {
      if (!canAdvance(d)) return { ok: false, reason: 'not-ready', doneness: d };
      const backResult = d;
      const good = s.frontResult !== DONENESS.OVER && backResult !== DONENESS.OVER;
      grill[i] = emptySlot(); // 회수 → 칸 비움
      return { ok: true, retrieved: true, quality: { good, frontResult: s.frontResult, backResult } };
    }
    return { ok: false, reason: 'not-cooking' };
  }

  // 양면 중 하나라도 탄(burnt) 칸을 폐기한다. 폐기된 칸 인덱스 목록 반환.
  function tickBurn(now) {
    const discarded = [];
    grill.forEach((s, i) => {
      if ((s.status === 'front' || s.status === 'back') && classifyDoneness(faceElapsedSec(s, now)) === DONENESS.BURNT) {
        grill[i] = emptySlot();
        discarded.push(i);
      }
    });
    return discarded;
  }

  // 그릴 칸 수 조정 (grillSlots 업그레이드). 굽던 칸은 보존하고 칸만 늘린다.
  function setSlots(n) {
    const target = Math.max(1, n);
    if (target > grill.length) { while (grill.length < target) grill.push(emptySlot()); }
    else if (target < grill.length) { grill = grill.slice(0, target); } // 축소는 빈 칸부터가 이상적이나 데모에선 단순화
  }

  function slotViews(now) {
    return grill.map((s, i) => ({
      index: i,
      status: s.status,
      doneness: slotDoneness(i, now),
      faceElapsedSec: faceElapsedSec(s, now),
      cooking: s.status === 'front' || s.status === 'back',
    }));
  }

  return {
    clickIngredient, assemblyIndex, assemblyComplete, waitingCount,
    placeToGrill, clickSlot, slotDoneness, tickBurn, setSlots, slotViews,
    slotCount: () => grill.length,
    // 테스트: 굽는 칸들의 시작 시각을 앞당겨 경과를 시뮬레이션.
    debugElapse(sec) { for (const s of grill) if (s.faceStartAt != null) s.faceStartAt -= sec * 1000; },
    debugFillAssembly() { waiting += 1; assembly = { index: 0 }; }, // 조립 5클릭 대체
    reset() { assembly = { index: 0 }; waiting = 0; grill = grill.map(() => emptySlot()); },
  };
}
