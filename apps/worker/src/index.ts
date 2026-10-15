import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { sendSendEmailJob, startJobQueue } from '@helpdesk/db';
import { CLASSIFY_MODEL, JOB_QUEUES, QUEUE_NAMES, RESOLVE_MODEL } from '@helpdesk/shared';
import { flushMonitoring, initMonitoring, reportError } from '@helpdesk/shared/monitoring';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from './db';
import { env } from './env';
import { classifyTicketJobs, createTicketClassifier } from './processors/classify-ticket';
import { processMaintenanceJob } from './processors/maintenance';
import { createTicketResolver, resolveTicketJobs } from './processors/resolve-ticket';
import { createSendGridSender, sendEmailJobs } from './processors/send-email';
import { createPacer } from './pacer';
import { reportFinalFailures } from './report-job-failures';

// First, so errors during startup are reported too
initMonitoring({
  dsn: env.SENTRY_DSN,
  environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
  service: 'worker',
});

// BullMQ workers require maxRetriesPerRequest: null on their Redis connection
const connection = env.REDIS_URL
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
  : undefined;

const workers = connection
  ? [new Worker(QUEUE_NAMES.maintenance, processMaintenanceJob, { connection })]
  : [];

for (const worker of workers) {
  worker.on('failed', (job, err) => {
    reportError(`[${worker.name}] job ${job?.id} (${job?.name}) failed:`, err, {
      queue: worker.name,
    });
  });
  worker.on('error', (err) => {
    // Connection errors (e.g. ECONNREFUSED) can have an empty message, so fall back to the code.
    // Only logged: they repeat every few seconds while Redis is down (normal in development).
    const code = (err as NodeJS.ErrnoException).code;
    console.error(`[${worker.name}] worker error:`, err.message || code || err);
  });
}

if (connection) {
  console.log(`Worker started, listening on queues: ${workers.map((w) => w.name).join(', ')}`);
} else {
  console.warn('REDIS_URL is not set: BullMQ queues are off (pg-boss jobs still run)');
}

// pg-boss queues live in PostgreSQL, so they run even without Redis
const jobs = await startJobQueue(env.DATABASE_URL);

// Emails replies to customers with SendGrid; off, replies are only saved to the thread
const enqueueSendEmail =
  env.EMAIL_SENDING_ENABLED && env.SENDGRID_API_KEY
    ? (messageId: string) => sendSendEmailJob(jobs, messageId)
    : undefined;
if (env.EMAIL_SENDING_ENABLED && env.SENDGRID_API_KEY) {
  await jobs.work(
    JOB_QUEUES.sendEmail,
    // Metadata (retryCount/retryLimit) tells the handler when a failure is the last attempt
    { includeMetadata: true },
    reportFinalFailures(
      JOB_QUEUES.sendEmail,
      sendEmailJobs(prisma, createSendGridSender(env.SENDGRID_API_KEY), {
        supportEmail: env.SUPPORT_EMAIL,
        replyTo: env.EMAIL_REPLY_TO,
      }),
    ),
  );
  console.log(
    `Worker listening on job queue: ${JOB_QUEUES.sendEmail} (SendGrid, from ${env.SUPPORT_EMAIL})`,
  );
} else {
  console.warn('EMAIL_SENDING_ENABLED is off: replies are saved to tickets but not emailed');
}
if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
  // Explicit key from the validated env, rather than the provider reading process.env itself
  const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  // One pacer for every AI call: both job types use the same model and so the same per-minute quota
  const pace = createPacer(60_000 / env.AI_REQUESTS_PER_MINUTE);
  const classifier = createTicketClassifier(google(CLASSIFY_MODEL));
  const resolver = createTicketResolver(google(RESOLVE_MODEL));

  await jobs.work(
    JOB_QUEUES.classifyTicket,
    // Metadata (retryCount/retryLimit) tells reportFinalFailures when a failure is the last attempt
    { includeMetadata: true },
    reportFinalFailures(
      JOB_QUEUES.classifyTicket,
      classifyTicketJobs(prisma, (input) => pace(() => classifier(input))),
    ),
  );
  await jobs.work(
    JOB_QUEUES.resolveTicket,
    // Metadata (retryCount/retryLimit) tells the handler when a failure is the last attempt
    { includeMetadata: true },
    reportFinalFailures(
      JOB_QUEUES.resolveTicket,
      resolveTicketJobs(prisma, (input) => pace(() => resolver(input)), {
        supportEmail: env.SUPPORT_EMAIL,
        // apps/worker/knowledge-base.md, from src/index.ts and from the bundled dist/index.mjs
        knowledgeBaseUrl: new URL('../knowledge-base.md', import.meta.url),
        enqueueSendEmail,
      }),
    ),
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
  await connection?.quit();
  await prisma.$disconnect();
  await flushMonitoring();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
