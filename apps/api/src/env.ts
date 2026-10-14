import { nodeEnvSchema, parseEnv } from '@helpdesk/shared/env';
import { z } from 'zod';

// Values published in .env.example; a production deploy must replace them
const EXAMPLE_ADMIN_PASSWORD = 'change-me-please';
const EXAMPLE_BETTER_AUTH_SECRET = 'replace-with-at-least-32-random-characters';
const EXAMPLE_INBOUND_EMAIL_SECRET = 'replace-with-another-32-plus-random-characters';

const envSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    API_PORT: z.coerce.number().int().positive().default(3000),
    WEB_ORIGIN: z.url(),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    ADMIN_EMAIL: z.email(),
    // Better Auth's default minimum password length
    ADMIN_PASSWORD: z.string().min(8),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    // Bearer token for POST /api/webhooks/inbound-email
    INBOUND_EMAIL_SECRET: z.string().min(32),
    // Gemini API key (Google AI Studio) for polishing replies and summarizing tickets; without it
    // those buttons return an error
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    // Queue a send-email job for each Agent reply (the worker emails it with SendGrid). Off: replies
    // are only saved to the thread, so test tickets with made-up addresses are never emailed.
    EMAIL_SENDING_ENABLED: z.stringbool().default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.ADMIN_PASSWORD === EXAMPLE_ADMIN_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        path: ['ADMIN_PASSWORD'],
        message: 'Must not be the .env.example value in production',
      });
    }
    if (env.BETTER_AUTH_SECRET === EXAMPLE_BETTER_AUTH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: 'Must not be the .env.example value in production',
      });
    }
    if (env.INBOUND_EMAIL_SECRET === EXAMPLE_INBOUND_EMAIL_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['INBOUND_EMAIL_SECRET'],
        message: 'Must not be the .env.example value in production',
      });
    }
    // Better Auth sets the Secure cookie flag only when BETTER_AUTH_URL is https
    for (const key of ['BETTER_AUTH_URL', 'WEB_ORIGIN'] as const) {
      if (!env[key].startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Must be an https URL in production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export const env = parseEnv(envSchema);
