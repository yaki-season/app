#version 300 es
precision highp float;

// ─────────────────────────────────────────────────────────────
// 익힘 셰이더 (TECH-REND-001 §2.1)
//
//   uDoneness   0 = 날것 → 0.5 = Perfect → 1 = 탄 상태
//   uTareAmount  0~1, 굽기 연출용 타레 글레이즈 세기(광택·미세 틴트)
//   uTareSeasoned 0/1, 이 꼬치에 실제로 타레를 발랐는가 (게임 상태)
//                소금 꼬치와 한눈에 구분되는 간장 갈색 코팅을 이 값만 켠다.
//   uTareRawCoat 굽기 전에도 남는 코팅 비율. 조립대에서 바른 직후부터
//                색이 구분돼야 하므로 0이 아니다.
//
// 구현: 베이스 텍스처 → 익힘 색 lerp
//       + 그을음 마스크(노이즈, doneness 임계로 확장)
//       + 타레 스페큘러
//
// 값의 소유권: uDoneness의 진행 계산은 게임 시스템(파트너) 담당.
//              이 셰이더는 받은 값을 그리기만 한다.
// ─────────────────────────────────────────────────────────────

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform float uDoneness;
uniform float uTareAmount;
uniform float uTime;
uniform vec2  uTexSize;
uniform vec3 uRawTint;
uniform float uRawSaturation;
uniform vec3 uCookedTint;
uniform float uCookedContrast;
uniform vec3 uCookedWarmth;
uniform vec3 uGlazeChickenShadow;
uniform vec3 uGlazeChickenLight;
uniform vec3 uGlazeLeekShadow;
uniform vec3 uGlazeLeekLight;
uniform float uGlazeAmount;
uniform float uGlazeLeekRatio;
uniform vec3 uCaramelShadow;
uniform vec3 uCaramelLight;
uniform vec2 uRawToCookEdge;
uniform vec3 uBurntColor;
uniform float uBurntLuminance;
uniform float uBurntMix;
uniform vec2 uCookToBurntEdge;
uniform vec3 uCharColor;
uniform float uCharNoiseScale;
uniform float uCharBandScale;
uniform float uCharBandSharpness;
uniform float uCharBandWeight;
uniform float uCharStartDoneness;
uniform vec2 uCharThreshold;
uniform float uCharSoftness;
uniform float uCharEdgeBias;
uniform vec2 uCharEdgeRange;
uniform float uCharBase;
uniform float uCharStrength;
uniform vec3 uTareSheen;
uniform float uTareSpecPower;
uniform float uTareGloss;
uniform float uTareNormalStrength;
uniform vec3 uTareTint;
uniform float uTareTintAmount;
uniform float uTareSeasoned;
uniform vec3 uTareCoatColor;
uniform float uTareCoatAmount;
uniform float uTareRawCoat;
uniform vec3 uEmberColor;
uniform vec2 uEmberFlickerSpeed;
uniform vec2 uEmberRise;
uniform float uEmberIntensity;
uniform vec2 uEmberCookWindow;

// ── 노이즈 ────────────────────────────────────────────────────

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);           // smoothstep 보간
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 그을음은 얼룩덜룩해야 하므로 옥타브 3단 누적
float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 3; i++) {
        v += valueNoise(p) * amp;
        p *= 2.13;
        amp *= 0.5;
    }
    return v;
}

// ── 익힘 색 ───────────────────────────────────────────────────
// 날것(분홍빛·밝음) → Perfect(황갈색·대비↑) → 탄 상태(암갈색)

