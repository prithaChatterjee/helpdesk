import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import type { Auth } from './auth';
import { requireAuth } from './middleware/require-auth';

export function createApp(auth: Auth) {
  const app = express();

  app.disable('x-powered-by');
  // Better Auth parses its own request bodies, so mount it before express.json()
  app.all('/api/auth/*splat', toNodeHandler(auth));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/me', requireAuth(auth), (_req, res) => {
    res.json({ user: res.locals.user });
  });

  return app;
}
