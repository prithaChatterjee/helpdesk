// Node-only package: never import from apps/web.
export { AI_AGENT, findAiAgentId, unassignFromAiAgent, upsertAiAgent } from './ai-agent';
export { createPrismaClient } from './client';
export {
  type Job,
  type JobWithMetadata,
  JOB_PRIORITY,
  type JobQueueClient,
  type JobReason,
  sendClassifyTicketJob,
  sendResolveTicketJob,
  startJobQueue,
} from './jobs';
export * from './generated/prisma/client';
