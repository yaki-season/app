#version 300 es
precision highp float;

uniform float uTime;
uniform float uPourBeer;
uniform float uPourFoam;
uniform float uFoamCrown;
uniform float uOverflow;
uniform float uFinished;

in vec2 vUv;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

float softCircle(vec2 p, vec2 center, float radius) {
  return 1.0 - smoothstep(radius * 0.45, radius, length(p - center));
}

void main() {
  vec2 uv = vUv;
  float wobble = sin(uTime * 15.0 + uv.y * 34.0) * 0.008;

  // 노즐에서 잔으로 떨어지는 두 종류의 유체 줄기.
  float streamX = 0.5 + wobble;
  float streamBody = 1.0 - smoothstep(0.026, 0.045, abs(uv.x - streamX));
  float streamRange = smoothstep(0.47, 0.51, uv.y) * (1.0 - smoothstep(0.91, 0.95, uv.y));
  float stream = streamBody * streamRange * max(uPourBeer, uPourFoam);
  vec3 streamColor = mix(vec3(0.94, 0.48, 0.06), vec3(1.0, 0.94, 0.72), uPourFoam);

  // 잔 윗면의 거품 왕관. 서로 다른 크기의 포말이 계속 재배치된다.
  float crown = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float x = 0.31 + fi * 0.062 + sin(uTime * 0.8 + fi * 2.1) * 0.008;
    float y = 0.44 + hash(vec2(fi, 2.0)) * 0.018;
    crown += softCircle(uv, vec2(x, y), 0.017 + hash(vec2(fi, 8.0)) * 0.009);
  }
  crown = clamp(crown, 0.0, 1.0) * uFoamCrown;

  // 넘침은 잔 오른쪽을 타고 내려오는 불규칙한 액체 띠와 바닥 방울로 표현한다.
  float spillX = 0.72 + sin(uv.y * 29.0 + uTime * 2.4) * 0.008;
  float spill = (1.0 - smoothstep(0.014, 0.034, abs(uv.x - spillX)))
              * smoothstep(0.05, 0.10, uv.y) * (1.0 - smoothstep(0.43, 0.50, uv.y)) * uOverflow;
  float puddle = softCircle(uv, vec2(0.64, 0.045), 0.035) * uOverflow;

  // 완성 상태의 미세한 냉기/향 연무. 위로 올라가며 좌우로 흔들린다.
  float mist = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float rise = fract(uTime * (0.10 + fi * 0.025) + fi * 0.31);
    vec2 center = vec2(0.44 + fi * 0.06 + sin(uTime + fi * 2.4) * 0.025, 0.30 + rise * 0.34);
    mist += softCircle(uv, center, 0.045 + rise * 0.035) * (1.0 - rise);
  }
  mist = clamp(mist, 0.0, 1.0) * uFinished;

  vec3 color = streamColor * stream
             + vec3(1.0, 0.96, 0.80) * crown
             + vec3(0.78, 0.29, 0.025) * (spill + puddle)
             + vec3(0.92, 0.94, 0.88) * mist;
  float alpha = max(max(stream * 0.88, crown * 0.92), max((spill + puddle) * 0.82, mist * 0.28));
  if (alpha < 0.004) discard;
  outColor = vec4(color, min(alpha, 1.0));
}
