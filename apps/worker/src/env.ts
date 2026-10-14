import { nodeEnvSchema, parseEnv } from '@helpdesk/shared/env';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  REDIS_URL: z.url(),
  // The tickets database, which also holds the pg-boss job queue
  DATABASE_URL: z.url(),
  // Gemini API key (Google AI Studio) for classifying tickets; without it classify-ticket jobs wait
  // in the queue
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  // Most classification requests per minute; the Gemini free tier allows only a few per model
  AI_REQUESTS_PER_MINUTE: z.coerce.number().positive().default(4),
});

export const env = parseEnv(envSchema);
