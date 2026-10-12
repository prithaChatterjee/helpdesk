// Recreates the end-to-end database: creates it if missing, applies migrations, empties every
// table and seeds TEST_USERS. Runs before the API starts (Playwright starts webServers before
// globalSetup), so the API's first-Admin seed never sees stale data.
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { apiEnv, E2E_DATABASE_URL, TEST_USERS } from '../test-env';

const root = path.resolve(import.meta.dirname, '../..');

const url = new URL(E2E_DATABASE_URL);
const database = decodeURIComponent(url.pathname.slice(1));
// Guard against wiping a real database through a mistyped E2E_DATABASE_URL
if (!database.endsWith('_test')) {
  throw new Error(`Refusing to reset "${database}": the e2e database name must end with _test`);
}

async function createDatabaseIfMissing() {
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: maintenanceUrl.href });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
      console.log(`Created database ${database}`);
    }
  } finally {
    await client.end();
  }
}

async function truncateAllTables() {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length > 0) {
      const tables = rows.map((r) => `public.${pg.escapeIdentifier(r.tablename)}`).join(', ');
      await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}

const childEnv = { ...process.env, ...apiEnv };

await createDatabaseIfMissing();

// Through a shell: npx is a .cmd shim on Windows
execSync('npx prisma migrate deploy', {
  cwd: path.join(root, 'packages/db'),
  env: childEnv,
  stdio: 'inherit',
});

await truncateAllTables();

// The API seed script creates the Admin from ADMIN_* and one more user from SEED_USER_*
execFileSync(process.execPath, ['--import', 'tsx', 'src/seed.ts'], {
  cwd: path.join(root, 'apps/api'),
  env: {
    ...childEnv,
    SEED_USER_EMAIL: TEST_USERS.agent.email,
    SEED_USER_PASSWORD: TEST_USERS.agent.password,
    SEED_USER_ROLE: 'AGENT',
  },
  stdio: 'inherit',
});
