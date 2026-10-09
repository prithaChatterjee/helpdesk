import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/seed.ts'],
  format: ['esm'],
  platform: 'node',
  deps: {
    // Third-party npm packages stay external (resolved from node_modules at runtime);
    // @helpdesk/* workspace packages ship TypeScript source, so they must be bundled in.
    neverBundle: [/^(?!@helpdesk\/)(@[a-z0-9-]+\/)?[a-z0-9][\w.-]*(\/.*)?$/],
    alwaysBundle: [/^@helpdesk\//],
  },
});
