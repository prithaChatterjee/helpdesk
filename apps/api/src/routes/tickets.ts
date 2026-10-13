import { Prisma, type PrismaClient } from '@helpdesk/db';
import {
  type CreateReplyResponse,
  createReplySchema,
  MessageDirection,
  type SortOrder,
  type TicketDetailResponse,
  type TicketFilters,
  type TicketListResponse,
  ticketListQuerySchema,
  type TicketSortField,
  type UpdateTicketResponse,
  updateTicketSchema,
} from '@helpdesk/shared';
import { Router } from 'express';
import { z } from 'zod';
import { escapeLikePattern } from '../like-pattern';

const TICKET_NOT_FOUND = 'Ticket not found';

/** The fields of a ticket list row (`TicketListItem`). */
const ticketListSelect = {
  id: true,
  subject: true,
  status: true,
  category: true,
  customerEmail: true,
  customerName: true,
  assignedTo: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.TicketSelect;

type TicketListFields = Prisma.TicketGetPayload<{ select: typeof ticketListSelect }>;

/** A selected ticket as the API sends it: `assignee` and ISO dates. */
function toTicketListItem<T extends TicketListFields>({ assignedTo, ...ticket }: T) {
  return {
    ...ticket,
    assignee: assignedTo,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

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

/** The WHERE for the list's filters; every given filter must match. `userId` is who "me" is. */
function ticketListWhere(
  { status, category, assignee, search }: TicketFilters,
  userId: string,
): Prisma.TicketWhereInput {
  const contains = search && { contains: escapeLikePattern(search), mode: 'insensitive' as const };
  return {
    status,
    category,
    ...(assignee && { assignedToId: assignee === 'me' ? userId : null }),
    ...(contains && {
      OR: [{ subject: contains }, { customerEmail: contains }, { customerName: contains }],
    }),
  };
}

/** Tickets for Admins and Agents. Mount behind `requireAuth`. */
export function ticketsRouter(prisma: PrismaClient) {
  const router = Router();

  // One page (`?page=&pageSize=`, default the first 25) of the tickets matching
  // `?status=&category=&assignee=&search=`, sorted by `?sortBy=&sortOrder=` (default most recent activity first)
  router.get('/', async (req, res) => {
    const query = ticketListQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { sortBy, sortOrder, page, pageSize, ...filters } = query.data;
    const where = ticketListWhere(filters, res.locals.user.id);

    // Repeatable read: both queries see the same snapshot, so the total matches the page
    const [tickets, total] = await prisma.$transaction(
      [
        prisma.ticket.findMany({
          where,
          select: { ...ticketListSelect, _count: { select: { messages: true } } },
          // id breaks ties, so equal values keep a stable order
          orderBy: [...ticketOrderBy[sortBy](sortOrder), { id: sortOrder }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.ticket.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    // A page past the end (e.g. after tickets were deleted) comes back empty, with the total
    const body: TicketListResponse = {
      total,
      page,
      pageSize,
      tickets: tickets.map(({ _count, ...ticket }) => ({
        ...toTicketListItem(ticket),
        // Every message after the customer's first email: their follow-ups and Agent replies
        replyCount: Math.max(_count.messages - 1, 0),
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
        ...toTicketListItem(ticket),
        messages: ticket.messages.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
        })),
      },
    };
    res.json(body);
  });

  // Changes the status, category and/or assignee, e.g. an Agent closing a ticket, correcting the AI
  // or taking the ticket on
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

    const { assigneeId, ...fields } = parsed.data;

    let ticket;
    try {
      ticket = await prisma.$transaction(async (tx) => {
        if (assigneeId) {
          // Only active, not deleted users. FOR SHARE makes a concurrent delete of this user wait
          // until the assignment is saved, so the delete then unassigns it.
          const assignees = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM users
            WHERE id = ${assigneeId}::uuid AND "isActive" AND "deletedAt" IS NULL
            FOR SHARE`;
          if (assignees.length === 0) return null;
        }
        return tx.ticket.update({
          where: { id },
          // An undefined assignee is left as it is; null unassigns
          data: { ...fields, assignedToId: assigneeId },
          select: ticketListSelect,
        });
      });
    } catch (err) {
      // No ticket with this id
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        res.status(404).json({ error: TICKET_NOT_FOUND });
        return;
      }
      throw err;
    }
    if (!ticket) {
      res.status(400).json({ error: 'Unknown assignee' });
      return;
    }
    const body: UpdateTicketResponse = { ticket: toTicketListItem(ticket) };
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
