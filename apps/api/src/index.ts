import { createApp } from './app';
import { prisma } from './db';
import { env } from './env';

const server = createApp().listen(env.API_PORT, () => {
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
