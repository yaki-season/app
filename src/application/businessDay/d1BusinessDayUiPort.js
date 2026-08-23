import {
  D1_UI_ERROR_CODE,
  D1_UI_INTENT,
  commandForD1UiIntent,
  createD1UiError,
  errorCodeForD1Finalization,
  errorCodeForD1UiReason,
  freezeD1UiValue,
} from './d1BusinessDayUiContract.js';
import {
  buildD1BusinessDayViewModel,
  canServeD1MenuToSeat,
} from './d1BusinessDayViewModel.js';

export {
  D1_UI_ERROR_CODE,
  D1_UI_INTENT,
  buildD1BusinessDayViewModel,
  canServeD1MenuToSeat,
};

function failureResult(port, code, reason = null, details = {}) {
  return {
    ok: false,
    error: createD1UiError(code, reason, details),
    view: port.getViewModel(),
  };
}

export class D1BusinessDayUiPort {
  constructor({ runtime, definition }) {
    if (!runtime) throw new TypeError('D1 runtime이 필요합니다.');
    if (!definition) throw new TypeError('D1 definition이 필요합니다.');
    this.runtime = runtime;
    this.definition = definition;
  }

  getViewModel() {
    return buildD1BusinessDayViewModel(this.runtime.getState(), this.definition);
  }

  getStatus() {
    const runtimeStatus = this.runtime.getStatus();
    const state = this.runtime.getState();
    return freezeD1UiValue({
      ...runtimeStatus,
      phase: state?.phase ?? null,
      viewReady: state !== null,
    });
  }

  async start(options) {
    const result = await this.runtime.start(options);
    if (!result.ok) {
      return failureResult(
        this,
        D1_UI_ERROR_CODE.SAVE_FAILED,
        result.error?.code ?? null,
      );
    }
    return { ok: true, view: this.getViewModel(), checkpoint: result.checkpoint };
  }

  advance(deltaMs) {
    if (!this.runtime.getState()) {
      return failureResult(this, D1_UI_ERROR_CODE.NOT_STARTED);
    }
    this.runtime.advance(deltaMs);
    return { ok: true, view: this.getViewModel() };
  }

  dispatch(intent) {
    const state = this.runtime.getState();
    if (!state) return failureResult(this, D1_UI_ERROR_CODE.NOT_STARTED);
    if (!intent || typeof intent !== 'object') {
      return failureResult(this, D1_UI_ERROR_CODE.INVALID_INTENT);
    }

    const command = commandForD1UiIntent(state, intent);
    if (command === null) {
      return failureResult(
        this,
        D1_UI_ERROR_CODE.INVALID_INTENT,
        'intent-id-required',
      );
    }
    if (command === undefined) {
      return failureResult(this, D1_UI_ERROR_CODE.UNSUPPORTED_INTENT, intent.type);
    }

    const result = this.runtime.dispatch(command);
    if (!result.applied && !result.duplicate) {
      return failureResult(this, errorCodeForD1UiReason(result.reason), result.reason, {
        expectedMenuId: result.expectedMenuId ?? null,
        maxRiskProcesses: result.maxRiskProcesses ?? null,
      });
    }
    return {
      ok: true,
      applied: result.applied,
      duplicate: result.duplicate,
      partial: result.partial ?? false,
      remaining: result.remaining ?? null,
      completedOrder: result.completedOrder ?? false,
      left: result.left ?? false,
      stepId: result.stepId ?? null,
      view: this.getViewModel(),
    };
  }

  async finalize() {
    if (!this.runtime.getState()) {
      return failureResult(this, D1_UI_ERROR_CODE.NOT_STARTED);
    }
    const result = await this.runtime.finalize();
    if (!result.ok) {
      return failureResult(
        this,
        errorCodeForD1Finalization(result.reason),
        result.reason ?? result.error?.code ?? null,
        { errors: result.errors ?? [] },
      );
    }
    return {
      ok: true,
      duplicate: result.duplicate,
      campaign: result.campaign,
      settlement: result.settlement,
      save: result.save,
      view: this.getViewModel(),
    };
  }
}
