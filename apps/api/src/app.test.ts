import { createPrismaClient, Prisma } from '@helpdesk/db';
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
    rateLimit: false,
  },
  prisma,
);
const INBOUND_EMAIL_SECRET = 'test-inbound-email-secret-0000000000';
const app = createApp(auth, prisma, { inboundEmailSecret: INBOUND_EMAIL_SECRET });

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

  it('leaves out soft-deleted users', async () => {
    signInAs('ADMIN');
    const findMany = vi.spyOn(prisma.user, 'findMany').mockResolvedValue([]);

    await request(app).get('/api/users');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null } }));
  });

  it('sorts oldest first by default', async () => {
    signInAs('ADMIN');
    const findMany = vi.spyOn(prisma.user, 'findMany').mockResolvedValue([]);

    await request(app).get('/api/users');

    expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it.each([
    ['name', 'asc'],
    ['email', 'desc'],
    ['role', 'asc'],
    ['isActive', 'desc'],
    ['createdAt', 'desc'],
  ] as const)('sorts by %s %s in the database', async (sortBy, sortOrder) => {
    signInAs('ADMIN');
    const findMany = vi.spyOn(prisma.user, 'findMany').mockResolvedValue([]);

    const res = await request(app).get('/api/users').query({ sortBy, sortOrder });

    expect(res.status).toBe(200);
    expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual([
      { [sortBy]: sortOrder },
      { id: sortOrder },
    ]);
  });

  it('returns 400 for a field that is not sortable', async () => {
    signInAs('ADMIN');
    const findMany = vi.spyOn(prisma.user, 'findMany');

    const res = await request(app).get('/api/users').query({ sortBy: 'password' });

    expect(res.status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/users', () => {
  const newUser = { name: 'Alan Agent', email: 'Alan@Example.com', password: 'Secret#123' };
  const createdAt = new Date('2026-10-12T08:00:00.000Z');
  const createdUser = {
    id: '0199a000-0000-7000-8000-000000000004',
    name: 'Alan Agent',
    email: 'alan@example.com',
    role: 'AGENT',
    isActive: true,
    createdAt,
  };

  /** Stubs a successful create; the transaction callback runs against the stubbed client. */
  function stubCreate() {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma, '$transaction').mockImplementation(((fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)) as never);
    const createUser = vi.spyOn(prisma.user, 'create').mockResolvedValue(createdUser as never);
    const createAccount = vi.spyOn(prisma.account, 'create').mockResolvedValue({} as never);
    return { createUser, createAccount };
  }

  it('returns 401 without a session cookie', async () => {
    const res = await request(app).post('/api/users').send(newUser);
    expect(res.status).toBe(401);
  });

  it('returns 403 for an Agent', async () => {
    signInAs('AGENT');
    const create = vi.spyOn(prisma.user, 'create');
    const res = await request(app).post('/api/users').send(newUser);
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 401 for a deactivated Admin', async () => {
    signInAs('ADMIN', { isActive: false });
    const create = vi.spyOn(prisma.user, 'create');
    const res = await request(app).post('/api/users').send(newUser);
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates an Agent with a hashed credential password', async () => {
    signInAs('ADMIN');
    const { createUser, createAccount } = stubCreate();

    const res = await request(app).post('/api/users').send(newUser);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ user: { ...createdUser, createdAt: '2026-10-12T08:00:00.000Z' } });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Alan Agent', email: 'alan@example.com', emailVerified: true, role: 'AGENT' },
      }),
    );
    const accountData = createAccount.mock.calls[0]?.[0].data;
    expect(accountData).toMatchObject({
      userId: createdUser.id,
      accountId: createdUser.id,
      providerId: 'credential',
    });
    const hash = accountData?.password;
    expect(hash).toEqual(expect.any(String));
    expect(hash).not.toContain(newUser.password);
    const ctx = await auth.$context;
    expect(await ctx.password.verify({ hash: hash as string, password: newUser.password })).toBe(
      true,
    );
    expect(res.text).not.toContain(hash);
  });

  it('ignores a role in the request body', async () => {
    signInAs('ADMIN');
    const { createUser } = stubCreate();

    await request(app)
      .post('/api/users')
      .send({ ...newUser, role: 'ADMIN' });

    expect(createUser.mock.calls[0]?.[0].data).toMatchObject({ role: 'AGENT' });
  });

  it('returns 400 with the validation message for a weak password', async () => {
    signInAs('ADMIN');
    const create = vi.spyOn(prisma.user, 'create');

    const res = await request(app)
      .post('/api/users')
      .send({ ...newUser, password: 'secret#123' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Password must contain an uppercase letter' });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing body', async () => {
    signInAs('ADMIN');
    const res = await request(app).post('/api/users');
    expect(res.status).toBe(400);
  });

  it('returns 409 when the email is already taken', async () => {
    signInAs('ADMIN');
    const findUnique = vi
      .spyOn(prisma.user, 'findUnique')
      .mockResolvedValue({ id: createdUser.id } as never);
    const create = vi.spyOn(prisma.user, 'create');

    const res = await request(app).post('/api/users').send(newUser);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'A user with this email already exists' });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'alan@example.com' } }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 409 when a concurrent request creates the same email', async () => {
    signInAs('ADMIN');
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma, '$transaction').mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const res = await request(app).post('/api/users').send(newUser);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'A user with this email already exists' });
  });
});

