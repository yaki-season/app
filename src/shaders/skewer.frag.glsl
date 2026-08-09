#version 300 es
precision highp float;

// ─────────────────────────────────────────────────────────────
// 익힘 셰이더 (TECH-REND-001 §2.1)
//
//   uDoneness   0 = 날것 → 0.5 = Perfect → 1 = 탄 상태
//   uTareAmount 0~1, 타레(양념) 도포량 → 광택으로 표현
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
    // Preserve the source artwork: chicken becomes amber-golden while leek keeps
    // its cream/green identity instead of receiving one flat muddy-brown tint.
    float leek = smoothstep(0.015, 0.14, base.g - base.r);
    vec3 corrected = base * uCookedTint;
    corrected = (corrected - 0.5) * uCookedContrast + 0.5;
    corrected += uCookedWarmth * lum;

    // 목표색을 명도로 보간해 굽힌 윤기를 만든다. 단일 색으로 mix하면 평평해져 식욕이 죽는다.
    float shade = smoothstep(0.015, 0.42, lum);
    vec3 chickenGolden = mix(corrected, mix(uGlazeChickenShadow, uGlazeChickenLight, shade), uGlazeAmount);
    vec3 leekGolden = mix(corrected, mix(uGlazeLeekShadow, uGlazeLeekLight, shade),
                          uGlazeAmount * uGlazeLeekRatio);
    vec3 done = mix(chickenGolden, leekGolden, leek);

    // Reference-driven tare caramelisation: sparse glossy red-amber patches,
    // never a grey coat over the entire skewer.
    float caramelNoise = fbm(vUv * 11.0 + vec2(3.7, 8.1));
    float caramel = smoothstep(0.46, 0.78, caramelNoise) * smoothstep(0.34, 0.78, d);
    float highlightGuard = 1.0 - smoothstep(0.45, 0.96, lum);
    vec3 caramelColor = mix(uCaramelShadow, uCaramelLight, lum);
    done = mix(done, caramelColor, caramel * highlightGuard * mix(0.62, 0.20, leek));

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
    float tareApplied = smoothstep(0.22, 0.55, uDoneness);
    // 탄 부분은 광택이 죽는다
    float gloss = uTareAmount * (1.0 - char * 0.75) * tareApplied;
    col += uTareSheen * spec * gloss * uTareGloss;

    // 타레 자체의 색(간장 베이스) — 도포량만큼 어둡고 붉게
    col = mix(col, col * uTareTint, uTareAmount * uTareTintAmount * tareApplied);

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
