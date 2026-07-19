#version 300 es

// 풀스크린 쿼드. 정점 데이터 없이 gl_VertexID로 삼각형 2개를 만든다.
// (드로우콜 1회, 버퍼 0개 — TECH-PERF-001 드로우콜 예산 대응)

out vec2 vUv;

void main() {
    // 0,1,2,3 -> (0,0) (1,0) (0,1) (1,1)
    vec2 uv = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
    vUv = uv;
    gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
