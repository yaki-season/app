import { describe, expect, it } from 'vitest';
import { D1_CUSTOMER_PHASE } from '../../src/domain/businessDay/d1BusinessDay.js';
import {
  D1_EXTRA_ACTOR_BASELINE_CLIPS,
  D1_EXTRA_ACTOR_CONTRACT,
  D1_EXTRA_ACTOR_CONTRACT_VERSION,
  D1_EXTRA_ACTOR_COVERAGE_ONLY_CLIPS,
  D1_EXTRA_ACTOR_GEOMETRY,
  D1_EXTRA_ACTOR_ROLE_SEMANTICS,
  D1_EXTRA_ACTOR_RUNTIME_CLIPS,
  D1_EXTRA_ACTOR_STATE_TO_CLIP,
  resolveD1ExtraActorClip,
} from '../../src/render/d1ExtraActorContract.js';

describe('D1 이름 없는 commuter extra actor 계약', () => {
  it('versioned inventory identity를 새 asset이나 runtime binding 없이 고정한다', () => {
    expect(D1_EXTRA_ACTOR_CONTRACT_VERSION).toBe('v1.1.0');
    expect(D1_EXTRA_ACTOR_CONTRACT.sources).toEqual({
      developer1Task: 'v3.25.0',
      artist3Task: 'v1.1.1',
      artAssetContract: 'ART-003 v5.9.0',
      geometryHandoff: 'v1.0.0',
    });
    expect(D1_EXTRA_ACTOR_CONTRACT.identity).toEqual({
      screenId: 'SCR-SVC-CUSTOMERS',
      stateId: 'D1-extra-commuter',
      componentId: 'customers.actor.commuter',
      requiredAssetId: 'CH-EXTRA-COMMUTER-SERVICE',
      semanticOwner: 'artist-3.d1-drink-service-cleanup-customer-settlement',
    });
    expect(D1_EXTRA_ACTOR_CONTRACT.registration).toEqual({
      createsPixels: false,
      createsManifestEntry: false,
      promotesRuntimeAsset: false,
      bindsRuntimeSelector: false,
    });
    expect(Object.isFrozen(D1_EXTRA_ACTOR_CONTRACT)).toBe(true);
  });

  it('ART-003의 16 clip을 production coverage와 현재 D1 runtime 소비로 분리한다', () => {
    expect(D1_EXTRA_ACTOR_BASELINE_CLIPS).toHaveLength(16);
    expect(D1_EXTRA_ACTOR_RUNTIME_CLIPS).toEqual([
      'considering',
      'order-ready',
      'waiting',
      'urgent',
      'receiving',
      'eating',
      'drinking',
      'angry',
      'checkout',
      'leave',
    ]);
    expect(D1_EXTRA_ACTOR_COVERAGE_ONLY_CLIPS).toEqual([
      'enter',
      'tasting',
      'satisfied',
      'disappointed',
      'mismatch',
      'retry',
    ]);
    expect(new Set([
      ...D1_EXTRA_ACTOR_RUNTIME_CLIPS,
      ...D1_EXTRA_ACTOR_COVERAGE_ONLY_CLIPS,
    ])).toEqual(new Set(D1_EXTRA_ACTOR_BASELINE_CLIPS));
    expect(D1_EXTRA_ACTOR_CONTRACT.clipPolicy).toEqual({
      allBaselineClipsRequiredForArtDelivery: true,
      runtimeSubsetIsNotAnArtDeliveryWaiver: true,
      coverageOnlyMeansNotSelectedByCurrentD1Gameplay: true,
    });
  });

  it.each([
    [{ phase: 'thinking' }, 'considering'],
    [{ phase: 'order-ready' }, 'order-ready'],
    [{ phase: 'waiting' }, 'waiting'],
    [{ phase: 'waiting', urgent: true }, 'urgent'],
    [{
      phase: 'waiting',
      servedItemMenuIds: ['beer'],
      remainingItemCount: 1,
    }, 'drinking'],
    [{
      phase: 'waiting',
      urgent: true,
      servedItemMenuIds: ['beer'],
      remainingItemCount: 1,
    }, 'urgent'],
    [{ phase: 'received-waiting-group' }, 'receiving'],
    [{ phase: 'eating' }, 'eating'],
    [{ phase: 'meal-complete' }, 'checkout'],
    [{ phase: 'leaving' }, 'leave'],
    [{ phase: 'leaving', departureCause: 'patience' }, 'angry'],
    [{ phase: 'leaving', departureCause: 'fail-quality' }, 'angry'],
    [{ phase: 'cleanup' }, null],
    [{ phase: 'done' }, null],
    [{ phase: 'empty' }, null],
  ])('gameplay selector %j → %s', (state, clip) => {
    expect(resolveD1ExtraActorClip(state)).toBe(clip);
  });

  it('현재 D1 도메인의 모든 customer phase에 명시적 mapping 또는 숨김을 둔다', () => {
    const mappedPhases = new Set(D1_EXTRA_ACTOR_STATE_TO_CLIP.map(({ phase }) => phase));
    expect([...Object.values(D1_CUSTOMER_PHASE)].every((phase) => mappedPhases.has(phase))).toBe(true);
    expect(() => resolveD1ExtraActorClip({ phase: 'guessed-fallback' }))
      .toThrow(/지원하지 않는 D1 엑스트라 actor phase/);
  });

  it('6석 visual bounds와 lower-centre pivot을 FHD/720에서 handoff 값 그대로 둔다', () => {
    expect(D1_EXTRA_ACTOR_GEOMETRY.authority).toEqual({
      artistPreflightInput: true,
      inferFromGenericSeatLayout: false,
      runtimeBindingStatus: 'not-bound',
    });
    const expected = [
      ['seat-01', [105.6, 140.4, 249.6, 453.6], [230.4, 594], [70.4, 93.6, 166.4, 302.4], [153.6, 396]],
      ['seat-02', [389.76, 140.4, 249.6, 453.6], [514.56, 594], [259.84, 93.6, 166.4, 302.4], [343.04, 396]],
      ['seat-03', [673.92, 140.4, 249.6, 453.6], [798.72, 594], [449.28, 93.6, 166.4, 302.4], [532.48, 396]],
      ['seat-04', [958.08, 140.4, 249.6, 453.6], [1082.88, 594], [638.72, 93.6, 166.4, 302.4], [721.92, 396]],
      ['seat-05', [1242.24, 140.4, 249.6, 453.6], [1367.04, 594], [828.16, 93.6, 166.4, 302.4], [911.36, 396]],
      ['seat-06', [1526.4, 140.4, 249.6, 453.6], [1651.2, 594], [1017.6, 93.6, 166.4, 302.4], [1100.8, 396]],
    ];

    const tuple = (rect) => [rect.x, rect.y, rect.width, rect.height];
    const point = (pivot) => [pivot.x, pivot.y];
    for (const [seatId, fhdBounds, fhdPivot, hdBounds, hdPivot] of expected) {
      const seat = D1_EXTRA_ACTOR_GEOMETRY.seats.find((item) => item.seatId === seatId);
      expect(tuple(seat.fhd.visualBounds)).toEqual(fhdBounds);
      expect(point(seat.fhd.pivot)).toEqual(fhdPivot);
      expect(tuple(seat.hd.visualBounds)).toEqual(hdBounds);
      expect(point(seat.hd.pivot)).toEqual(hdPivot);
    }
  });

  it('occlusion line과 foreground alpha ownership을 raster mask와 구분한다', () => {
    expect(D1_EXTRA_ACTOR_GEOMETRY.occlusion).toEqual({
      normalizedY: 0.55,
      fhdY: 594,
      hdY: 396,
      kind: 'layout-line',
      isRasterMask: false,
      pixelOwner: {
        objectKey: 'custCounter',
        layer: 'foreground',
        order: 50,
        method: 'full-frame-foreground-alpha',
      },
    });
    expect(D1_EXTRA_ACTOR_GEOMETRY.actorLayer).toEqual({ name: 'actor', z: -6 });
    expect(D1_EXTRA_ACTOR_GEOMETRY.seats.every(
      (seat) => seat.normalized.pivot.y === D1_EXTRA_ACTOR_GEOMETRY.occlusion.normalizedY,
    )).toBe(true);
  });

  it('actor raster와 투명 seatServe hit target을 분리한다', () => {
    expect(D1_EXTRA_ACTOR_GEOMETRY.interaction).toMatchObject({
      actorRasterInteractive: false,
      targetKeyPattern: 'seatServe:<seatId>',
      targetOwner: 'runtime-transparent-raycast-mesh',
      targetIsTransparent: true,
      artistPixelScope: false,
    });
    for (const seat of D1_EXTRA_ACTOR_GEOMETRY.seats) {
      expect(seat.normalized.hitBounds.width)
        .toBeGreaterThan(seat.normalized.visualBounds.width);
      expect(seat.normalized.hitBounds.height)
        .toBeGreaterThan(seat.normalized.visualBounds.height);
    }
  });

  it('commuter를 고정 인물이 아닌 이름 없는 역할 유형으로 제한한다', () => {
    expect(D1_EXTRA_ACTOR_ROLE_SEMANTICS.fixedCharacterBoundary.onlyNamedCharacters)
      .toEqual(['CHAR-AKI', 'CHAR-TSUKIOKA']);
    expect(D1_EXTRA_ACTOR_ROLE_SEMANTICS.allowed).toEqual(expect.arrayContaining([
      'quick-decisive-ordering',
      'ordinary-relief-after-a-correct-item-is-received',
    ]));
    expect(D1_EXTRA_ACTOR_ROLE_SEMANTICS.forbidden).toEqual(expect.arrayContaining([
      'personal-name-or-diegetic-display-name',
      'fixed-biography-employer-relationship-or-personal-history',
      'named-office-a-or-office-b-identity',
      'order-number-fifo-arrow-queue-priority-or-first-customer-claim',
    ]));
    expect(D1_EXTRA_ACTOR_ROLE_SEMANTICS.servingMeaning)
      .toBe('shared-prepared-item-to-player-selected-customer-to-that-customers-outstanding-order');
    expect(D1_EXTRA_ACTOR_ROLE_SEMANTICS.runtimeInstanceIdsAreDiegeticNames).toBe(false);
  });
});
