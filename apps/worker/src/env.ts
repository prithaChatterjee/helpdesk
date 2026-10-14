import { nodeEnvSchema, parseEnv } from '@helpdesk/shared/env';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  REDIS_URL: z.url(),
  // The tickets database, which also holds the pg-boss job queue
  DATABASE_URL: z.url(),
  // Gemini API key (Google AI Studio) for classifying and auto-resolving tickets; without it those
  // jobs wait in the queue
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  // Most AI requests per minute, both job types together; the Gemini free tier allows ~5 per model
  AI_REQUESTS_PER_MINUTE: z.coerce.number().positive().default(4),
  // Sender address of replies the AI writes when it auto-resolves a ticket
  SUPPORT_EMAIL: z.email().default('support@helpdesk.example'),
});

export const env = parseEnv(envSchema);
