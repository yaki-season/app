// 꼬치 익힘 셰이더의 조정 가능한 시각 파라미터.
// 판정 시간은 gameState가 소유하며, 이 값들은 판정 결과를 바꾸지 않는다.
function freezeParams(params) {
  for (const value of Object.values(params)) {
    if (Array.isArray(value)) Object.freeze(value);
  }
  return Object.freeze(params);
}

export const GRILL_PARAMS = freezeParams({
  // 굽기 전에는 승인 원본 재질이, 굽기 시작하면 같은 평면에서 이 셰이더가 그린다. 두 재질이
  // doneness 0에서 같은 색을 내야 올리자마자 색이 튀지 않는다. 그래서 raw 단계는 항등이다.
  rawTint: [1.0, 1.0, 1.0],
  rawSaturation: 1.0,
  cookedTint: [1.03, 0.96, 0.82],
  cookedContrast: 1.08,
  cookedWarmth: [0.035, 0.014, 0.0],
  // 타레 글레이즈 목표색. 명도에 따라 그림자→하이라이트로 보간해 굽힌 윤기를 만든다.
  // 닭은 호박빛, 파는 크림빛을 유지한다(레퍼런스: 파는 갈변해도 아이보리로 남는다).
  // Reference palette (linear RGB): golden cooked flesh, amber tare,
  // deep-brown sear marks, and warm grilled negi.
  glazeChickenShadow: [0.1812, 0.0976, 0.0612], // #765846
  glazeChickenLight: [0.6795, 0.3231, 0.0742],  // #d79a4d
  glazeLeekShadow: [0.0369, 0.0595, 0.0103],    // #36451a
  glazeLeekLight: [0.2542, 0.2664, 0.0319],     // #8a8d32
  // 값은 모두 선형 공간이다. three가 sRGB 텍스처를 하드웨어 디코드해 넘기고 셰이더가
  // 출력에서만 다시 인코딩하므로, 의도한 sRGB 색을 선형으로 변환해 둔다.
  glazeAmount: 1.0,
  glazeLeekRatio: 1.0,
  // 타레가 눌어붙은 자국. 거의 검은 얼룩이 아니라 붉은 호박색 윤기여야 한다.
  caramelShadow: [0.1195, 0.0194, 0.0075], // #612615
  caramelLight: [0.4793, 0.1119, 0.0176],  // #b85e24
  // 적정(uDoneness 0.5)에서 다 익은 색에 도달한다. 그 뒤로는 캐러멜·그을음·탄색이 이어받아
  // 계속 변한다. 이 상한을 늘리면 적정까지 색이 거의 안 변해 '안 익는다'로 보인다.
  // 올린 직후에는 생것 그대로 두고, 잠시 뒤부터 적정(0.5)까지 서서히 익는다.
  // 하한을 0으로 두면 올리자마자 색이 변하기 시작해 '즉시 바뀐다'로 보인다.
  rawToCookEdge: [0.16, 0.5],
  // 탄 상태도 회색으로 탈색하지 않고 따뜻한 갈색을 남긴다.
  burntColor: [0.030, 0.0075, 0.0029],
  burntLuminance: 0.34,
  burntMix: 0.55,
  cookToBurntEdge: [0.80, 1.0],
  charColor: [0.0125, 0.0041, 0.0020],
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
  tareAmount: 0.32,
  tareSheen: [1.00, 0.674, 0.296],
  tareSpecPower: 30.0,
  tareGloss: 0.82,
  tareNormalStrength: 2.2,
  tareTint: [0.88, 0.56, 0.23],
  tareTintAmount: 0.07,
  // ── 양념 구분색 ──
  // tareSeasoned는 "이 꼬치에 타레를 발랐는가"(0/1)다. 기본값 0이라 아무것도 바꾸지 않고,
  // 실제로 바른 꼬치에만 아래 갈색 코팅이 들어가 소금 꼬치와 한눈에 구분된다.
  tareSeasoned: 0.0,
  tareCoatColor: [0.88, 0.56, 0.23],
  tareCoatAmount: 0.78,
  tareRawCoat: 0.62,
  emberColor: [0.147, 0.022, 0.0023],
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
  tareSeasoned: [0.0, 1.0],
  tareCoatAmount: [0.0, 1.0],
  tareRawCoat: [0.0, 1.0],
  emberIntensity: [0.0, 1.5],
});

// 셰이더의 양념 구분색(uTareCoatColor × uTareCoatAmount)을 곱셈 색 하나로 접은 값.
// 라스터 단계 스프라이트(모모·토리카와)가 같은 갈색을 쓰도록 여기서 한 번만 정의한다.
// 반환값은 선형 RGB 배수다.
export function tareCoatMultiplier(params = GRILL_PARAMS) {
  const amount = Math.max(0, Math.min(1, params.tareCoatAmount));
  return Object.freeze(params.tareCoatColor.map((channel) => 1 - amount + amount * channel));
}
