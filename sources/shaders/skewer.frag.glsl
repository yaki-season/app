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
    vec3 raw = mix(vec3(lum), base, 1.15) * vec3(1.06, 0.97, 0.98);

    // Perfect: 마이야르 반응 — 황갈색으로 굽고 대비를 올린다
    vec3 done = base * vec3(1.02, 0.74, 0.42);
    done = (done - 0.5) * 1.22 + 0.5;
    done += vec3(0.10, 0.045, 0.0) * lum;

    // 탄 상태: 명도를 죽이고 적갈색만 남긴다
    vec3 burnt = mix(vec3(lum * 0.16), vec3(0.13, 0.055, 0.03), 0.62);

    // 0 → 0.5 구간과 0.5 → 1 구간을 나눠 보간
    vec3 c = mix(raw,  done,  smoothstep(0.0, 0.55, d));
    c      = mix(c,    burnt, smoothstep(0.62, 1.0,  d));
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
    float n = fbm(vUv * 7.0);
    float charThreshold = mix(1.05, 0.18, smoothstep(0.55, 1.0, uDoneness));
    float char = smoothstep(charThreshold, charThreshold + 0.22, n);

    // 가장자리가 먼저 탄다 — 중심에서 멀수록 가중
    float edge = smoothstep(0.18, 0.62, length(vUv - 0.5));
    char = clamp(char * (0.55 + edge * 0.85), 0.0, 1.0);

    col = mix(col, vec3(0.055, 0.035, 0.028), char * 0.88);

    // ── 타레 스페큘러 ─────────────────────────────────────────
    // 텍스처 명도 기울기로 가짜 노멀을 만들어 광택을 얹는다.
    vec2 texel = 1.0 / uTexSize;
    float lC = dot(texture(uTex, vUv).rgb,                     vec3(0.299, 0.587, 0.114));
    float lX = dot(texture(uTex, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float lY = dot(texture(uTex, vUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    vec3 nrm = normalize(vec3((lC - lX) * 2.2, (lC - lY) * 2.2, 1.0));

    vec3 lightDir = normalize(vec3(0.35, 0.55, 0.75));
    vec3 viewDir  = vec3(0.0, 0.0, 1.0);
    vec3 halfDir  = normalize(lightDir + viewDir);
    float spec = pow(max(dot(nrm, halfDir), 0.0), 22.0);

    // 탄 부분은 광택이 죽는다
    float gloss = uTareAmount * (1.0 - char * 0.75);
    col += vec3(1.0, 0.82, 0.55) * spec * gloss * 1.5;

    // 타레 자체의 색(간장 베이스) — 도포량만큼 어둡고 붉게
    col = mix(col, col * vec3(0.88, 0.68, 0.45), uTareAmount * 0.35);

    // ── 숯불 반사광 ───────────────────────────────────────────
    // 굽는 중일 때 아래쪽에서 주황빛이 흔들리며 올라온다.
    float cooking = smoothstep(0.04, 0.3, uDoneness) * (1.0 - smoothstep(0.85, 1.0, uDoneness));
    float flicker = 0.75 + 0.25 * sin(uTime * 7.3) * sin(uTime * 3.1 + 1.7);
    float fromBelow = smoothstep(0.85, 0.15, vUv.y);
    col += vec3(0.42, 0.16, 0.03) * cooking * flicker * fromBelow * 0.5;

    fragColor = vec4(col, tex.a);
}
