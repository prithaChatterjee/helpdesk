import type { Prisma, PrismaClient } from '@helpdesk/db';
import {
  AI_SENDER_NAME,
  type DashboardStatsResponse,
  MessageDirection,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TicketStatus,
} from '@helpdesk/shared';
import { Router } from 'express';

/**
 * A Resolved ticket the AI answered on its own: it has an AI reply (no Agent behind it, sent as
 * `AI_SENDER_NAME`) and no reply from an Agent.
 */
export const resolvedByAiWhere = {
  status: TicketStatus.RESOLVED,
  messages: {
    some: {
      direction: MessageDirection.OUTBOUND,
      sentByUserId: null,
      fromName: AI_SENDER_NAME,
    },
    none: { direction: MessageDirection.OUTBOUND, sentByUserId: { not: null } },
  },
} as const satisfies Prisma.TicketWhereInput;

/** Ticket statistics for the dashboard, for Admins and Agents. Mount behind `requireAuth`. */
export function dashboardRouter(prisma: PrismaClient) {
  const router = Router();

  // Counts across all time
  router.get('/stats', async (_req, res) => {
    // Repeatable read: all three queries see the same snapshot, so the numbers add up
    const [statusGroups, categoryGroups, resolvedByAi] = await prisma.$transaction(
      [
        prisma.ticket.groupBy({
          by: ['status'],
          _count: { _all: true },
          orderBy: { status: 'asc' },
        }),
        prisma.ticket.groupBy({
          by: ['category'],
          _count: { _all: true },
          orderBy: { category: 'asc' },
        }),
        prisma.ticket.count({ where: resolvedByAiWhere }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );

    const statusCount = (status: string) =>
      statusGroups.find((g) => g.status === status)?._count._all ?? 0;
    const categoryCount = (category: string | null) =>
      categoryGroups.find((g) => g.category === category)?._count._all ?? 0;

    const byStatus = TICKET_STATUSES.map((status) => ({ status, count: statusCount(status) }));
    const body: DashboardStatsResponse = {
      total: byStatus.reduce((sum, s) => sum + s.count, 0),
      open: statusCount(TicketStatus.OPEN),
      resolved: statusCount(TicketStatus.RESOLVED),
      resolvedByAi,
      byStatus,
      byCategory: [...TICKET_CATEGORIES, null].map((category) => ({
        category,
        count: categoryCount(category),
      })),
    };
    res.json(body);
  });

  return router;
}
