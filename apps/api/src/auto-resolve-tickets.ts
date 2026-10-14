// Queues a resolve-ticket job for every Open ticket nobody has replied to yet. The worker answers
// each one from apps/worker/knowledge-base.md when it can and resolves it; the rest stay open.
// Run with `npm run tickets:auto-resolve`.
import { sendResolveTicketJob, startJobQueue } from '@helpdesk/db';
import { MessageDirection, TicketStatus } from '@helpdesk/shared';
import { prisma } from './db';
import { env } from './env';

const jobs = await startJobQueue(env.DATABASE_URL);

try {
  const tickets = await prisma.ticket.findMany({
    where: {
      status: TicketStatus.OPEN,
      messages: { none: { direction: MessageDirection.OUTBOUND } },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const ticket of tickets) {
    // Behind tickets that arrive meanwhile, which the webhook queues at a higher priority
    await sendResolveTicketJob(jobs, ticket.id, 'backlog');
  }
  console.log(
    `Queued ${tickets.length} open, unanswered tickets for auto-resolution. ` +
      'The worker (npm run dev) answers them from apps/worker/knowledge-base.md; ' +
      'it needs GOOGLE_GENERATIVE_AI_API_KEY.',
  );
} finally {
  await jobs.stop({ graceful: true });
  await prisma.$disconnect();
}
