import { createHash, timingSafeEqual } from 'node:crypto';
import { findAiAgentId, type PrismaClient, unassignFromAiAgent } from '@helpdesk/db';
import { inboundEmailSchema } from '@helpdesk/shared';
import express, { type RequestHandler, Router } from 'express';
import { ingestInboundEmail } from '../inbound-email/ingest';

/** Queues the AI jobs for a new ticket (classify it, try to auto-resolve it), e.g. with pg-boss. */
export type EnqueueNewTicketJobs = (ticketId: string) => Promise<unknown>;

/**
 * Receives emails sent to the support address: `POST /` with an `InboundEmail` JSON body and
 * `Authorization: Bearer <secret>`. Mount before the app-wide express.json(), which has a smaller
 * body limit. Not behind requireAuth: the caller is the mail pipeline, not a signed-in user.
 * With `enqueueNewTicketJobs`, each new ticket gets `classify-ticket` and `resolve-ticket` jobs for
 * the worker, and is assigned to the AI Agent (`npm run db:seed:ai-agent`) meanwhile.
 */
export function inboundEmailRouter(
  prisma: PrismaClient,
  secret: string,
  enqueueNewTicketJobs?: EnqueueNewTicketJobs,
) {
  const router = Router();

  // The secret is checked before the (up to 10 MB) body is read
  router.post('/', requireBearer(secret), express.json({ limit: '10mb' }), async (req, res) => {
    const parsed = inboundEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    // While the AI auto-resolves tickets, a new one belongs to the AI Agent until the worker either
    // resolves it or unassigns it (when there is no active AI Agent, it stays unassigned)
    const aiAgentId = enqueueNewTicketJobs ? await findAiAgentId(prisma) : undefined;
    const result = await ingestInboundEmail(prisma, parsed.data, { assignToId: aiAgentId });
    if (result.result === 'created' && result.ticketId && enqueueNewTicketJobs) {
      // Only queues the job (one quick insert); the worker calls the AI later. The ticket is
      // already saved, so a queue failure is logged and the email still counts as received.
      try {
        await enqueueNewTicketJobs(result.ticketId);
      } catch (err) {
        console.error(`Couldn't queue AI jobs for ticket ${result.ticketId}:`, err);
        // No job will ever unassign it, so hand it straight to the Agents
        if (aiAgentId) await unassignFromAiAgent(prisma, result.ticketId, aiAgentId);
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
