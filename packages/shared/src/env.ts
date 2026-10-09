import { z } from 'zod';

/**
 * Validates environment variables against a schema.
 * Throws one readable error listing every problem, so misconfiguration fails fast at startup.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');
