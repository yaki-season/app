#version 300 es
precision highp float;

uniform float uTime;
uniform float uBeerFill;
uniform float uFoamFill;
uniform float uOverflow;

in vec2 vUv;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  // 승인된 잔 실루엣 안쪽에만 보이도록 아래가 좁은 파인트 형태로 마스킹한다.
  float halfWidth = mix(0.38, 0.47, smoothstep(0.08, 0.92, uv.y));
  float glass = 1.0 - smoothstep(halfWidth - 0.018, halfWidth + 0.008, abs(uv.x - 0.5));
  glass *= smoothstep(0.07, 0.10, uv.y) * (1.0 - smoothstep(0.91, 0.94, uv.y));

  float beerTop = 0.09 + 0.82 * clamp(uBeerFill, 0.0, 1.0);
  float foamTop = 0.09 + 0.82 * clamp(uBeerFill + uFoamFill, 0.0, 1.0);
  float wave = sin(uv.x * 35.0 + uTime * 2.2) * 0.004
             + sin(uv.x * 67.0 - uTime * 1.3) * 0.002;

  float beerMask = (1.0 - smoothstep(beerTop + wave - 0.006, beerTop + wave + 0.006, uv.y)) * glass;
  float foamBottom = beerTop + wave - 0.012;
  float foamMask = smoothstep(foamBottom - 0.006, foamBottom + 0.006, uv.y)
                 * (1.0 - smoothstep(foamTop + wave - 0.006, foamTop + wave + 0.006, uv.y)) * glass;

  vec3 beer = mix(vec3(0.42, 0.12, 0.012), vec3(0.95, 0.48, 0.055), uv.y);
  beer += 0.10 * pow(max(0.0, 1.0 - abs(uv.x - 0.43) * 10.0), 5.0);
  vec3 foam = mix(vec3(0.88, 0.75, 0.50), vec3(1.0, 0.96, 0.78), uv.y);

  // 작은 상승 기포. 셀마다 속도와 위치가 달라 반복감이 덜하다.
  vec2 cells = vec2(15.0, 24.0);
  vec2 cell = floor(uv * cells);
  float rnd = hash(cell);
  vec2 bubbleUv = fract(uv * cells) - vec2(rnd, fract(rnd * 7.13 + uTime * (0.28 + rnd * 0.4)));
  float bubble = (1.0 - smoothstep(0.035, 0.11, length(bubbleUv))) * step(0.74, rnd) * beerMask;

  vec3 color = beer * beerMask + foam * foamMask + vec3(1.0, 0.78, 0.35) * bubble;
  float alpha = max(beerMask * 0.88, foamMask * 0.94);
  // 넘쳤을 때 잔 윗부분과 오른쪽 가장자리에 젖은 맥주 하이라이트를 더한다.
  float spill = uOverflow * smoothstep(0.87, 0.94, uv.y) * smoothstep(0.54, 0.82, uv.x);
  color += vec3(0.95, 0.53, 0.08) * spill;
  alpha = max(alpha, spill * 0.8);

  if (alpha < 0.004) discard;
  outColor = vec4(color, alpha);
}
