// Settings for the end-to-end stack: its own database and ports, so `npm run test:e2e` never
// touches the development database and can run next to `npm run dev`.

const DEFAULT_DATABASE_URL = 'postgresql://helpdesk:helpdesk@localhost:5432/helpdesk_test';

export const E2E_DATABASE_URL = process.env['E2E_DATABASE_URL'] ?? DEFAULT_DATABASE_URL;
export const E2E_API_PORT = 3001;
export const E2E_WEB_PORT = 5174;
export const E2E_API_URL = `http://localhost:${E2E_API_PORT}`;
export const E2E_WEB_URL = `http://localhost:${E2E_WEB_PORT}`;

// Seeded by scripts/reset-db.ts before the API starts
export const TEST_USERS = {
  admin: { email: 'admin@e2e.test', password: 'e2e-admin-password' },
  agent: { email: 'agent@e2e.test', password: 'e2e-agent-password' },
} as const;

// Environment for the API process and the seed script. Every variable is set explicitly so
// nothing leaks in from the root .env.
export const apiEnv = {
  NODE_ENV: 'test',
  API_PORT: String(E2E_API_PORT),
  WEB_ORIGIN: E2E_WEB_URL,
  DATABASE_URL: E2E_DATABASE_URL,
  // The API doesn't connect to Redis yet; required by its env schema
  REDIS_URL: 'redis://localhost:6379',
  ADMIN_EMAIL: TEST_USERS.admin.email,
  ADMIN_PASSWORD: TEST_USERS.admin.password,
  BETTER_AUTH_SECRET: 'e2e-test-secret-not-for-production-use-0000',
  BETTER_AUTH_URL: E2E_API_URL,
};
