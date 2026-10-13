import { Prisma, type PrismaClient } from '@helpdesk/db';
import {
  type CreateReplyResponse,
  createReplySchema,
  MessageDirection,
  type SortOrder,
  type TicketDetailResponse,
  type TicketListResponse,
  ticketListQuerySchema,
  type TicketSortField,
  type UpdateTicketResponse,
  updateTicketSchema,
} from '@helpdesk/shared';
import { Router } from 'express';
import { z } from 'zod';

const TICKET_NOT_FOUND = 'Ticket not found';

/** The fields of a ticket list row (`TicketListItem`). */
const ticketListSelect = {
  id: true,
  subject: true,
  status: true,
  category: true,
  customerEmail: true,
  customerName: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.TicketSelect;

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
          select: { ...ticketListSelect, _count: { select: { messages: true } } },
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
      tickets: tickets.map(({ _count, ...ticket }) => ({
        ...ticket,
        // Every message after the customer's first email: their follow-ups and Agent replies
        replyCount: Math.max(_count.messages - 1, 0),
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      })),
    };
    res.json(body);
  });

  // One ticket with its whole thread, oldest message first
  router.get('/:id', async (req, res) => {
    const id = req.params.id;
    // Not a uuid can't match a ticket (and Postgres would reject it as a uuid column value)
    if (!z.uuid().safeParse(id).success) {
      res.status(404).json({ error: TICKET_NOT_FOUND });
      return;
    }
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: {
        ...ticketListSelect,
        summary: true,
        messages: {
          // Only the plain-text body: the client renders text, never stored HTML
          select: {
            id: true,
            direction: true,
            fromEmail: true,
            fromName: true,
            bodyText: true,
            createdAt: true,
          },
          // id (uuid v7, time-ordered) breaks ties between messages stored in the same millisecond
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!ticket) {
      res.status(404).json({ error: TICKET_NOT_FOUND });
      return;
    }
    const body: TicketDetailResponse = {
      ticket: {
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        messages: ticket.messages.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
        })),
      },
    };
    res.json(body);
  });

  // Changes the status and/or category, e.g. an Agent closing a ticket or correcting the AI
  router.patch('/:id', async (req, res) => {
    const id = req.params.id;
    if (!z.uuid().safeParse(id).success) {
      res.status(404).json({ error: TICKET_NOT_FOUND });
      return;
    }
    const parsed = updateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }

    let ticket;
    try {
      ticket = await prisma.ticket.update({
        where: { id },
        data: parsed.data,
        select: ticketListSelect,
      });
    } catch (err) {
      // No ticket with this id
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        res.status(404).json({ error: TICKET_NOT_FOUND });
        return;
      }
      throw err;
    }
    const body: UpdateTicketResponse = {
      ticket: {
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      },
    };
    res.json(body);
  });

  // An Agent's reply, added to the thread. Not emailed yet: sending comes with the email provider.
  router.post('/:id/replies', async (req, res) => {
    const id = req.params.id;
    if (!z.uuid().safeParse(id).success) {
      res.status(404).json({ error: TICKET_NOT_FOUND });
      return;
    }
    const parsed = createReplySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { user } = res.locals;

    let message;
    try {
      [, message] = await prisma.$transaction([
        // Fails first (P2025) when there is no such ticket; bumps updatedAt like a customer reply
        prisma.ticket.update({
          where: { id },
          data: { updatedAt: new Date() },
          select: { id: true },
        }),
        prisma.message.create({
          data: {
            ticketId: id,
            direction: MessageDirection.OUTBOUND,
            fromEmail: user.email,
            fromName: user.name,
            bodyText: parsed.data.body,
            sentByUserId: user.id,
          },
          select: {
            id: true,
            direction: true,
            fromEmail: true,
            fromName: true,
            bodyText: true,
            createdAt: true,
          },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        res.status(404).json({ error: TICKET_NOT_FOUND });
        return;
      }
      throw err;
    }
    const body: CreateReplyResponse = {
      message: { ...message, createdAt: message.createdAt.toISOString() },
    };
    res.status(201).json(body);
  });

  return router;
}
