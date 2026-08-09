import { GRILL_PARAMS } from './grillShaderParams.js';

// Artist 1 승인 MDL-NEGIMA-GRILL-COOKING-SECOND-FACE R3의 runtime 색 계약.
// 시간·품질·뒤집기 판정은 바꾸지 않고, 첫 뒤집기 뒤 보이는 면의 cooked-base만 조정한다.
export const SECOND_FACE_R3_PARAMS = Object.freeze({
  // 뒷면도 raw 단계는 승인 원본과 같아야 재질 교체가 눈에 띄지 않는다.
  rawTint: Object.freeze([1.0, 1.0, 1.0]),
  rawSaturation: 1.0,
  cookedTint: Object.freeze([1.03, 0.96, 0.82]),
  cookedWarmth: Object.freeze([0.035, 0.014, 0.0]),
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
