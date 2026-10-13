import type { PrismaClient } from '@helpdesk/db';
import type { AssigneeListResponse } from '@helpdesk/shared';
import { Router } from 'express';

/** Who tickets can be assigned to, for Admins and Agents. Mount behind `requireAuth`. */
export function assigneesRouter(prisma: PrismaClient) {
  const router = Router();

  // Active, not deleted Admins and Agents by name; only ids and names, no emails or roles
  router.get('/', async (_req, res) => {
    const assignees = await prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const body: AssigneeListResponse = { assignees };
    res.json(body);
  });

  return router;
}
