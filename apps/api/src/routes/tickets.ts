import type { Prisma, PrismaClient } from '@helpdesk/db';
import {
  type SortOrder,
  type TicketListResponse,
  ticketListQuerySchema,
  type TicketSortField,
} from '@helpdesk/shared';
import { Router } from 'express';

// Each sortable column's ORDER BY. Customer sorts by name, then email for tickets without one.
const ticketOrderBy: Record<
  TicketSortField,
  (order: SortOrder) => Prisma.TicketOrderByWithRelationInput[]
> = {
  subject: (order) => [{ subject: order }],
  customer: (order) => [{ customerName: { sort: order, nulls: 'last' } }, { customerEmail: order }],
  status: (order) => [{ status: order }],
  category: (order) => [{ category: { sort: order, nulls: 'last' } }],
  createdAt: (order) => [{ createdAt: order }],
  updatedAt: (order) => [{ updatedAt: order }],
};

/** Tickets for Admins and Agents. Mount behind `requireAuth`. */
export function ticketsRouter(prisma: PrismaClient) {
  const router = Router();

  // One page (`?page=&pageSize=`, default the first 25), sorted by `?sortBy=&sortOrder=`
  // (default most recent activity first)
  router.get('/', async (req, res) => {
    const query = ticketListQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { sortBy, sortOrder, page, pageSize } = query.data;

    // Repeatable read: both queries see the same snapshot, so the total matches the page
    const [tickets, total] = await prisma.$transaction(
      [
        prisma.ticket.findMany({
          select: {
            id: true,
            subject: true,
            status: true,
            category: true,
            customerEmail: true,
            customerName: true,
            createdAt: true,
            updatedAt: true,
          },
          // id breaks ties, so equal values keep a stable order
          orderBy: [...ticketOrderBy[sortBy](sortOrder), { id: sortOrder }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.ticket.count(),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    // A page past the end (e.g. after tickets were deleted) comes back empty, with the total
    const body: TicketListResponse = {
      total,
      page,
      pageSize,
      tickets: tickets.map((ticket) => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      })),
    };
    res.json(body);
  });

  return router;
}