vec3 cookColor(vec3 base, float d) {
    float lum = dot(base, vec3(0.299, 0.587, 0.114));

    // 날것: 살짝 탈색된 분홍
    vec3 raw = mix(vec3(lum), base, uRawSaturation) * uRawTint;

    // Perfect: 마이야르 반응 — 황갈색으로 굽고 대비를 올린다
    // Preserve the source detail while mapping it onto the sampled reference palette.
    // sRGB 텍스처가 선형 공간으로 디코드되면 파의 G-R 차가 작아진다. 좁은 경계로
    // 닭과 파를 다시 분리해, 적정 단계에서도 파의 녹색이 회색으로 죽지 않게 한다.
    float leek = smoothstep(0.50, 0.68, base.g / max(base.r, 0.001));
    vec3 corrected = base * uCookedTint;
    corrected = (corrected - 0.5) * uCookedContrast + 0.5;
    corrected += uCookedWarmth * lum;

    // 목표색을 명도로 보간해 굽힌 윤기를 만든다. 단일 색으로 mix하면 평평해져 식욕이 죽는다.
    float shade = smoothstep(0.045, 0.28, lum);
    vec3 chickenGolden = mix(corrected, mix(uGlazeChickenShadow, uGlazeChickenLight, shade), uGlazeAmount);
    vec3 leekGolden = mix(corrected, mix(uGlazeLeekShadow, uGlazeLeekLight, shade),
                          uGlazeAmount * uGlazeLeekRatio);
    vec3 done = mix(chickenGolden, leekGolden, leek);
    float chicken = 1.0 - leek;
    float foodMask = smoothstep(0.075, 0.16, lum);

    // Ingredient silhouette and folds receive direct heat first. Sampling alpha two source
    // pixels away creates a wider, irregular rim instead of recolouring the whole sprite.
    vec2 detailTexel = 2.0 / uTexSize;
    float neighbourAlpha = min(
        min(texture(uTex, vUv + vec2(detailTexel.x, 0.0)).a,
            texture(uTex, vUv - vec2(detailTexel.x, 0.0)).a),
        min(texture(uTex, vUv + vec2(0.0, detailTexel.y)).a,
            texture(uTex, vUv - vec2(0.0, detailTexel.y)).a)
    );
    float heatEdge = (1.0 - smoothstep(0.08, 0.92, neighbourAlpha)) * foodMask;
    float crease = (1.0 - smoothstep(0.065, 0.17, lum)) * foodMask;

    // Fatty highlights stay juicy and golden. Only the pockets reaching a hot edge are
    // converted to deep rendered-fat brown below.
    float fatNoise = fbm(vUv * vec2(8.0, 13.0) + vec2(6.2, 2.7));
    float fatPocket = chicken * foodMask * smoothstep(0.18, 0.38, lum)
        * smoothstep(0.42, 0.68, fatNoise);
    vec3 fatGold = mix(uGlazeChickenLight, uTareSheen, 0.16);
    done = mix(done, fatGold, fatPocket * 0.34 * smoothstep(0.12, 0.38, d));

    // Reference-driven tare caramelisation: sparse glossy red-amber patches,
    // never a grey coat over the entire skewer.
    float caramelNoise = fbm(vUv * vec2(4.2, 8.0) + vec2(3.7, 8.1));
    // 적정 구간부터 회갈색 살결 사이에 불규칙한 갈색 소스 자국만 남긴다.
    float caramel = smoothstep(0.40, 0.56, caramelNoise) * smoothstep(0.18, 0.42, d);
    float highlightGuard = 1.0 - smoothstep(0.60, 0.98, lum);
    vec3 caramelColor = mix(uCaramelShadow, uCaramelLight, smoothstep(0.04, 0.30, lum));
    done = mix(done, caramelColor,
               caramel * highlightGuard * foodMask * mix(0.82, 0.18, leek));

    // Rendered fat chars at the exposed rim; recessed meat folds brown more gently.
    float renderedFatSear = heatEdge * fatPocket;
    float structuralSear = clamp(heatEdge * 0.72 + crease * 0.34 + renderedFatSear * 0.55,
                                 0.0, 1.0)
        * smoothstep(0.18, 0.44, d);
    done = mix(done, uCaramelShadow, structuralSear * mix(0.68, 0.48, leek));

    // Broken diagonal sear marks: one or two short dark-brown contacts per ingredient,
    // gated by the source luminance so the bamboo shaft is not painted like meat.
    float grillBand = pow(abs(sin((vUv.y * 17.0 + vUv.x * 1.6) * 3.14159265)), 12.0);
    float brokenBand = smoothstep(0.36, 0.58,
        fbm(vUv * vec2(6.0, 10.0) + vec2(1.9, 4.3)));
    float earlySear = grillBand * brokenBand * foodMask * smoothstep(0.20, 0.44, d);
    done = mix(done, uCaramelShadow, earlySear * mix(0.72, 0.34, leek));

    // 탄 상태: 회색으로 탈색하지 않는다. 구워진 색을 눌러 따뜻한 갈색을 남긴다.
    vec3 burnt = mix(done * uBurntLuminance, uBurntColor, uBurntMix);

    // 0 → 0.5 구간과 0.5 → 1 구간을 나눠 보간
    vec3 c = mix(raw, done, smoothstep(uRawToCookEdge.x, uRawToCookEdge.y, d));
    c = mix(c, burnt, smoothstep(uCookToBurntEdge.x, uCookToBurntEdge.y, d));
    return c;
}

