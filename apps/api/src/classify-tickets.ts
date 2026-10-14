// Queues a classify-ticket job for every ticket that has no category yet, e.g. tickets whose jobs
// failed while the AI provider was down or out of credits. The worker classifies them. Run with
// `npm run tickets:classify`.
import { sendClassifyTicketJob, startJobQueue } from '@helpdesk/db';
import { prisma } from './db';
import { env } from './env';

const jobs = await startJobQueue(env.DATABASE_URL);

try {
  const tickets = await prisma.ticket.findMany({
    where: { category: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const ticket of tickets) {
    // Behind tickets that arrive meanwhile, which the webhook queues at a higher priority
    await sendClassifyTicketJob(jobs, ticket.id, 'backlog');
  }
  console.log(
    `Queued ${tickets.length} tickets without a category for classification. ` +
      'The worker (npm run dev) classifies them; it needs GOOGLE_GENERATIVE_AI_API_KEY.',
  );
} finally {
  await jobs.stop({ graceful: true });
  await prisma.$disconnect();
}
