import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/production.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4173', headless: true },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort --base /event/',
    port: 4173,
    reuseExistingServer: false,
  },
});
