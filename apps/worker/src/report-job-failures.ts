import type { JobWithMetadata } from '@helpdesk/db';
import { captureError } from '@helpdesk/shared/monitoring';

/**
 * Wraps a pg-boss handler (registered with `includeMetadata: true`) so that a job failing for good
 * is reported to Sentry, tagged with its queue. Earlier attempts that pg-boss retries are only
 * logged by the handler itself, so a busy AI provider retrying for an hour doesn't flood Sentry.
 */
export function reportFinalFailures<T>(
  queue: string,
  handler: (jobs: JobWithMetadata<T>[]) => Promise<void>,
  capture: typeof captureError = captureError,
) {
  return async (jobs: JobWithMetadata<T>[]) => {
    try {
      await handler(jobs);
    } catch (err) {
      if (jobs.some((job) => job.retryCount >= job.retryLimit)) {
        capture(err, { queue, jobId: jobs.map((job) => job.id).join(',') });
      }
      throw err;
    }
  };
}
