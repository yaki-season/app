import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  fullyParallel: false,
  // 조리 판정이 실제 경과 시간 기준이라(`GPL-001 §9`) 실시간에 민감한데, 익힘 셰이더가
  // 매 프레임 소프트웨어 렌더(SwiftShader, CPU 래스터)로 fbm 노이즈+노멀 탭을 돌려
  // 프레임 루프가 가끔 밀린다. 그러면 적정 구간(2.5~5.5초) 창을 놓쳐 과다가 된다.
  // 이는 헤드리스 GPU 부재로 인한 환경 한계이며 실제 GPU에서는 재현되지 않는다.
  // 상태 기반 대기로도 못 없애는(로직이 벽시계 기반이라) 이 잔여 플레이크를 재시도 1회로 흡수한다.
  retries: 1,
  reporter: 'list',

  // 셰이더 이식 전에는 workers=2가 안정적이었으나(3회 반복 확인), 익힘 셰이더가 워커당
  // WebGL 부하를 키워 둘이 CPU를 다투면 대량 실패한다. 무거운 컨텍스트 하나만 돌리도록
  // 1로 고정한다. 늘리려면 반드시 반복 실행으로 확인할 것.
  workers: 1,
  use: {
    baseURL: 'http://localhost:8777',
    launchOptions: {
      // 헤드리스 실행 환경에 GPU가 없어도 WebGL2를 소프트웨어로 사용할 수 있게 한다.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run dev',
    port: 8777,
    reuseExistingServer: true,
    timeout: 15000,
  },
  projects: [
    { name: 'chromium-1280x720', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'chromium-1920x1080', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],
});
