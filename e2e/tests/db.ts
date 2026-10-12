// Direct database access for setup that has no UI or API yet (deactivating a user, expiring a
// session). Always points at the e2e database.
import pg from 'pg';
import { E2E_DATABASE_URL } from '../test-env';

async function execute(sql: string, params: unknown[]) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

/** Sets `users.isActive` for the user with this email. */
export async function setUserActive(email: string, isActive: boolean) {
  const { rowCount } = await execute('UPDATE "users" SET "isActive" = $2 WHERE "email" = $1', [
    email,
    isActive,
  ]);
  if (rowCount !== 1) throw new Error(`No user with email ${email}`);
}

/** Moves the expiry of the session with this token into the past. */
export async function expireSession(token: string) {
  const { rowCount } = await execute(
    `UPDATE "sessions" SET "expiresAt" = now() - interval '1 minute' WHERE "tokenHash" = $1`,
    [token],
  );
  if (rowCount !== 1) throw new Error('Session not found');
}

/** Whether a user with this email exists. */
export async function userExists(email: string) {
  const { rowCount } = await execute('SELECT 1 FROM "users" WHERE "email" = $1', [
    email.toLowerCase(),
  ]);
  return rowCount === 1;
}
