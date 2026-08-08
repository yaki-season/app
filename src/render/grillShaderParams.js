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
  cookedTint: [1.06, 0.94, 0.80],
  cookedContrast: 1.10,
  cookedWarmth: [0.06, 0.026, 0.0],
  // 타레 글레이즈 목표색. 명도에 따라 그림자→하이라이트로 보간해 굽힌 윤기를 만든다.
  // 닭은 호박빛, 파는 크림빛을 유지한다(레퍼런스: 파는 갈변해도 아이보리로 남는다).
  glazeChickenShadow: [0.74, 0.42, 0.19],
  glazeChickenLight: [1.14, 0.88, 0.57],
  glazeLeekShadow: [0.58, 0.57, 0.36],
  glazeLeekLight: [1.02, 1.00, 0.80],
  glazeAmount: 0.62,
  glazeLeekRatio: 0.42,
  // 타레가 눌어붙은 자국. 거의 검은 얼룩이 아니라 붉은 호박색 윤기여야 한다.
  caramelShadow: [0.55, 0.20, 0.06],
  caramelLight: [0.88, 0.42, 0.12],
  rawToCookEdge: [0.0, 0.55],
  // 탄 상태도 회색으로 탈색하지 않고 따뜻한 갈색을 남긴다.
  burntColor: [0.19, 0.082, 0.038],
  burntLuminance: 0.34,
  burntMix: 0.55,
  cookToBurntEdge: [0.80, 1.0],
  charColor: [0.115, 0.052, 0.026],
  charNoiseScale: 7.0,
  charStartDoneness: 0.70,
  charThreshold: [1.05, 0.42],
  charSoftness: 0.16,
  charEdgeBias: 0.55,
  charEdgeRange: [0.18, 0.62],
  charBase: 0.26,
  charStrength: 0.85,
  // 석쇠 살에 닿은 가로 띠에서만 탄다. 전면 노이즈만 쓰면 중앙까지 그을려 탁해진다.
  charBandScale: 26.0,
  charBandSharpness: 2.6,
  charBandWeight: 0.82,
  tareAmount: 0.42,
  tareSheen: [1.0, 0.82, 0.55],
  tareSpecPower: 30.0,
  tareGloss: 1.15,
  tareNormalStrength: 2.2,
  tareTint: [1.0, 0.86, 0.68],
  tareTintAmount: 0.10,
  emberColor: [0.42, 0.16, 0.03],
  emberFlickerSpeed: [7.3, 3.1],
  emberRise: [0.85, 0.15],
  emberIntensity: 0.06,
  emberCookWindow: [0.04, 0.85],
});

export const GRILL_PARAM_RANGES = freezeParams({
  rawSaturation: [0.8, 1.4],
  cookedContrast: [1.0, 1.6],
  burntLuminance: [0.0, 0.4],
  burntMix: [0.0, 1.0],
  charNoiseScale: [2.0, 16.0],
  charStartDoneness: [0.3, 0.95],
  glazeAmount: [0.0, 1.0],
  glazeLeekRatio: [0.0, 1.0],
  charBandScale: [4.0, 48.0],
  charBandSharpness: [1.0, 6.0],
  charBandWeight: [0.0, 1.0],
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
