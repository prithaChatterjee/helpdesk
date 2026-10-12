import { createPrismaClient } from '@helpdesk/db';
import type { UserRole } from '@helpdesk/shared';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { type AuthSession, createAuth } from './auth';

// Prisma connects lazily, so routes that don't touch the database need no running Postgres
const prisma = createPrismaClient('postgresql://unused:unused@localhost:1/unused');
const auth = createAuth(
  {
    secret: 'test-secret-test-secret-test-secret',
    baseURL: 'http://localhost:3000',
    webOrigin: 'http://localhost:5173',
  },
  prisma,
);
const app = createApp(auth, prisma);

/** Makes the next requests look signed in as a user with `role`. */
function signInAs(role: UserRole, { isActive = true } = {}) {
  const now = new Date();
  const session = {
    user: {
      id: '0199a000-0000-7000-8000-000000000001',
      name: 'Test User',
      email: 'test@example.com',
      emailVerified: true,
      image: null,
      role,
      isActive,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: '0199a000-0000-7000-8000-000000000002',
      token: 'token',
      userId: '0199a000-0000-7000-8000-000000000001',
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
  } satisfies AuthSession;
  vi.spyOn(auth.api, 'getSession').mockResolvedValue(session as never);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/me', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/users', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a deactivated user', async () => {
    signInAs('ADMIN', { isActive: false });
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('returns 403 for an Agent', async () => {
    signInAs('AGENT');
    const findMany = vi.spyOn(prisma.user, 'findMany');
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('lists users for an Admin', async () => {
    signInAs('ADMIN');
    const createdAt = new Date('2026-10-01T09:30:00.000Z');
    vi.spyOn(prisma.user, 'findMany').mockResolvedValue([
      {
        id: '0199a000-0000-7000-8000-000000000003',
        name: 'Agent Smith',
        email: 'agent@example.com',
        role: 'AGENT',
        isActive: true,
        createdAt,
      },
    ] as never);

    const res = await request(app).get('/api/users');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      users: [
        {
          id: '0199a000-0000-7000-8000-000000000003',
          name: 'Agent Smith',
          email: 'agent@example.com',
          role: 'AGENT',
          isActive: true,
          createdAt: '2026-10-01T09:30:00.000Z',
        },
      ],
    });
  });
});

describe('error handler', () => {
  it('returns a generic 500 without internal details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    signInAs('ADMIN');
    vi.spyOn(prisma.user, 'findMany').mockRejectedValue(new Error('connect ECONNREFUSED db:5432'));

    const res = await request(app).get('/api/users');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
    expect(res.text).not.toContain('ECONNREFUSED');
  });

  it('keeps the 400 status for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"oops"');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.stringContaining('JSON') });
  });
});
