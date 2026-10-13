import type { Prisma, PrismaClient } from '@helpdesk/db';
import {
  type SortOrder,
  type TicketListResponse,
  ticketListQuerySchema,
  type TicketSortField,
} from '@helpdesk/shared';
import { Router } from 'express';

// Until the ticket list gets pagination and filters (plan 4.1–4.3)
const TICKET_LIST_LIMIT = 100;

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

  // Sorted by `?sortBy=&sortOrder=` (default: most recent activity first)
  router.get('/', async (req, res) => {
    const query = ticketListQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { sortBy, sortOrder } = query.data;

    const tickets = await prisma.ticket.findMany({
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
      take: TICKET_LIST_LIMIT,
    });
    const body: TicketListResponse = {
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
