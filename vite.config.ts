import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ['socket.io-client', 'react', 'react-dom/client', 'zod'] },
  base: './',
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
