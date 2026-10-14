import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { startJobQueue } from '@helpdesk/db';
import { CLASSIFY_MODEL, type ClassifyTicketJob, JOB_QUEUES, QUEUE_NAMES } from '@helpdesk/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from './db';
import { env } from './env';
import { classifyTicketJobs, createTicketClassifier } from './processors/classify-ticket';
import { processMaintenanceJob } from './processors/maintenance';
import { spaceCalls } from './space-calls';

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
  const model = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(
    CLASSIFY_MODEL,
  );
  // Paced to stay under the per-minute quota; pg-boss runs one job at a time by default
  const classify = spaceCalls(createTicketClassifier(model), 60_000 / env.AI_REQUESTS_PER_MINUTE);
  await jobs.work<ClassifyTicketJob>(
    JOB_QUEUES.classifyTicket,
    classifyTicketJobs(prisma, classify),
  );
  console.log(
    `Worker listening on job queue: ${JOB_QUEUES.classifyTicket} ` +
      `(${CLASSIFY_MODEL}, up to ${env.AI_REQUESTS_PER_MINUTE} requests per minute)`,
  );
} else {
  console.warn(
    'GOOGLE_GENERATIVE_AI_API_KEY is not set: classify-ticket jobs wait in the queue until it is',
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
