import { createApp } from './app';
import { createAuth } from './auth';
import { prisma } from './db';
import { env } from './env';
import { seedAdmin } from './seed-admin';

const auth = createAuth(
  { secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, webOrigin: env.WEB_ORIGIN },
  prisma,
);

await seedAdmin(auth, prisma, { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });

const server = createApp(auth).listen(env.API_PORT, () => {
  console.log(`API listening on http://localhost:${env.API_PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down API`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
