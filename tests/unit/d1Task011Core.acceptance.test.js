import { describe, expect, it } from 'vitest';
import {
  FIRST_ORDER_BASE_STEP_IDS,
  createFirstOrderGuide,
} from '../../src/d1/firstOrderGuide.js';
import { createD1CookStations } from '../../src/render/cookStations.js';

const NEGIMA = ['chicken', 'leek', 'chicken', 'leek', 'chicken'];

function expectSingleCurrentUntilComplete(guide) {
  const view = guide.view();
  expect(view.steps.filter(({ status }) => status === 'current')).toHaveLength(view.complete ? 0 : 1);
  expect(view.steps.every(({ status }) => ['complete', 'current', 'pending'].includes(status))).toBe(true);
}

function assemble(cook) {
  for (const ingredient of NEGIMA) expect(cook.clickIngredient(ingredient).ok).toBe(true);
}

describe('작업 011 firstOrderGuide 핵심 acceptance', () => {
  it('고정 단계 ID를 유지하고 완료 전 current를 정확히 하나만 제공한다', () => {
    expect(FIRST_ORDER_BASE_STEP_IDS).toEqual([
      'order.accept',
      'beer.glass',
      'beer.pour',
      'beer.finish',
      'negima.assemble.1',
      'negima.transfer.1',
      'negima.assemble.2',
      'negima.transfer.2',
      'grill.place.1',
      'grill.place.2',
      'grill.flip.1',
      'grill.flip.2',
      'grill.retrieve.1',
      'grill.retrieve.2',
      'order.complete',
    ]);

    const guide = createFirstOrderGuide();
    for (const stepId of FIRST_ORDER_BASE_STEP_IDS) {
      expectSingleCurrentUntilComplete(guide);
      expect(guide.view().currentStepId).toBe(stepId);
      expect(guide.complete(stepId)).toBe(true);
    }
    expect(guide.view()).toMatchObject({ complete: true, currentStepId: null });
    expectSingleCurrentUntilComplete(guide);
  });

  it.each([
    ['beer-first', [{ menu: 'beer', readyAt: 10 }, { menu: 'negima', readyAt: 20 }], 'serve.beer.1.card'],
    ['negima-first', [{ menu: 'beer', readyAt: 20 }, { menu: 'negima', readyAt: 10 }], 'serve.negima.1.card'],
  ])('%s 자유 제공 branch를 준비 완료 순서와 stable ID로 선택한다', (_name, prepared, firstStepId) => {
    const guide = createFirstOrderGuide();
    for (const item of prepared) guide.preparedItem(item.menu, item.readyAt);

    expect(guide.view().currentStepId).toBe(firstStepId);
    expect(guide.view().steps.filter(({ id }) => id.startsWith('serve.')).map(({ id }) => id)).toEqual(
      firstStepId.startsWith('serve.beer')
        ? [
            'serve.beer.1.card', 'serve.beer.1.customer', 'serve.beer.1.quantity',
            'serve.negima.1.card', 'serve.negima.1.customer', 'serve.negima.1.quantity',
          ]
        : [
            'serve.negima.1.card', 'serve.negima.1.customer', 'serve.negima.1.quantity',
            'serve.beer.1.card', 'serve.beer.1.customer', 'serve.beer.1.quantity',
          ],
    );
    expectSingleCurrentUntilComplete(guide);
  });

  it('현재 단계에서 invalid 3회면 그 단계만 시범 완료하고 failure 상태를 만들지 않는다', () => {
    const guide = createFirstOrderGuide();
    const currentStepId = guide.view().currentStepId;

    expect(guide.invalid('잘못된 대상')).toMatchObject({ attempt: 1, autoCompleted: false, stepId: currentStepId });
    expect(guide.invalid('잘못된 대상')).toMatchObject({ attempt: 2, autoCompleted: false, stepId: currentStepId });
    expect(guide.invalid('잘못된 대상')).toMatchObject({ attempt: 3, autoCompleted: true, stepId: currentStepId });

    const view = guide.view();
    expect(view.steps.find(({ id }) => id === currentStepId)?.status).toBe('complete');
    expect(view.currentStepId).toBe('beer.glass');
    expectSingleCurrentUntilComplete(guide);
  });
});

describe('작업 011 D1 cookStations 핵심 acceptance', () => {
  it('조립 완료 뒤 명시적 transfer 전에는 대기 수량과 다음 조립이 진행되지 않는다', () => {
    const cook = createD1CookStations();
    assemble(cook);

    expect(cook.assemblyComplete()).toBe(true);
    expect(cook.waitingCount()).toBe(0);
    expect(cook.clickIngredient('chicken')).toEqual({ ok: false, reason: 'transfer-required' });
    expect(cook.transferAssembly()).toMatchObject({ ok: true, transferred: true, waiting: 1 });
    expect(cook.assemblyComplete()).toBe(false);
    expect(cook.assemblyIndex()).toBe(0);
    expect(cook.waitingCount()).toBe(1);
  });

  it('D1은 2칸/batch2이며 첫 꼬치는 time0 staged, 둘째 배치 시각에 두 칸이 함께 시작한다', () => {
    const cook = createD1CookStations();
    expect(cook.slotCount()).toBe(2);

    assemble(cook);
    cook.transferAssembly();
    assemble(cook);
    cook.transferAssembly();

    expect(cook.placeToGrill(1_000)).toMatchObject({
      slot: 0,
      staged: true,
      batchStarted: false,
      remainingForBatch: 1,
    });
    expect(cook.slotViews(50_000)[0]).toMatchObject({
      status: 'staged',
      cooking: false,
      frontElapsedSec: 0,
      backElapsedSec: 0,
    });

    expect(cook.placeToGrill(5_000)).toMatchObject({
      slot: 1,
      staged: false,
      batchStarted: true,
      startedSlots: [0, 1],
    });
    expect(cook.slotViews(5_000)).toEqual([
      expect.objectContaining({ status: 'front', cooking: true, frontElapsedSec: 0 }),
      expect.objectContaining({ status: 'front', cooking: true, frontElapsedSec: 0 }),
    ]);
    expect(cook.slotViews(13_000).map(({ frontElapsedSec }) => frontElapsedSec)).toEqual([8, 8]);
  });
});
