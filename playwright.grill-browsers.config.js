import { defineConfig, devices } from '@playwright/test';

// SCR-SVC-GRILL의 branded Chromium 호환성 확인용.
// 기본은 설치된 Google Chrome이며, Edge가 있는 환경에서는
// GRILL_BROWSER_CHANNEL=msedge 로 같은 FHD/720 계약을 재사용한다.
const channel = process.env.GRILL_BROWSER_CHANNEL || 'chrome';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  retries: 1,
  reporter: 'list',
  workers: 1,
  use: {
    baseURL: 'http://localhost:8777',
    channel,
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: {
    command: 'npm run dev',
    port: 8777,
    reuseExistingServer: true,
    timeout: 15_000,
  },
  projects: [
    {
      name: `${channel}-1280x720`,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: `${channel}-1920x1080`,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
});
