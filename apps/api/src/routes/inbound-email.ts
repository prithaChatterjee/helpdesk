import { createHash, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@helpdesk/db';
import { inboundEmailSchema } from '@helpdesk/shared';
import express, { type RequestHandler, Router } from 'express';
import { ingestInboundEmail } from '../inbound-email/ingest';

/**
 * Receives emails sent to the support address: `POST /` with an `InboundEmail` JSON body and
 * `Authorization: Bearer <secret>`. Mount before the app-wide express.json(), which has a smaller
 * body limit. Not behind requireAuth: the caller is the mail pipeline, not a signed-in user.
 */
export function inboundEmailRouter(prisma: PrismaClient, secret: string) {
  const router = Router();

  // The secret is checked before the (up to 10 MB) body is read
  router.post('/', requireBearer(secret), express.json({ limit: '10mb' }), async (req, res) => {
    const parsed = inboundEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const result = await ingestInboundEmail(prisma, parsed.data);
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
