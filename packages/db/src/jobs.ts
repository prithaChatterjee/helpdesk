import { type ClassifyTicketJob, JOB_QUEUES } from '@helpdesk/shared';
import { PgBoss } from 'pg-boss';

export type { Job } from 'pg-boss';
export type JobQueueClient = PgBoss;

/**
 * pg-boss runs higher priorities first: a ticket that just arrived is classified before a backlog
 * queued by `npm run tickets:classify`, so Agents see its category within seconds.
 */
export const CLASSIFY_PRIORITY = { newTicket: 10, backlog: 0 } as const;

/** Queues AI classification of a ticket; `reason` sets its place in the queue. */
export function sendClassifyTicketJob(
  boss: Pick<JobQueueClient, 'send'>,
  ticketId: string,
  reason: keyof typeof CLASSIFY_PRIORITY,
) {
  return boss.send(JOB_QUEUES.classifyTicket, { ticketId } satisfies ClassifyTicketJob, {
    priority: CLASSIFY_PRIORITY[reason],
  });
}

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
  await boss.createQueue(JOB_QUEUES.classifyTicket, {
    // The AI provider may be down or out of credits for a while: retry after ~30 s, 1 min, 2 min,
    // … up to an hour apart, then give up (`npm run tickets:classify` queues it again)
    retryLimit: 8,
    retryDelay: 30,
    retryBackoff: true,
    retryDelayMax: 3600,
  });
  return boss;
}
