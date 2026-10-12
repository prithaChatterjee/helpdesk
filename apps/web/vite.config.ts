import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Same-origin /api in development so session cookies work without CORS
    proxy: {
      // Playwright points this at the e2e API (see e2e/playwright.config.ts)
      '/api': process.env['API_PROXY_TARGET'] ?? 'http://localhost:3000',
    },
  },
});