// three는 sRGB 텍스처를 SRGB8_ALPHA8로 올리므로 texture()는 이미 선형값을 준다. 반면 원시
// ShaderMaterial 출력에는 색공간 변환을 걸어주지 않는다. 따라서 계산은 선형에서 하고 출력만
// sRGB로 인코딩해야 doneness 0에서 승인 원본 재질과 픽셀이 일치한다. 이게 어긋나면 굽기
// 시작 순간 재질이 교체되며 색이 튄다.
vec3 linearToSrgb(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
    vec4 tex = texture(uTex, vUv);

    // 배경(투명 픽셀)은 건드리지 않는다
    if (tex.a < 0.01) {
        fragColor = vec4(0.0);
        return;
    }

    vec3 col = cookColor(tex.rgb, uDoneness);

    // ── 그을음 마스크 ─────────────────────────────────────────
    // doneness 0.55부터 나타나기 시작해 1.0에서 거의 전면을 덮는다.
    float n = fbm(vUv * uCharNoiseScale);
    float charThreshold = mix(
        uCharThreshold.x,
        uCharThreshold.y,
        smoothstep(uCharStartDoneness, 1.0, uDoneness)
    );
    // 석쇠 살에 닿은 가로 띠에서만 탄다. 전면 노이즈만 쓰면 중앙까지 그을려 탁해진다.
    float band = pow(abs(sin(vUv.y * uCharBandScale)), uCharBandSharpness);
    float contact = mix(1.0, band, uCharBandWeight);
    float char = smoothstep(charThreshold, charThreshold + uCharSoftness, n * contact);

    // 가장자리가 먼저 탄다 — 중심에서 멀수록 가중
    float edge = smoothstep(uCharEdgeRange.x, uCharEdgeRange.y, length(vUv - 0.5));
    char = clamp(char * (uCharBase + edge * uCharEdgeBias), 0.0, 1.0);

    col = mix(col, uCharColor, char * uCharStrength);

    // ── 타레 스페큘러 ─────────────────────────────────────────
    // 텍스처 명도 기울기로 가짜 노멀을 만들어 광택을 얹는다.
    vec2 texel = 1.0 / uTexSize;
    float lC = dot(texture(uTex, vUv).rgb,                     vec3(0.299, 0.587, 0.114));
    float lX = dot(texture(uTex, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float lY = dot(texture(uTex, vUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    vec3 nrm = normalize(vec3(
        (lC - lX) * uTareNormalStrength,
        (lC - lY) * uTareNormalStrength,
        1.0
    ));

    vec3 lightDir = normalize(vec3(0.35, 0.55, 0.75));
    vec3 viewDir  = vec3(0.0, 0.0, 1.0);
    vec3 halfDir  = normalize(lightDir + viewDir);
    float spec = pow(max(dot(nrm, halfDir), 0.0), uTareSpecPower);

    // 타레는 굽는 동안 발린다. 날것에 광택·틴트를 얹으면 승인 아트의 생고기·생파 색이
    // 왜곡된다. doneness가 올라가야 나타나게 한다.
    // 타레는 적정 구간에 가까워질수록 발린다. 0.06부터 올리면 올린 지 1~2초 만에 광택·틴트가
    // 최대로 들어와 생파의 녹색이 초반에 사라지고 '올리자마자 바뀐다'로 보인다.
    // 타레는 조립대에서 바르는 순간부터 소금 꼬치와 구분돼야 한다. 굽기 전에는 uTareRawCoat
    // 만큼 옅은 간장색으로 깔리고, 구우면서 캐러멜라이즈로 짙어지며, 다 구운 뒤에도 남는다.
    // (예전에는 0.22 미만 doneness에서 코팅이 아예 0이라 생꼬치가 소금과 똑같이 보였다.)
    float caramelised = smoothstep(0.22, 0.55, uDoneness);
    float tareApplied = mix(uTareRawCoat, 1.0, caramelised);
    // 탄 부분은 광택이 죽는다. 실제로 바른 꼬치는 굽기 전에도 소스가 젖어 있어 광택이 있다.
    float glossPresence = max(uTareAmount, uTareSeasoned);
    float gloss = glossPresence * (1.0 - char * 0.75) * tareApplied;
    col += uTareSheen * spec * gloss * uTareGloss;

    // 굽기 연출용 미세 글레이즈(모든 꼬치 공통)
    col = mix(col, col * uTareTint, uTareAmount * uTareTintAmount * caramelised);

    // 양념 구분색: 타레를 실제로 바른 꼬치만 간장 갈색을 입는다. 바른 직후에는 옅게,
    // 구우면서 캐러멜라이즈로 짙어지고, 다 구운 뒤에도 그대로 남는다.
    col = mix(col, col * uTareCoatColor, uTareSeasoned * uTareCoatAmount * tareApplied);

    // ── 숯불 반사광 ───────────────────────────────────────────
    // 굽는 중일 때 아래쪽에서 주황빛이 흔들리며 올라온다.
    float cooking = smoothstep(uEmberCookWindow.x, 0.3, uDoneness)
        * (1.0 - smoothstep(uEmberCookWindow.y, 1.0, uDoneness));
    float flicker = 0.75 + 0.25
        * sin(uTime * uEmberFlickerSpeed.x)
        * sin(uTime * uEmberFlickerSpeed.y + 1.7);
    float fromBelow = smoothstep(uEmberRise.x, uEmberRise.y, vUv.y);
    col += uEmberColor * cooking * flicker * fromBelow * uEmberIntensity;

    fragColor = vec4(linearToSrgb(col), tex.a);
}
