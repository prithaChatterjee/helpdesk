import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { startJobQueue } from '@helpdesk/db';
import {
  CLASSIFY_MODEL,
  type ClassifyTicketJob,
  JOB_QUEUES,
  QUEUE_NAMES,
  RESOLVE_MODEL,
  type ResolveTicketJob,
} from '@helpdesk/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from './db';
import { env } from './env';
import { classifyTicketJobs, createTicketClassifier } from './processors/classify-ticket';
import { processMaintenanceJob } from './processors/maintenance';
import { createTicketResolver, resolveTicketJobs } from './processors/resolve-ticket';
import { createPacer } from './pacer';

// BullMQ workers require maxRetriesPerRequest: null on their Redis connection
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const workers = [new Worker(QUEUE_NAMES.maintenance, processMaintenanceJob, { connection })];

for (const worker of workers) {
  worker.on('failed', (job, err) => {
    console.error(`[${worker.name}] job ${job?.id} (${job?.name}) failed:`, err.message);
  });
  worker.on('error', (err) => {
    // Connection errors (e.g. ECONNREFUSED) can have an empty message, so fall back to the code
    const code = (err as NodeJS.ErrnoException).code;
    console.error(`[${worker.name}] worker error:`, err.message || code || err);
  });
}

console.log(`Worker started, listening on queues: ${workers.map((w) => w.name).join(', ')}`);

// pg-boss queues live in PostgreSQL, so they run even without Redis
const jobs = await startJobQueue(env.DATABASE_URL);
if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
  // Explicit key from the validated env, rather than the provider reading process.env itself
  const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  // One pacer for every AI call: both job types use the same model and so the same per-minute quota
  const pace = createPacer(60_000 / env.AI_REQUESTS_PER_MINUTE);
  const classifier = createTicketClassifier(google(CLASSIFY_MODEL));
  const resolver = createTicketResolver(google(RESOLVE_MODEL));

  await jobs.work<ClassifyTicketJob>(
    JOB_QUEUES.classifyTicket,
    classifyTicketJobs(prisma, (input) => pace(() => classifier(input))),
  );
  await jobs.work<ResolveTicketJob>(
    JOB_QUEUES.resolveTicket,
    resolveTicketJobs(prisma, (input) => pace(() => resolver(input)), {
      supportEmail: env.SUPPORT_EMAIL,
      // apps/worker/knowledge-base.md, from src/index.ts and from the bundled dist/index.mjs
      knowledgeBaseUrl: new URL('../knowledge-base.md', import.meta.url),
    }),
  );
  console.log(
    `Worker listening on job queues: ${JOB_QUEUES.classifyTicket}, ${JOB_QUEUES.resolveTicket} ` +
      `(${CLASSIFY_MODEL}, up to ${env.AI_REQUESTS_PER_MINUTE} AI requests per minute)`,
  );
} else {
  console.warn(
    'GOOGLE_GENERATIVE_AI_API_KEY is not set: classify-ticket and resolve-ticket jobs wait in the queue until it is',
  );
}

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down worker`);
  // Graceful: running jobs finish first
  await jobs.stop({ graceful: true });
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
