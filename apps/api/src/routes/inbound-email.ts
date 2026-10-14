import { createHash, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@helpdesk/db';
import { inboundEmailSchema } from '@helpdesk/shared';
import express, { type RequestHandler, Router } from 'express';
import { ingestInboundEmail } from '../inbound-email/ingest';

/** Queues a `classify-ticket` job for a new ticket, e.g. with pg-boss `send()`. */
export type EnqueueTicketClassification = (ticketId: string) => Promise<unknown>;

/**
 * Receives emails sent to the support address: `POST /` with an `InboundEmail` JSON body and
 * `Authorization: Bearer <secret>`. Mount before the app-wide express.json(), which has a smaller
 * body limit. Not behind requireAuth: the caller is the mail pipeline, not a signed-in user.
 * With `enqueueClassification`, each new ticket gets a `classify-ticket` job for the worker.
 */
export function inboundEmailRouter(
  prisma: PrismaClient,
  secret: string,
  enqueueClassification?: EnqueueTicketClassification,
) {
  const router = Router();

  // The secret is checked before the (up to 10 MB) body is read
  router.post('/', requireBearer(secret), express.json({ limit: '10mb' }), async (req, res) => {
    const parsed = inboundEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const result = await ingestInboundEmail(prisma, parsed.data);
    if (result.result === 'created' && result.ticketId && enqueueClassification) {
      // Only queues the job (one quick insert); the worker calls the AI later. The ticket is
      // already saved, so a queue failure is logged and the email still counts as received.
      try {
        await enqueueClassification(result.ticketId);
      } catch (err) {
        console.error(`Couldn't queue classification of ticket ${result.ticketId}:`, err);
      }
    }
    res.status(result.result === 'created' ? 201 : 200).json(result);
  });

  return router;
}

function requireBearer(secret: string): RequestHandler {
  const expected = sha256(secret);
  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    // Comparing fixed-length digests in constant time doesn't leak the secret's length or prefix
    if (!token || !timingSafeEqual(sha256(token), expected)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
