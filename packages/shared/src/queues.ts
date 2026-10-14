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
  /** Answer and resolve a ticket from the knowledge base, when it can */
  resolveTicket: 'resolve-ticket',
  /** Email an outbound message (an Agent's or the AI's reply) to the ticket's customer */
  sendEmail: 'send-email',
} as const;

export type JobQueue = (typeof JOB_QUEUES)[keyof typeof JOB_QUEUES];

/** Data of a `classify-ticket` job. */
export interface ClassifyTicketJob {
  ticketId: string;
}

/** Data of a `resolve-ticket` job. */
export interface ResolveTicketJob {
  ticketId: string;
}

/** Data of a `send-email` job. */
export interface SendEmailJob {
  /** Id of the OUTBOUND `Message` to email */
  messageId: string;
}
