import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Load the monorepo root .env for CLI commands (migrate, studio). Absent in CI/production.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env'));
} catch {
  // no .env file
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // process.env (not env()) so `prisma generate` works without a database URL
    url: process.env['DATABASE_URL'],
  },
});
