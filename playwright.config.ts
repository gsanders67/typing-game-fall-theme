import { defineConfig } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT || '5173';
export default defineConfig({
  testDir: './tests',
  testIgnore: '**/production.spec.ts',
  timeout: 120_000,
  workers: 1,
  expect: { timeout: 20000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    launchOptions: { args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] },
  },
  webServer: {
    command: 'npm run dev',
    port: Number(port),
    env: { PORT: port, BASE_PATH: '/', PUBLIC_URL: '' },
    reuseExistingServer: false,
  },
});
