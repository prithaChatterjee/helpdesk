import { QUEUE_NAMES } from '@helpdesk/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from './env';
import { processMaintenanceJob } from './processors/maintenance';

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

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down worker`);
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
