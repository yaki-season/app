import { GRILL_PARAMS } from './grillShaderParams.js';

// Artist 1 승인 MDL-NEGIMA-GRILL-COOKING-SECOND-FACE R3의 runtime 색 계약.
// 시간·품질·뒤집기 판정은 바꾸지 않고, 첫 뒤집기 뒤 보이는 면의 cooked-base만 조정한다.
export const SECOND_FACE_R3_PARAMS = Object.freeze({
  rawTint: Object.freeze([0.90, 0.79, 0.61]),
  rawSaturation: 0.92,
  cookedTint: Object.freeze([1.00, 0.72, 0.40]),
  cookedWarmth: Object.freeze([0.12, 0.055, 0.005]),
});

export function d1SecondFaceR3Params(view) {
  return view?.cooking && view.orientationFaceDown === 'back'
    ? SECOND_FACE_R3_PARAMS
    : Object.freeze({
      rawTint: GRILL_PARAMS.rawTint,
      rawSaturation: GRILL_PARAMS.rawSaturation,
      cookedTint: GRILL_PARAMS.cookedTint,
      cookedWarmth: GRILL_PARAMS.cookedWarmth,
    });
}
