import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8777',
    launchOptions: {
      // 헤드리스 실행 환경에 GPU가 없어도 WebGL2를 소프트웨어로 사용할 수 있게 한다.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'python -m http.server 8777',
    port: 8777,
    reuseExistingServer: true,
    timeout: 15000,
  },
  projects: [
    { name: 'chromium-1280x720', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'chromium-1920x1080', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],
});
