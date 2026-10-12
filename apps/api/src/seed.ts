// Seeds the database with the Admin from ADMIN_EMAIL / ADMIN_PASSWORD and, when SEED_USER_EMAIL is
// set, one more user (ADMIN or AGENT) from SEED_USER_*. Run with `npm run db:seed`.
// Refuses to run in production unless SEED_ALLOW_PRODUCTION=true, because it resets the Admin's
// password to ADMIN_PASSWORD.
import { type UserRole, userRoleSchema } from '@helpdesk/shared';
import { parseEnv } from '@helpdesk/shared/env';
import { z } from 'zod';
import { createAuth } from './auth';
import { prisma } from './db';
import { env } from './env';
import { upsertUser } from './seed-admin';

const seedEnv = parseEnv(
  z
    .object({
      SEED_USER_EMAIL: z.email().optional(),
      SEED_USER_PASSWORD: z.string().min(8).optional(),
      SEED_USER_ROLE: userRoleSchema.default('AGENT'),
      SEED_ALLOW_PRODUCTION: z.stringbool().default(false),
    })
    .refine((e) => !e.SEED_USER_EMAIL || e.SEED_USER_PASSWORD, {
      message: 'SEED_USER_PASSWORD is required when SEED_USER_EMAIL is set',
      path: ['SEED_USER_PASSWORD'],
    }),
);

if (env.NODE_ENV === 'production' && !seedEnv.SEED_ALLOW_PRODUCTION) {
  console.error(
    'Refusing to seed in production: it resets the Admin password to ADMIN_PASSWORD. ' +
      'Set SEED_ALLOW_PRODUCTION=true to run it anyway.',
  );
  await prisma.$disconnect();
  process.exit(1);
}

const users: { email: string; password: string; role: UserRole }[] = [
  { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, role: 'ADMIN' },
];
if (seedEnv.SEED_USER_EMAIL && seedEnv.SEED_USER_PASSWORD) {
  users.push({
    email: seedEnv.SEED_USER_EMAIL,
    password: seedEnv.SEED_USER_PASSWORD,
    role: seedEnv.SEED_USER_ROLE,
  });
}

const auth = createAuth(
  {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    webOrigin: env.WEB_ORIGIN,
    // The seed script serves no requests
    rateLimit: false,
  },
  prisma,
);

try {
  for (const user of users) {
    const result = await upsertUser(auth, prisma, user);
    console.log(`${user.role} ${user.email} ${result}`);
  }
} finally {
  await prisma.$disconnect();
}
