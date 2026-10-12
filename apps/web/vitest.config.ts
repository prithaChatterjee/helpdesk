import { defineProject, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Component tests: reuse the app's Vite config (React plugin, `@/` alias) in a browser-like DOM
export default mergeConfig(
  viteConfig,
  defineProject({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
);
