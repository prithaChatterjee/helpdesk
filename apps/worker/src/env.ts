import { nodeEnvSchema, parseEnv } from '@helpdesk/shared/env';
import { z } from 'zod';

const DEFAULT_SUPPORT_EMAIL = 'support@helpdesk.example';

const envSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    REDIS_URL: z.url(),
    // The tickets database, which also holds the pg-boss job queue
    DATABASE_URL: z.url(),
    // Gemini API key (Google AI Studio) for classifying and auto-resolving tickets; without it those
    // jobs wait in the queue
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    // Most AI requests per minute, both job types together; the Gemini free tier allows ~5 per model
    AI_REQUESTS_PER_MINUTE: z.coerce.number().positive().default(4),
    // The support address: sender of every emailed reply (a SendGrid verified sender) and of the
    // replies the AI writes when it auto-resolves a ticket
    SUPPORT_EMAIL: z.email().default(DEFAULT_SUPPORT_EMAIL),
    // Email replies (Agents' and the AI's) to customers with SendGrid; the api's flag of the same name
    // decides whether Agent replies get queued
    EMAIL_SENDING_ENABLED: z.stringbool().default(false),
    SENDGRID_API_KEY: z.string().min(1).optional(),
    // Reply-To of emailed replies, e.g. the SendGrid Inbound Parse address; unset, customers reply to
    // SUPPORT_EMAIL
    EMAIL_REPLY_TO: z.email().optional(),
    // Sentry project DSN for error reports; unset, errors are only logged
    SENTRY_DSN: z.url().optional(),
    // Sentry environment name; defaults to NODE_ENV
    SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.EMAIL_SENDING_ENABLED) return;
    if (!env.SENDGRID_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['SENDGRID_API_KEY'],
        message: 'Required when EMAIL_SENDING_ENABLED is true',
      });
    }
    if (env.SUPPORT_EMAIL === DEFAULT_SUPPORT_EMAIL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPPORT_EMAIL'],
        message: 'Set it to your SendGrid verified sender when EMAIL_SENDING_ENABLED is true',
      });
    }
  });

export const env = parseEnv(envSchema);
