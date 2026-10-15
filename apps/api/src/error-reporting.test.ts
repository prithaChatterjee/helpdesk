import { createPrismaClient } from '@helpdesk/db';
import { reportError } from '@helpdesk/shared/monitoring';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { type AuthSession, createAuth } from './auth';

// Only reportError is replaced, so the rest of the app runs as usual
vi.mock('@helpdesk/shared/monitoring', () => ({ reportError: vi.fn() }));

const prisma = createPrismaClient('postgresql://unused:unused@localhost:1/unused');
const auth = createAuth(
  {
    secret: 'test-secret-test-secret-test-secret',
    baseURL: 'http://localhost:3000',
    webOrigin: 'http://localhost:5173',
    rateLimit: false,
  },
  prisma,
);
const INBOUND_EMAIL_SECRET = 'test-inbound-email-secret-0000000000';

function signInAsAdmin() {
  const now = new Date();
  const userId = '0199a000-0000-7000-8000-000000000001';
  vi.spyOn(auth.api, 'getSession').mockResolvedValue({
    user: {
      id: userId,
      name: 'Test User',
      email: 'test@example.com',
      emailVerified: true,
      image: null,
      role: 'ADMIN',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: '0199a000-0000-7000-8000-000000000002',
      token: 'token',
      userId,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
  } satisfies AuthSession as never);
}

afterEach(() => {
  vi.mocked(reportError).mockClear();
  vi.restoreAllMocks();
});

describe('error reporting', () => {
  const app = createApp(auth, prisma, { inboundEmailSecret: INBOUND_EMAIL_SECRET });

  it('reports an unhandled error with the route', async () => {
    signInAsAdmin();
    const err = new Error('connect ECONNREFUSED db:5432');
    vi.spyOn(prisma.user, 'findMany').mockRejectedValue(err);

    const res = await request(app).get('/api/users');

    expect(res.status).toBe(500);
    expect(reportError).toHaveBeenCalledExactlyOnceWith('Unhandled error in GET /api/users:', err);
  });

  it('does not report client errors such as malformed JSON', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"oops"');

    expect(res.status).toBe(400);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports a ticket whose AI jobs could not be queued', async () => {
    const queueApp = createApp(auth, prisma, {
      inboundEmailSecret: INBOUND_EMAIL_SECRET,
      enqueueNewTicketJobs: vi.fn().mockRejectedValue(new Error('database unavailable')),
    });
    vi.spyOn(prisma.message, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.ticket, 'create').mockResolvedValue({ id: 't1' } as never);

    const res = await request(queueApp)
      .post('/api/webhooks/inbound-email')
      .set('Authorization', `Bearer ${INBOUND_EMAIL_SECRET}`)
      .send({ messageId: '<m1@customer.test>', from: { email: 'jane@customer.test' }, text: 'Hi' });

    expect(res.status).toBe(201);
    expect(reportError).toHaveBeenCalledWith(
      "Couldn't queue AI jobs for ticket t1:",
      expect.objectContaining({ message: 'database unavailable' }),
      { feature: 'inbound-email' },
    );
  });
});
