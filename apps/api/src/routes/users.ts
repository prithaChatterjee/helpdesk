import type { PrismaClient } from '@helpdesk/db';
import type { UserListResponse } from '@helpdesk/shared';
import { Router } from 'express';

/** Admin-only user management. Mount behind `requireAuth` and `requireRole('ADMIN')`. */
export function usersRouter(prisma: PrismaClient) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const body: UserListResponse = {
      users: users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() })),
    };
    res.json(body);
  });

  return router;
}