describe('PATCH /api/users/:id', () => {
  // signInAs() signs in as this user, with session ...0002
  const adminId = '0199a000-0000-7000-8000-000000000001';
  const agentId = '0199a000-0000-7000-8000-000000000005';
  const changes = { name: 'Alan Agent', email: 'Alan@Example.com', password: '' };
  const updatedUser = {
    id: agentId,
    name: 'Alan Agent',
    email: 'alan@example.com',
    role: 'AGENT',
    isActive: true,
    createdAt: new Date('2026-10-01T09:30:00.000Z'),
  };

  /**
   * Stubs an update where the Admin and `agentId` exist and `emailOwner` (if any) already has
   * the new email. The transaction callback runs against the stubbed client.
   */
  function stubUpdate({
    emailOwner,
    credential = true,
  }: { emailOwner?: string; credential?: boolean } = {}) {
    vi.spyOn(prisma.user, 'findUnique').mockImplementation((async ({
      where,
    }: {
      where: { id?: string; email?: string };
    }) => {
      if (where.email) return emailOwner ? { id: emailOwner } : null;
      return where.id === agentId || where.id === adminId ? { id: where.id } : null;
    }) as never);
    vi.spyOn(prisma, '$transaction').mockImplementation(((fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)) as never);
    return {
      updateUser: vi.spyOn(prisma.user, 'update').mockResolvedValue(updatedUser as never),
      findCredential: vi
        .spyOn(prisma.account, 'findFirst')
        .mockResolvedValue((credential ? { id: 'account-1' } : null) as never),
      updateAccount: vi.spyOn(prisma.account, 'update').mockResolvedValue({} as never),
      createAccount: vi.spyOn(prisma.account, 'create').mockResolvedValue({} as never),
      deleteSessions: vi
        .spyOn(prisma.session, 'deleteMany')
        .mockResolvedValue({ count: 2 } as never),
    };
  }

  it('returns 401 without a session cookie', async () => {
    const res = await request(app).patch(`/api/users/${agentId}`).send(changes);
    expect(res.status).toBe(401);
  });

  it('returns 403 for an Agent', async () => {
    signInAs('AGENT');
    const update = vi.spyOn(prisma.user, 'update');
    const res = await request(app).patch(`/api/users/${agentId}`).send(changes);
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('updates name and email and keeps the password when it is blank', async () => {
    signInAs('ADMIN');
    const { updateUser, findCredential, updateAccount, deleteSessions } = stubUpdate();

    const res = await request(app).patch(`/api/users/${agentId}`).send(changes);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { ...updatedUser, createdAt: '2026-10-01T09:30:00.000Z' } });
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: agentId },
        data: { name: 'Alan Agent', email: 'alan@example.com' },
      }),
    );
    expect(findCredential).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(deleteSessions).not.toHaveBeenCalled();
  });

  it('replaces the password with a hash and signs the user out everywhere', async () => {
    signInAs('ADMIN');
    const { updateAccount, deleteSessions } = stubUpdate();

    const res = await request(app)
      .patch(`/api/users/${agentId}`)
      .send({ ...changes, password: 'NewSecret#1' });

    expect(res.status).toBe(200);
    const accountUpdate = updateAccount.mock.calls[0]?.[0];
    expect(accountUpdate?.where).toEqual({ id: 'account-1' });
    const hash = accountUpdate?.data.password as string;
    expect(hash).not.toContain('NewSecret#1');
    const ctx = await auth.$context;
    expect(await ctx.password.verify({ hash, password: 'NewSecret#1' })).toBe(true);
    expect(res.text).not.toContain(hash);
    expect(deleteSessions).toHaveBeenCalledWith({ where: { userId: agentId } });
  });

  it('keeps the current session when an Admin changes their own password', async () => {
    signInAs('ADMIN');
    const { deleteSessions } = stubUpdate();

    await request(app)
      .patch(`/api/users/${adminId}`)
      .send({ ...changes, password: 'NewSecret#1' });

    expect(deleteSessions).toHaveBeenCalledWith({
      where: { userId: adminId, id: { not: '0199a000-0000-7000-8000-000000000002' } },
    });
  });

  it('creates a credential account when the user has none', async () => {
    signInAs('ADMIN');
    const { createAccount, updateAccount } = stubUpdate({ credential: false });

    await request(app)
      .patch(`/api/users/${agentId}`)
      .send({ ...changes, password: 'NewSecret#1' });

    expect(updateAccount).not.toHaveBeenCalled();
    expect(createAccount.mock.calls[0]?.[0].data).toMatchObject({
      userId: agentId,
      accountId: agentId,
      providerId: 'credential',
    });
  });

  it('returns 400 with the validation message for a weak new password', async () => {
    signInAs('ADMIN');
    const update = vi.spyOn(prisma.user, 'update');

    const res = await request(app)
      .patch(`/api/users/${agentId}`)
      .send({ ...changes, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Password must be at least 8 characters' });
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 404 for an id that is not a uuid', async () => {
    signInAs('ADMIN');
    const findUnique = vi.spyOn(prisma.user, 'findUnique');

    const res = await request(app).patch('/api/users/not-a-uuid').send(changes);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 for a user that does not exist', async () => {
    signInAs('ADMIN');
    const { updateUser } = stubUpdate();

    const res = await request(app)
      .patch('/api/users/0199a000-0000-7000-8000-0000000000ff')
      .send(changes);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('returns 409 when another user has the email', async () => {
    signInAs('ADMIN');
    const { updateUser } = stubUpdate({ emailOwner: '0199a000-0000-7000-8000-000000000003' });

    const res = await request(app).patch(`/api/users/${agentId}`).send(changes);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'A user with this email already exists' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('allows keeping the same email', async () => {
    signInAs('ADMIN');
    stubUpdate({ emailOwner: agentId });

    const res = await request(app).patch(`/api/users/${agentId}`).send(changes);

    expect(res.status).toBe(200);
  });

  it('returns 409 when a concurrent request takes the email', async () => {
    signInAs('ADMIN');
    stubUpdate();
    vi.spyOn(prisma, '$transaction').mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const res = await request(app).patch(`/api/users/${agentId}`).send(changes);

    expect(res.status).toBe(409);
  });

  it('returns 404 for a soft-deleted user', async () => {
    signInAs('ADMIN');
    const { updateUser } = stubUpdate();
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ deletedAt: new Date() } as never);

    const res = await request(app).patch(`/api/users/${agentId}`).send(changes);

    expect(res.status).toBe(404);
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/users/:id', () => {
  const agentId = '0199a000-0000-7000-8000-000000000005';

  /** Stubs the user lookup and the soft-delete writes. */
  function stubDelete(existing: { role: UserRole; deletedAt: Date | null } | null) {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(existing as never);
    return {
      updateUser: vi.spyOn(prisma.user, 'update').mockResolvedValue({} as never),
      deleteSessions: vi
        .spyOn(prisma.session, 'deleteMany')
        .mockResolvedValue({ count: 1 } as never),
      unassignTickets: vi.spyOn(prisma, '$executeRaw').mockReturnValue(0 as never),
      transaction: vi.spyOn(prisma, '$transaction').mockResolvedValue([] as never),
    };
  }

  it('returns 401 without a session cookie', async () => {
    const res = await request(app).delete(`/api/users/${agentId}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for an Agent', async () => {
    signInAs('AGENT');
    const { transaction } = stubDelete({ role: 'AGENT', deletedAt: null });

    const res = await request(app).delete(`/api/users/${agentId}`);

    expect(res.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('soft-deletes an Agent: sets deletedAt, deactivates, and signs them out', async () => {
    signInAs('ADMIN');
    const { updateUser, deleteSessions, transaction } = stubDelete({
      role: 'AGENT',
      deletedAt: null,
    });

    const res = await request(app).delete(`/api/users/${agentId}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: agentId },
      data: { deletedAt: expect.any(Date), isActive: false },
    });
    expect(deleteSessions).toHaveBeenCalledWith({ where: { userId: agentId } });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("unassigns the Agent's tickets in the same transaction, keeping their updatedAt", async () => {
    signInAs('ADMIN');
    const { unassignTickets, transaction } = stubDelete({ role: 'AGENT', deletedAt: null });
    unassignTickets.mockReturnValue('unassign-query' as never);

    await request(app).delete(`/api/users/${agentId}`);

    const sql = (unassignTickets.mock.calls[0]?.[0] as unknown as string[]).join('?');
    expect(sql).toBe('UPDATE tickets SET "assignedToId" = NULL WHERE "assignedToId" = ?::uuid');
    expect(unassignTickets.mock.calls[0]?.[1]).toBe(agentId);
    expect(transaction.mock.calls[0]?.[0]).toContain('unassign-query');
  });

  it('never removes the row', async () => {
    signInAs('ADMIN');
    stubDelete({ role: 'AGENT', deletedAt: null });
    const hardDelete = vi.spyOn(prisma.user, 'delete');

    await request(app).delete(`/api/users/${agentId}`);

    expect(hardDelete).not.toHaveBeenCalled();
  });

  it('refuses to delete an Admin', async () => {
    signInAs('ADMIN');
    const { transaction } = stubDelete({ role: 'ADMIN', deletedAt: null });

    const res = await request(app).delete(`/api/users/${agentId}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Admins can't be deleted" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for a user that does not exist', async () => {
    signInAs('ADMIN');
    const { transaction } = stubDelete(null);

    const res = await request(app).delete(`/api/users/${agentId}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for a user that is already deleted', async () => {
    signInAs('ADMIN');
    const { transaction } = stubDelete({ role: 'AGENT', deletedAt: new Date() });

    const res = await request(app).delete(`/api/users/${agentId}`);

    expect(res.status).toBe(404);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for an id that is not a uuid', async () => {
    signInAs('ADMIN');
    const findUnique = vi.spyOn(prisma.user, 'findUnique');

    const res = await request(app).delete('/api/users/not-a-uuid');

    expect(res.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
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

describe('POST /api/webhooks/inbound-email', () => {
  const inboundEmail = {
    messageId: '<m1@customer.test>',
    from: { email: 'jane@customer.test', name: 'Jane' },
    subject: "Can't log in",
    text: 'Help',
  };

  function postEmail(body: unknown, secret = INBOUND_EMAIL_SECRET) {
    return request(app)
      .post('/api/webhooks/inbound-email')
      .set('Authorization', `Bearer ${secret}`)
      .send(body as object);
  }

  it('returns 401 without the secret', async () => {
    const create = vi.spyOn(prisma.ticket, 'create');
    const res = await request(app).post('/api/webhooks/inbound-email').send(inboundEmail);
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 401 with a wrong secret', async () => {
    const res = await postEmail(inboundEmail, 'wrong-secret');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signed-in user without the secret', async () => {
    signInAs('ADMIN');
    const res = await request(app).post('/api/webhooks/inbound-email').send(inboundEmail);
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid email', async () => {
    const res = await postEmail({ ...inboundEmail, from: { email: 'not-an-email' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid sender email address' });
  });

  it('accepts a body over the 1 MB app-wide limit', async () => {
    vi.spyOn(prisma.message, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.ticket, 'create').mockResolvedValue({ id: 't1' } as never);
    const res = await postEmail({ ...inboundEmail, html: `<p>${'a'.repeat(2_000_000)}</p>` });
    expect(res.status).toBe(201);
  });

  it('returns 201 with the new ticket id', async () => {
    vi.spyOn(prisma.message, 'findUnique').mockResolvedValue(null);
    const create = vi
      .spyOn(prisma.ticket, 'create')
      .mockResolvedValue({ id: '0199a000-0000-7000-8000-0000000000a1' } as never);

    const res = await postEmail(inboundEmail);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      result: 'created',
      ticketId: '0199a000-0000-7000-8000-0000000000a1',
    });
    expect(create.mock.calls[0]?.[0].data.customerEmail).toBe('jane@customer.test');
  });

  it('returns 200 for a duplicate delivery', async () => {
    vi.spyOn(prisma.message, 'findUnique').mockResolvedValue({ ticketId: 't1' } as never);
    const res = await postEmail(inboundEmail);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: 'duplicate', ticketId: 't1' });
  });

  it('returns 200 for an ignored auto-reply', async () => {
    const res = await postEmail({ ...inboundEmail, headers: { Precedence: 'bulk' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: 'ignored', reason: 'Precedence: bulk' });
  });
});

describe('GET /api/tickets', () => {
  const createdAt = new Date('2026-10-01T10:00:00.000Z');
  const updatedAt = new Date('2026-10-02T10:00:00.000Z');
  const ticketRow = {
    id: 't1',
    subject: "Can't log in",
    status: 'OPEN',
    category: null,
    customerEmail: 'jane@customer.test',
    customerName: 'Jane',
    assignedTo: { id: 'u2', name: 'Sam Agent' },
    createdAt,
    updatedAt,
    // The first email and two more messages
    _count: { messages: 3 },
  };

  /** Stubs one page of tickets and the total; the transaction just runs both stubs. */
  function stubTicketPage(rows: unknown[] = [], total = rows.length) {
    const findMany = vi.spyOn(prisma.ticket, 'findMany').mockResolvedValue(rows as never);
    const count = vi.spyOn(prisma.ticket, 'count').mockResolvedValue(total as never);
    const transaction = vi
      .spyOn(prisma, '$transaction')
      .mockImplementation(((queries: Promise<unknown>[]) => Promise.all(queries)) as never);
    return { findMany, count, transaction };
  }

  it('returns 401 without a session cookie', async () => {
    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(401);
  });

  it.each(['ADMIN', 'AGENT'] as const)(
    'lists the first page, newest first, for an %s',
    async (role) => {
      signInAs(role);
      const { findMany } = stubTicketPage([ticketRow], 101);

      const res = await request(app).get('/api/tickets');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        total: 101,
        page: 1,
        pageSize: 25,
        tickets: [
          {
            id: 't1',
            subject: "Can't log in",
            status: 'OPEN',
            category: null,
            customerEmail: 'jane@customer.test',
            customerName: 'Jane',
            assignee: { id: 'u2', name: 'Sam Agent' },
            replyCount: 2,
            createdAt: '2026-10-01T10:00:00.000Z',
            updatedAt: '2026-10-02T10:00:00.000Z',
          },
        ],
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: 0,
          take: 25,
        }),
      );
    },
  );

  it('counts messages in the database for the reply count', async () => {
    signInAs('AGENT');
    const { findMany } = stubTicketPage([ticketRow]);

    await request(app).get('/api/tickets');

    expect(findMany.mock.calls[0]?.[0]?.select).toMatchObject({
      _count: { select: { messages: true } },
    });
  });

  it.each([
    [1, 0],
    // A ticket always has its first email, but a count of 0 must not go negative
    [0, 0],
  ])('reports %i messages as %i replies', async (messages, replyCount) => {
    signInAs('AGENT');
    stubTicketPage([{ ...ticketRow, _count: { messages } }]);

    const res = await request(app).get('/api/tickets');

    expect(res.body.tickets[0]).toMatchObject({ replyCount });
    expect(res.body.tickets[0]).not.toHaveProperty('_count');
  });

  it('skips the rows of earlier pages', async () => {
    signInAs('AGENT');
    const { findMany } = stubTicketPage([], 101);

    const res = await request(app).get('/api/tickets').query({ page: 3, pageSize: 10 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 101, page: 3, pageSize: 10 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it('counts and fetches in one repeatable-read transaction', async () => {
    signInAs('AGENT');
    const { transaction, count } = stubTicketPage();

    await request(app).get('/api/tickets');

    expect(count).toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('returns an empty page with the total past the last page', async () => {
    signInAs('AGENT');
    stubTicketPage([], 30);

    const res = await request(app).get('/api/tickets').query({ page: 9, pageSize: 25 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 30, page: 9, pageSize: 25, tickets: [] });
  });

  it.each([
    [{ page: 0 }, 'Page must be at least 1'],
    [{ page: 'two' }, 'Page must be a whole number'],
    [{ pageSize: 1000 }, 'Page size must be one of 10, 25, 50, 100'],
  ])('returns 400 for %o', async (query, error) => {
    signInAs('AGENT');
    const { findMany } = stubTicketPage();

    const res = await request(app).get('/api/tickets').query(query);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['subject', 'asc', [{ subject: 'asc' }, { id: 'asc' }]],
    [
      'customer',
      'desc',
      [
        { customerName: { sort: 'desc', nulls: 'last' } },
        { customerEmail: 'desc' },
        { id: 'desc' },
      ],
    ],
    ['status', 'asc', [{ status: 'asc' }, { id: 'asc' }]],
    ['category', 'asc', [{ category: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]],
    ['createdAt', 'asc', [{ createdAt: 'asc' }, { id: 'asc' }]],
  ])('sorts by %s %s in the database', async (sortBy, sortOrder, orderBy) => {
    signInAs('AGENT');
    const { findMany } = stubTicketPage();

    const res = await request(app).get('/api/tickets').query({ sortBy, sortOrder });

    expect(res.status).toBe(200);
    expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual(orderBy);
  });

  it('returns 400 for a field that is not sortable', async () => {
    signInAs('AGENT');
    const { findMany } = stubTicketPage();

    const res = await request(app).get('/api/tickets').query({ sortBy: 'summary' });

    expect(res.status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown sort direction', async () => {
    signInAs('AGENT');
    const res = await request(app).get('/api/tickets').query({ sortOrder: 'sideways' });
    expect(res.status).toBe(400);
  });

  describe('filters', () => {
    it('lists every ticket without filters', async () => {
      signInAs('AGENT');
      const { findMany, count } = stubTicketPage();

      await request(app).get('/api/tickets');

      expect(findMany.mock.calls[0]?.[0]?.where).toEqual({});
      expect(count).toHaveBeenCalledWith({ where: {} });
    });

    it('filters by status and category, counting only the matches', async () => {
      signInAs('AGENT');
      const { findMany, count } = stubTicketPage([ticketRow], 1);

      const res = await request(app)
        .get('/api/tickets')
        .query({ status: 'OPEN', category: 'REFUND' });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      const where = { status: 'OPEN', category: 'REFUND' };
      expect(findMany.mock.calls[0]?.[0]?.where).toEqual(where);
      expect(count).toHaveBeenCalledWith({ where });
    });

    it('searches the subject, customer email and name, ignoring case', async () => {
      signInAs('AGENT');
      const { findMany, count } = stubTicketPage();

      await request(app).get('/api/tickets').query({ search: '  Refund  ' });

      const contains = { contains: 'Refund', mode: 'insensitive' };
      const where = {
        OR: [{ subject: contains }, { customerEmail: contains }, { customerName: contains }],
      };
      expect(findMany.mock.calls[0]?.[0]?.where).toEqual(where);
      expect(count).toHaveBeenCalledWith({ where });
    });

    it('searches for % and _ literally', async () => {
      signInAs('AGENT');
      const { findMany } = stubTicketPage();

      await request(app).get('/api/tickets').query({ search: '100%_off' });

      expect(findMany.mock.calls[0]?.[0]?.where?.OR).toContainEqual({
        subject: { contains: '100\\%\\_off', mode: 'insensitive' },
      });
    });

    it("filters to the signed-in user's tickets", async () => {
      signInAs('AGENT');
      const { findMany } = stubTicketPage();

      await request(app).get('/api/tickets').query({ assignee: 'me' });

      expect(findMany.mock.calls[0]?.[0]?.where).toEqual({
        assignedToId: '0199a000-0000-7000-8000-000000000001',
      });
    });

    it('filters to unassigned tickets', async () => {
      signInAs('AGENT');
      const { findMany } = stubTicketPage();

      await request(app).get('/api/tickets').query({ assignee: 'unassigned' });

      expect(findMany.mock.calls[0]?.[0]?.where).toEqual({ assignedToId: null });
    });

    it('ignores a blank search', async () => {
      signInAs('AGENT');
      const { findMany } = stubTicketPage();

      const res = await request(app).get('/api/tickets').query({ search: '   ' });

      expect(res.status).toBe(200);
      expect(findMany.mock.calls[0]?.[0]?.where).toEqual({});
    });

    it.each([
      [{ status: 'PENDING' }],
      [{ category: 'BILLING' }],
      [{ assignee: '0199a000-0000-7000-8000-000000000002' }],
      [{ search: 'x'.repeat(201) }],
      [{ status: ['OPEN', 'CLOSED'] }],
      [{ search: ['a', 'b'] }],
    ])('returns 400 for %o', async (query) => {
      signInAs('AGENT');
      const { findMany } = stubTicketPage();

      const res = await request(app).get('/api/tickets').query(query);

      expect(res.status).toBe(400);
      expect(findMany).not.toHaveBeenCalled();
    });
  });
});

describe('GET /api/tickets/:id', () => {
  const ticketId = '0199a000-0000-7000-8000-0000000000a1';
  const ticketRow = {
    id: ticketId,
    subject: "Can't log in",
    status: 'OPEN',
    category: 'TECHNICAL',
    customerEmail: 'jane@customer.test',
    customerName: 'Jane',
    summary: null,
    assignedTo: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-02T10:00:00.000Z'),
    messages: [
      {
        id: 'm1',
        direction: 'INBOUND',
        fromEmail: 'jane@customer.test',
        fromName: 'Jane',
        bodyText: 'I forgot my password',
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
      },
      {
        id: 'm2',
        direction: 'OUTBOUND',
        fromEmail: 'support@helpdesk.test',
        fromName: null,
        bodyText: 'Here is a reset link',
        createdAt: new Date('2026-10-02T10:00:00.000Z'),
      },
    ],
  };

  it('returns 401 without a session cookie', async () => {
    const res = await request(app).get(`/api/tickets/${ticketId}`);
    expect(res.status).toBe(401);
  });

  it.each(['ADMIN', 'AGENT'] as const)(
    'returns the ticket with its messages for an %s',
    async (role) => {
      signInAs(role);
      vi.spyOn(prisma.ticket, 'findUnique').mockResolvedValue(ticketRow as never);

      const res = await request(app).get(`/api/tickets/${ticketId}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ticket: {
          id: ticketId,
          subject: "Can't log in",
          status: 'OPEN',
          category: 'TECHNICAL',
          customerEmail: 'jane@customer.test',
          customerName: 'Jane',
          summary: null,
          assignee: null,
          createdAt: '2026-10-01T10:00:00.000Z',
          updatedAt: '2026-10-02T10:00:00.000Z',
          messages: [
            {
              id: 'm1',
              direction: 'INBOUND',
              fromEmail: 'jane@customer.test',
              fromName: 'Jane',
              bodyText: 'I forgot my password',
              createdAt: '2026-10-01T10:00:00.000Z',
            },
            {
              id: 'm2',
              direction: 'OUTBOUND',
              fromEmail: 'support@helpdesk.test',
              fromName: null,
              bodyText: 'Here is a reset link',
              createdAt: '2026-10-02T10:00:00.000Z',
            },
          ],
        },
      });
    },
  );

  it('fetches messages oldest first, without the HTML body', async () => {
    signInAs('AGENT');
    const findUnique = vi.spyOn(prisma.ticket, 'findUnique').mockResolvedValue(ticketRow as never);

    await request(app).get(`/api/tickets/${ticketId}`);

    const args = findUnique.mock.calls[0]?.[0];
    expect(args?.where).toEqual({ id: ticketId });
    const messages = args?.select?.messages;
    expect(messages).toMatchObject({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    expect(typeof messages === 'object' && messages.select).not.toHaveProperty('bodyHtml');
  });

  it('returns 404 for a ticket that does not exist', async () => {
    signInAs('AGENT');
    vi.spyOn(prisma.ticket, 'findUnique').mockResolvedValue(null);

    const res = await request(app).get(`/api/tickets/${ticketId}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ticket not found' });
  });

  it('returns 404 without querying for an id that is not a uuid', async () => {
    signInAs('AGENT');
    const findUnique = vi.spyOn(prisma.ticket, 'findUnique');

    const res = await request(app).get('/api/tickets/not-a-uuid');

    expect(res.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/tickets/:id', () => {
  const ticketId = '0199a000-0000-7000-8000-0000000000a1';
  const assigneeId = '0199a000-0000-7000-8000-000000000002';
  const updatedRow = {
    id: ticketId,
    subject: "Can't log in",
    status: 'RESOLVED',
    category: 'TECHNICAL',
    customerEmail: 'jane@customer.test',
    customerName: 'Jane',
    assignedTo: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-03T10:00:00.000Z'),
  };

  /** Runs the callback transaction on `prisma`, with the ticket update and assignee lookup stubbed. */
  function stubUpdate(row: unknown = updatedRow, assignees: { id: string }[] = []) {
    vi.spyOn(prisma, '$transaction').mockImplementation(((fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)) as never);
    const update = vi.spyOn(prisma.ticket, 'update').mockResolvedValue(row as never);
    const findAssignee = vi.spyOn(prisma, '$queryRaw').mockResolvedValue(assignees as never);
    return { update, findAssignee };
  }

  it('returns 401 without a session cookie', async () => {
    const res = await request(app).patch(`/api/tickets/${ticketId}`).send({ status: 'RESOLVED' });
    expect(res.status).toBe(401);
  });

  it.each(['ADMIN', 'AGENT'] as const)(
    'changes the status and category for an %s',
    async (role) => {
      signInAs(role);
      const { update, findAssignee } = stubUpdate();

      const res = await request(app)
        .patch(`/api/tickets/${ticketId}`)
        .send({ status: 'RESOLVED', category: 'TECHNICAL' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ticket: {
          id: ticketId,
          subject: "Can't log in",
          status: 'RESOLVED',
          category: 'TECHNICAL',
          customerEmail: 'jane@customer.test',
          customerName: 'Jane',
          assignee: null,
          createdAt: '2026-10-01T10:00:00.000Z',
          updatedAt: '2026-10-03T10:00:00.000Z',
        },
      });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ticketId },
          data: { status: 'RESOLVED', category: 'TECHNICAL', assignedToId: undefined },
        }),
      );
      // No assignee to look up
      expect(findAssignee).not.toHaveBeenCalled();
    },
  );

  it('changes only the fields that are sent', async () => {
    signInAs('AGENT');
    const { update } = stubUpdate();

    await request(app).patch(`/api/tickets/${ticketId}`).send({ category: 'REFUND' });

    // Prisma leaves undefined fields alone
    expect(update.mock.calls[0]?.[0]?.data).toEqual({
      category: 'REFUND',
      assignedToId: undefined,
    });
  });

  it('assigns the ticket to an active user', async () => {
    signInAs('AGENT');
    const { update, findAssignee } = stubUpdate(
      { ...updatedRow, assignedTo: { id: assigneeId, name: 'Sam Agent' } },
      [{ id: assigneeId }],
    );

    const res = await request(app).patch(`/api/tickets/${ticketId}`).send({ assigneeId });

    expect(res.status).toBe(200);
    expect(res.body.ticket.assignee).toEqual({ id: assigneeId, name: 'Sam Agent' });
    expect(res.body.ticket).not.toHaveProperty('assignedTo');
    expect(update.mock.calls[0]?.[0]?.data).toEqual({ assignedToId: assigneeId });
    // Locks the user row so a concurrent delete waits, then unassigns the ticket
    const sql = (findAssignee.mock.calls[0]?.[0] as unknown as string[]).join('?');
    expect(sql).toContain('"isActive"');
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(sql).toContain('FOR SHARE');
    expect(findAssignee.mock.calls[0]?.[1]).toBe(assigneeId);
  });

  it('returns 400 for an assignee who is not an active user', async () => {
    signInAs('AGENT');
    // A deleted, deactivated or unknown user is not found
    const { update } = stubUpdate(updatedRow, []);

    const res = await request(app).patch(`/api/tickets/${ticketId}`).send({ assigneeId });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Unknown assignee' });
    expect(update).not.toHaveBeenCalled();
  });

  it('unassigns the ticket without looking anyone up', async () => {
    signInAs('AGENT');
    const { update, findAssignee } = stubUpdate();

    const res = await request(app).patch(`/api/tickets/${ticketId}`).send({ assigneeId: null });

    expect(res.status).toBe(200);
    expect(res.body.ticket.assignee).toBeNull();
    expect(update.mock.calls[0]?.[0]?.data).toEqual({ assignedToId: null });
    expect(findAssignee).not.toHaveBeenCalled();
  });

  it.each([
    [{}, 'Nothing to update'],
    [{ status: 'PENDING' }, undefined],
    [{ category: null }, undefined],
    [{ subject: 'Changed' }, undefined],
    [{ assigneeId: 'sam' }, 'Unknown assignee'],
  ])('returns 400 for %o', async (body, error) => {
    signInAs('AGENT');
    const update = vi.spyOn(prisma.ticket, 'update');

    const res = await request(app).patch(`/api/tickets/${ticketId}`).send(body);

    expect(res.status).toBe(400);
    if (error) expect(res.body).toEqual({ error });
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 404 for a ticket that does not exist', async () => {
    signInAs('AGENT');
    stubUpdate().update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    const res = await request(app).patch(`/api/tickets/${ticketId}`).send({ status: 'CLOSED' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ticket not found' });
  });

  it('returns 404 without querying for an id that is not a uuid', async () => {
    signInAs('AGENT');
    const update = vi.spyOn(prisma.ticket, 'update');

    const res = await request(app).patch('/api/tickets/not-a-uuid').send({ status: 'CLOSED' });

    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('GET /api/assignees', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await request(app).get('/api/assignees');
    expect(res.status).toBe(401);
  });

  it.each(['ADMIN', 'AGENT'] as const)(
    'lists active users by name, with only ids and names, for an %s',
    async (role) => {
      signInAs(role);
      const assignees = [
        { id: 'u1', name: 'Ann Admin' },
        { id: 'u2', name: 'Sam Agent' },
      ];
      const findMany = vi.spyOn(prisma.user, 'findMany').mockResolvedValue(assignees as never);

      const res = await request(app).get('/api/assignees');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ assignees });
      expect(findMany).toHaveBeenCalledWith({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
    },
  );
});

describe('POST /api/tickets/:id/replies', () => {
  const ticketId = '0199a000-0000-7000-8000-0000000000a1';
  const savedMessage = {
    id: 'm3',
    direction: 'OUTBOUND',
    fromEmail: 'test@example.com',
    fromName: 'Test User',
    bodyText: 'Here is a reset link.',
    createdAt: new Date('2026-10-03T10:00:00.000Z'),
  };

  /** Stubs the transaction; its queries are lazy, so the spies only record their arguments. */
  function stubReply(result: unknown = [{ id: ticketId }, savedMessage]) {
    const update = vi.spyOn(prisma.ticket, 'update').mockReturnValue('update' as never);
    const create = vi.spyOn(prisma.message, 'create').mockReturnValue('create' as never);
    const transaction = vi.spyOn(prisma, '$transaction').mockResolvedValue(result as never);
    return { update, create, transaction };
  }

  it('returns 401 without a session cookie', async () => {
    const res = await request(app).post(`/api/tickets/${ticketId}/replies`).send({ body: 'Hi' });
    expect(res.status).toBe(401);
  });

  it.each(['ADMIN', 'AGENT'] as const)('saves the reply for an %s', async (role) => {
    signInAs(role);
    stubReply();

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/replies`)
      .send({ body: 'Here is a reset link.' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      message: {
        id: 'm3',
        direction: 'OUTBOUND',
        fromEmail: 'test@example.com',
        fromName: 'Test User',
        bodyText: 'Here is a reset link.',
        createdAt: '2026-10-03T10:00:00.000Z',
      },
    });
  });

  it('stores an outbound message from the signed-in Agent, trimmed', async () => {
    signInAs('AGENT');
    const { create } = stubReply();

    await request(app)
      .post(`/api/tickets/${ticketId}/replies`)
      .send({ body: '  Here is a reset link.\n' });

    expect(create.mock.calls[0]?.[0]?.data).toEqual({
      ticketId,
      direction: 'OUTBOUND',
      fromEmail: 'test@example.com',
      fromName: 'Test User',
      bodyText: 'Here is a reset link.',
      sentByUserId: '0199a000-0000-7000-8000-000000000001',
    });
  });

  it('bumps the ticket in the same transaction, before adding the message', async () => {
    signInAs('AGENT');
    const { update, transaction } = stubReply();

    await request(app).post(`/api/tickets/${ticketId}/replies`).send({ body: 'Hi' });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ticketId },
        data: { updatedAt: expect.any(Date) },
      }),
    );
    expect(transaction).toHaveBeenCalledWith(['update', 'create']);
  });

  it('does not change the ticket status', async () => {
    signInAs('AGENT');
    const { update } = stubReply();

    await request(app).post(`/api/tickets/${ticketId}/replies`).send({ body: 'Hi' });

    expect(update.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
  });

  it.each([
    [{ body: '' }, 'Write a reply'],
    [{ body: '   ' }, 'Write a reply'],
    [{ body: 'a'.repeat(20_001) }, 'Keep the reply under 20,000 characters'],
    [{}, undefined],
  ])('returns 400 for %o', async (body, error) => {
    signInAs('AGENT');
    const { transaction } = stubReply();

    const res = await request(app).post(`/api/tickets/${ticketId}/replies`).send(body);

    expect(res.status).toBe(400);
    if (error) expect(res.body).toEqual({ error });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for a ticket that does not exist', async () => {
    signInAs('AGENT');
    stubReply();
    vi.spyOn(prisma, '$transaction').mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    const res = await request(app).post(`/api/tickets/${ticketId}/replies`).send({ body: 'Hi' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ticket not found' });
  });

  it('returns 404 without querying for an id that is not a uuid', async () => {
    signInAs('AGENT');
    const { transaction } = stubReply();

    const res = await request(app).post('/api/tickets/not-a-uuid/replies').send({ body: 'Hi' });

    expect(res.status).toBe(404);
    expect(transaction).not.toHaveBeenCalled();
  });
});
