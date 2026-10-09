import { nodeEnvSchema, parseEnv } from '@helpdesk/shared/env';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  API_PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.url(),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(12),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

export const env = parseEnv(envSchema);
