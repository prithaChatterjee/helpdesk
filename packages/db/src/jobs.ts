import { type ClassifyTicketJob, JOB_QUEUES, type ResolveTicketJob } from '@helpdesk/shared';
import { PgBoss, type QueueOptions } from 'pg-boss';

export type { Job } from 'pg-boss';
export type JobQueueClient = PgBoss;

/**
 * pg-boss runs higher priorities first: a ticket that just arrived is handled before a backlog
 * queued by `npm run tickets:classify` or `tickets:auto-resolve`, so Agents see the result within
 * seconds.
 */
export const JOB_PRIORITY = { newTicket: 10, backlog: 0 } as const;
export type JobReason = keyof typeof JOB_PRIORITY;

/** Queues AI classification of a ticket; `reason` sets its place in the queue. */
export function sendClassifyTicketJob(
  boss: Pick<JobQueueClient, 'send'>,
  ticketId: string,
  reason: JobReason,
) {
  return boss.send(JOB_QUEUES.classifyTicket, { ticketId } satisfies ClassifyTicketJob, {
    priority: JOB_PRIORITY[reason],
  });
}

/** Queues an attempt to answer and resolve a ticket from the knowledge base. */
export function sendResolveTicketJob(
  boss: Pick<JobQueueClient, 'send'>,
  ticketId: string,
  reason: JobReason,
) {
  return boss.send(JOB_QUEUES.resolveTicket, { ticketId } satisfies ResolveTicketJob, {
    priority: JOB_PRIORITY[reason],
  });
}

// The AI provider may be down, busy or out of quota for a while: retry after ~30 s, 1 min, 2 min,
// … up to an hour apart, then give up (the npm scripts above queue the ticket again)
const AI_JOB_RETRIES: QueueOptions = {
  retryLimit: 8,
  retryDelay: 30,
  retryBackoff: true,
  retryDelayMax: 3600,
};

/**
 * Connects pg-boss to the database and makes sure every queue exists. pg-boss creates and migrates
 * its own `pgboss` schema on start, next to Prisma's tables. The api calls this to send jobs and
 * the worker to run them; stop it with `stop()` on shutdown.
 *
 * Queue options only apply when a queue is first created, so changing them later needs
 * `updateQueue()` (or a new queue).
 */
export async function startJobQueue(connectionString: string): Promise<JobQueueClient> {
  const boss = new PgBoss(connectionString);
  boss.on('error', (err) => console.error('pg-boss error:', err));
  await boss.start();
  await boss.createQueue(JOB_QUEUES.classifyTicket, AI_JOB_RETRIES);
  await boss.createQueue(JOB_QUEUES.resolveTicket, AI_JOB_RETRIES);
  return boss;
}
