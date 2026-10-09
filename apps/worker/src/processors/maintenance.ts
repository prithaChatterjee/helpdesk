import type { Job } from 'bullmq';

/** Handles jobs on the maintenance queue. Session cleanup and auto-close jobs are added in later phases. */
export async function processMaintenanceJob(job: Job): Promise<{ ok: true }> {
  switch (job.name) {
    case 'ping':
      return { ok: true };
    default:
      throw new Error(`Unknown maintenance job: ${job.name}`);
  }
}
