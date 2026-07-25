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
uniform vec2 uRawToCookEdge;
uniform vec3 uBurntColor;
uniform float uBurntLuminance;
uniform float uBurntMix;
uniform vec2 uCookToBurntEdge;
uniform vec3 uCharColor;
uniform float uCharNoiseScale;
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
    vec3 done = base * uCookedTint;
    done = (done - 0.5) * uCookedContrast + 0.5;
    done += uCookedWarmth * lum;

    // 탄 상태: 명도를 죽이고 적갈색만 남긴다
    vec3 burnt = mix(vec3(lum * uBurntLuminance), uBurntColor, uBurntMix);

    // 0 → 0.5 구간과 0.5 → 1 구간을 나눠 보간
    vec3 c = mix(raw, done, smoothstep(uRawToCookEdge.x, uRawToCookEdge.y, d));
    c = mix(c, burnt, smoothstep(uCookToBurntEdge.x, uCookToBurntEdge.y, d));
    return c;
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
    float char = smoothstep(charThreshold, charThreshold + uCharSoftness, n);

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

    // 탄 부분은 광택이 죽는다
    float gloss = uTareAmount * (1.0 - char * 0.75);
    col += uTareSheen * spec * gloss * uTareGloss;

    // 타레 자체의 색(간장 베이스) — 도포량만큼 어둡고 붉게
    col = mix(col, col * uTareTint, uTareAmount * uTareTintAmount);

    // ── 숯불 반사광 ───────────────────────────────────────────
    // 굽는 중일 때 아래쪽에서 주황빛이 흔들리며 올라온다.
    float cooking = smoothstep(uEmberCookWindow.x, 0.3, uDoneness)
        * (1.0 - smoothstep(uEmberCookWindow.y, 1.0, uDoneness));
    float flicker = 0.75 + 0.25
        * sin(uTime * uEmberFlickerSpeed.x)
        * sin(uTime * uEmberFlickerSpeed.y + 1.7);
    float fromBelow = smoothstep(uEmberRise.x, uEmberRise.y, vUv.y);
    col += uEmberColor * cooking * flicker * fromBelow * uEmberIntensity;

    fragColor = vec4(col, tex.a);
}
