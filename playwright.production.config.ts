import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/production.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4173', headless: true },
  webServer: {
    command: 'npm start',
    port: 4173,
    env: { PORT: '4173', BASE_PATH: '/event', PUBLIC_URL: '' },
    reuseExistingServer: false,
  },
});
