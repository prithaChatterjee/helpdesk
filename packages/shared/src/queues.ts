/** BullMQ queue names shared by the api (producer) and worker (consumer). */
export const QUEUE_NAMES = {
  maintenance: 'maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
