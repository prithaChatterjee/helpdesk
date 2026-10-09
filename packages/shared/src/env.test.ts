import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseEnv } from './env';

const schema = z.object({
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.url(),
});

describe('parseEnv', () => {
  it('returns parsed and coerced values', () => {
    const env = parseEnv(schema, { PORT: '3000', DATABASE_URL: 'postgresql://localhost/db' });
    expect(env).toEqual({ PORT: 3000, DATABASE_URL: 'postgresql://localhost/db' });
  });

  it('throws listing every invalid variable', () => {
    expect(() => parseEnv(schema, { PORT: 'abc' })).toThrowError(
      /PORT[\s\S]*DATABASE_URL|DATABASE_URL[\s\S]*PORT/,
    );
  });
});
