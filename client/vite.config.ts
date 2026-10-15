/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/socket.io': { target: env.API_PROXY_TARGET || 'http://localhost:4001', ws: true },
      '/api': {
        target: env.API_PROXY_TARGET || 'http://localhost:4001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    css: true,
  },
  };
});
