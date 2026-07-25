// 꼬치 익힘 셰이더의 조정 가능한 시각 파라미터.
// 판정 시간은 gameState가 소유하며, 이 값들은 판정 결과를 바꾸지 않는다.
function freezeParams(params) {
  for (const value of Object.values(params)) {
    if (Array.isArray(value)) Object.freeze(value);
  }
  return Object.freeze(params);
}

export const GRILL_PARAMS = freezeParams({
  rawTint: [1.06, 0.97, 0.98],
  rawSaturation: 1.15,
  cookedTint: [1.02, 0.74, 0.42],
  cookedContrast: 1.22,
  cookedWarmth: [0.10, 0.045, 0.0],
  rawToCookEdge: [0.0, 0.55],
  burntColor: [0.13, 0.055, 0.03],
  burntLuminance: 0.16,
  burntMix: 0.62,
  cookToBurntEdge: [0.62, 1.0],
  charColor: [0.055, 0.035, 0.028],
  charNoiseScale: 7.0,
  charStartDoneness: 0.55,
  charThreshold: [1.05, 0.18],
  charSoftness: 0.22,
  charEdgeBias: 0.85,
  charEdgeRange: [0.18, 0.62],
  charBase: 0.55,
  charStrength: 0.88,
  tareAmount: 0.42,
  tareSheen: [1.0, 0.82, 0.55],
  tareSpecPower: 22.0,
  tareGloss: 1.5,
  tareNormalStrength: 2.2,
  tareTint: [0.88, 0.68, 0.45],
  tareTintAmount: 0.35,
  emberColor: [0.42, 0.16, 0.03],
  emberFlickerSpeed: [7.3, 3.1],
  emberRise: [0.85, 0.15],
  emberIntensity: 0.5,
  emberCookWindow: [0.04, 0.85],
});

export const GRILL_PARAM_RANGES = freezeParams({
  rawSaturation: [0.8, 1.4],
  cookedContrast: [1.0, 1.6],
  burntLuminance: [0.0, 0.4],
  burntMix: [0.0, 1.0],
  charNoiseScale: [2.0, 16.0],
  charStartDoneness: [0.3, 0.8],
  charSoftness: [0.05, 0.5],
  charEdgeBias: [0.0, 1.5],
  charBase: [0.0, 1.0],
  charStrength: [0.0, 1.0],
  tareAmount: [0.0, 1.0],
  tareSpecPower: [4.0, 48.0],
  tareGloss: [0.0, 3.0],
  tareNormalStrength: [0.5, 5.0],
  tareTintAmount: [0.0, 1.0],
  emberIntensity: [0.0, 1.5],
});
