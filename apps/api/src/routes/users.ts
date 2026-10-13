import { Prisma, type PrismaClient } from '@helpdesk/db';
import {
  type CreateUserResponse,
  createUserSchema,
  type SortOrder,
  type UpdateUserResponse,
  updateUserSchema,
  type UserListResponse,
  userListQuerySchema,
  UserRole,
  type UserSortField,
} from '@helpdesk/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Auth } from '../auth';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

// Each sortable column's ORDER BY
const userOrderBy: Record<
  UserSortField,
  (order: SortOrder) => Prisma.UserOrderByWithRelationInput
> = {
  name: (order) => ({ name: order }),
  email: (order) => ({ email: order }),
  role: (order) => ({ role: order }),
  isActive: (order) => ({ isActive: order }),
  createdAt: (order) => ({ createdAt: order }),
};

const EMAIL_TAKEN = 'A user with this email already exists';
const USER_NOT_FOUND = 'User not found';

/** Admin-only user management. Mount behind `requireAuth` and `requireRole('ADMIN')`. */
export function usersRouter(auth: Auth, prisma: PrismaClient) {
  const router = Router();

  // Sorted by `?sortBy=&sortOrder=` (default: oldest first)
  router.get('/', async (req, res) => {
    const query = userListQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { sortBy, sortOrder } = query.data;

    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: userSelect,
      // id breaks ties, so equal values keep a stable order
      orderBy: [userOrderBy[sortBy](sortOrder), { id: sortOrder }],
    });
    const body: UserListResponse = {
      users: users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() })),
    };
    res.json(body);
  });

  // Creates an Agent with a credential account, the same shape Better Auth's sign-up would make
  router.post('/', async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { name, email, password } = parsed.data;

    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      res.status(409).json({ error: EMAIL_TAKEN });
      return;
    }

    const passwordHash = await (await auth.$context).password.hash(password);
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { name, email, emailVerified: true, role: UserRole.AGENT },
          select: userSelect,
        });
        await tx.account.create({
          data: {
            userId: created.id,
            accountId: created.id,
            providerId: 'credential',
            password: passwordHash,
          },
        });
        return created;
      });
    } catch (err) {
      // Lost a race with another request creating the same email
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        res.status(409).json({ error: EMAIL_TAKEN });
        return;
      }
      throw err;
    }

    const body: CreateUserResponse = {
      user: { ...user, createdAt: user.createdAt.toISOString() },
    };
    res.status(201).json(body);
  });

  // Edits name and email; a non-blank password replaces the credential password
  router.patch('/:id', async (req, res) => {
    const id = req.params.id;
    // Not a uuid can't match a user (and Postgres would reject it as a uuid column value)
    if (!z.uuid().safeParse(id).success) {
      res.status(404).json({ error: USER_NOT_FOUND });
      return;
    }
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { deletedAt: true },
    });
    if (!existing || existing.deletedAt) {
      res.status(404).json({ error: USER_NOT_FOUND });
      return;
    }
    const sameEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (sameEmail && sameEmail.id !== id) {
      res.status(409).json({ error: EMAIL_TAKEN });
      return;
    }

    const passwordHash = password ? await (await auth.$context).password.hash(password) : null;
    // An Admin changing their own password stays signed in on this device
    const keepSessionId = id === res.locals.user.id ? res.locals.session.id : undefined;
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: { name, email },
          select: userSelect,
        });
        if (passwordHash) {
          const credential = await tx.account.findFirst({
            where: { userId: id, providerId: 'credential' },
            select: { id: true },
          });
          if (credential) {
            await tx.account.update({
              where: { id: credential.id },
              data: { password: passwordHash },
            });
          } else {
            await tx.account.create({
              data: { userId: id, accountId: id, providerId: 'credential', password: passwordHash },
            });
          }
          // Whoever knew the old password is signed out everywhere
          await tx.session.deleteMany({
            where: { userId: id, ...(keepSessionId && { id: { not: keepSessionId } }) },
          });
        }
        return updated;
      });
    } catch (err) {
      // Lost a race with another request taking the same email
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        res.status(409).json({ error: EMAIL_TAKEN });
        return;
      }
      throw err;
    }

    const body: UpdateUserResponse = {
      user: { ...user, createdAt: user.createdAt.toISOString() },
    };
    res.json(body);
  });

  // Soft delete: the row stays (deactivated, `deletedAt` set) and the user is signed out everywhere.
  // Admins can't be deleted, which also keeps an Admin from deleting themselves.
  router.delete('/:id', async (req, res) => {
    const id = req.params.id;
    if (!z.uuid().safeParse(id).success) {
      res.status(404).json({ error: USER_NOT_FOUND });
      return;
    }
    const existing = await prisma.user.findUnique({
      where: { id },
      select: { role: true, deletedAt: true },
    });
    if (!existing || existing.deletedAt) {
      res.status(404).json({ error: USER_NOT_FOUND });
      return;
    }
    if (existing.role === UserRole.ADMIN) {
      res.status(403).json({ error: "Admins can't be deleted" });
      return;
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }),
      prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    res.status(204).end();
  });

  return router;
}
