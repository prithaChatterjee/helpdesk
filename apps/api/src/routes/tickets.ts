import type { PrismaClient } from '@helpdesk/db';
import type { TicketListResponse } from '@helpdesk/shared';
import { Router } from 'express';

// Until the ticket list gets pagination and filters (plan 4.1–4.3)
const TICKET_LIST_LIMIT = 100;

/** Tickets for Admins and Agents. Mount behind `requireAuth`. */
export function ticketsRouter(prisma: PrismaClient) {
  const router = Router();

  // Most recent activity first
  router.get('/', async (_req, res) => {
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
      orderBy: { updatedAt: 'desc' },
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
