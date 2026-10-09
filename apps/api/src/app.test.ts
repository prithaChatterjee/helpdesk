import { createPrismaClient } from '@helpdesk/db';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createAuth } from './auth';

// Prisma connects lazily, so routes that don't touch the database need no running Postgres
const auth = createAuth(
  {
    secret: 'test-secret-test-secret-test-secret',
    baseURL: 'http://localhost:3000',
    webOrigin: 'http://localhost:5173',
  },
  createPrismaClient('postgresql://unused:unused@localhost:1/unused'),
);

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(createApp(auth)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/me', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await request(createApp(auth)).get('/api/me');
    expect(res.status).toBe(401);
  });
});
