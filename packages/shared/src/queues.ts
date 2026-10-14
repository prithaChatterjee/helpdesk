/** BullMQ queue names shared by the api (producer) and worker (consumer). */
export const QUEUE_NAMES = {
  maintenance: 'maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * pg-boss job queues. They live in PostgreSQL (schema `pgboss`), so they need no Redis; the api
 * sends jobs and the worker runs them.
 */
export const JOB_QUEUES = {
  /** Classify a ticket the inbound email webhook created */
  classifyTicket: 'classify-ticket',
} as const;

export type JobQueue = (typeof JOB_QUEUES)[keyof typeof JOB_QUEUES];

/** Data of a `classify-ticket` job. */
export interface ClassifyTicketJob {
  ticketId: string;
}
