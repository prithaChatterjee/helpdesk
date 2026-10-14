import type { PrismaClient } from '@helpdesk/db';
import { toNodeHandler } from 'better-auth/node';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Auth } from './auth';
import { requireAuth } from './middleware/require-auth';
import { requireRole } from './middleware/require-role';
import { assigneesRouter } from './routes/assignees';
import { type EnqueueTicketClassification, inboundEmailRouter } from './routes/inbound-email';
import { type TicketsAi, ticketsRouter } from './routes/tickets';
import { usersRouter } from './routes/users';

export interface AppConfig {
  /** Bearer token the inbound email webhook requires */
  inboundEmailSecret: string;
  /**
   * Polishes reply drafts and summarizes tickets with AI; without them (no `GOOGLE_GENERATIVE_AI_API_KEY`),
   * those routes return 503
   */
  ai?: TicketsAi;
  /** Queues AI classification of each ticket the inbound email webhook creates */
  enqueueTicketClassification?: EnqueueTicketClassification;
}

export function createApp(auth: Auth, prisma: PrismaClient, config: AppConfig) {
  const app = express();

  app.disable('x-powered-by');
  // Better Auth parses its own request bodies, so mount it before express.json()
  app.all('/api/auth/*splat', toNodeHandler(auth));
  // Parses its own (larger) bodies, after checking the webhook secret
  app.use(
    '/api/webhooks/inbound-email',
    inboundEmailRouter(prisma, config.inboundEmailSecret, config.enqueueTicketClassification),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/me', requireAuth(auth), (_req, res) => {
    res.json({ user: res.locals.user });
  });

  app.use('/api/users', requireAuth(auth), requireRole('ADMIN'), usersRouter(auth, prisma));
  app.use('/api/tickets', requireAuth(auth), ticketsRouter(prisma, config.ai));
  app.use('/api/assignees', requireAuth(auth), assigneesRouter(prisma));

  // Replaces Express's default handler, which sends stack traces unless NODE_ENV is production.
  // Client errors from body parsing (400 bad JSON, 413 too large) keep their status and message.
  // Express recognises error handlers by their four parameters, so `_next` must stay.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = getClientErrorStatus(err);
    if (status) {
      res.status(status).json({ error: (err as Error).message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

/** The 4xx status of an error that is safe to show to the client, e.g. from express.json(). */
function getClientErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || !('expose' in err) || err.expose !== true) {
    return undefined;
  }
  const status = 'status' in err ? err.status : undefined;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}
