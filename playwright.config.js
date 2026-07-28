import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',

  // 조리 판정은 실제 경과 시간 기준이라(`GPL-001 §9`) 브라우저가 CPU를 못 받으면
  // 적정 구간(2.5~5.5초)이 관측되기 전에 지나가 버린다. 게다가 각 테스트가 WebGL을
  // 띄우므로 워커당 부하가 크다. 기본값(코어의 절반)은 이 조합에서 과해서 무더기로
  // 실패했고, 2로 고정하면 안정적이다. 늘리려면 반드시 반복 실행으로 확인할 것.
  workers: 2,
  use: {
    baseURL: 'http://localhost:8777',
    launchOptions: {
      // 헤드리스 실행 환경에 GPU가 없어도 WebGL2를 소프트웨어로 사용할 수 있게 한다.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'python3 -m http.server 8777',
    port: 8777,
    reuseExistingServer: true,
    timeout: 15000,
  },
  projects: [
    { name: 'chromium-1280x720', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'chromium-1920x1080', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],
});
