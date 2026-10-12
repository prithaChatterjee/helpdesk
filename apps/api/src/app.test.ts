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
