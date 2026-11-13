import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/server.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4180', headless: true },
  webServer: {
    command: 'npm start',
    port: 4180,
    reuseExistingServer: false,
    env: {
      HOST: '127.0.0.1',
      PORT: '4180',
      TURN_HOST: 'turn.example.com',
      TURN_SHARED_SECRET: 'a'.repeat(64),
      ALLOWED_ORIGIN: 'http://127.0.0.1:4180',
      TLS_CERT_FILE: '',
      TLS_KEY_FILE: '',
    },
  },
});
