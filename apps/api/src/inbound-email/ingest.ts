import { Prisma, type PrismaClient } from '@helpdesk/db';
import {
  type InboundEmail,
  type InboundEmailResponse,
  MessageDirection,
  TicketStatus,
} from '@helpdesk/shared';
import { detectAutoReply } from './auto-reply';
import { htmlToText, sanitizeEmailHtml } from './sanitize';

const NO_SUBJECT = '(no subject)';

/**
 * Turns an email received at the support address into a ticket, or adds it to the ticket it
 * replies to. Safe to call again for the same email (duplicate deliveries are ignored).
 * `assignToId` assigns a newly created ticket (not a reply), e.g. to the AI Agent.
 */
export async function ingestInboundEmail(
  prisma: PrismaClient,
  email: InboundEmail,
  { assignToId }: { assignToId?: string } = {},
): Promise<InboundEmailResponse> {
  const autoReply = detectAutoReply(email);
  if (autoReply) return { result: 'ignored', reason: autoReply };

  const existing = await prisma.message.findUnique({
    where: { emailMessageId: email.messageId },
    select: { ticketId: true },
  });
  if (existing) return { result: 'duplicate', ticketId: existing.ticketId };

  const bodyHtml = email.html ? sanitizeEmailHtml(email.html) : null;
  const message = {
    direction: MessageDirection.INBOUND,
    fromEmail: email.from.email,
    fromName: email.from.name || null,
    bodyText: email.text.trim() || (email.html ? htmlToText(email.html) : ''),
    bodyHtml,
    emailMessageId: email.messageId,
    inReplyTo: email.inReplyTo ?? null,
    references: email.references,
  };

  try {
    const ticket = await findThreadTicket(prisma, email);
    if (ticket) {
      await prisma.$transaction([
        prisma.message.create({ data: { ...message, ticketId: ticket.id } }),
        // A customer reply needs attention again; the update also bumps updatedAt
        prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: TicketStatus.OPEN },
        }),
      ]);
      return { result: 'appended', ticketId: ticket.id };
    }

    const created = await prisma.ticket.create({
      data: {
        subject: email.subject.trim() || NO_SUBJECT,
        customerEmail: email.from.email,
        customerName: email.from.name || null,
        assignedToId: assignToId,
        messages: { create: message },
      },
      select: { id: true },
    });
    return { result: 'created', ticketId: created.id };
  } catch (err) {
    // A concurrent delivery of the same email stored it first
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const stored = await prisma.message.findUnique({
        where: { emailMessageId: email.messageId },
        select: { ticketId: true },
      });
      return { result: 'duplicate', ticketId: stored?.ticketId };
    }
    throw err;
  }
}

/**
 * The open ticket this email replies to, matched through its In-Reply-To / References ids.
 * Replies to Closed tickets start a new ticket. The sender must be the ticket's customer, so
 * someone who learns a Message-ID can't post into another customer's ticket.
 */
async function findThreadTicket(prisma: PrismaClient, email: InboundEmail) {
  const threadIds = [...new Set([email.inReplyTo, ...email.references])].filter(
    (id): id is string => !!id,
  );
  if (threadIds.length === 0) return null;

  const parent = await prisma.message.findFirst({
    where: { emailMessageId: { in: threadIds } },
    orderBy: { createdAt: 'desc' },
    select: { ticket: { select: { id: true, status: true, customerEmail: true } } },
  });
  const ticket = parent?.ticket;
  if (!ticket || ticket.status === TicketStatus.CLOSED) return null;
  if (ticket.customerEmail !== email.from.email) return null;
  return ticket;
}
