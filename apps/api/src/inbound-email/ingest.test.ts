import { createPrismaClient, Prisma } from '@helpdesk/db';
import { type InboundEmailInput, inboundEmailSchema } from '@helpdesk/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ingestInboundEmail } from './ingest';

// Prisma connects lazily; every query these tests reach is stubbed
const prisma = createPrismaClient('postgresql://unused:unused@localhost:1/unused');

const TICKET_ID = '0199a000-0000-7000-8000-0000000000a1';
const NEW_TICKET_ID = '0199a000-0000-7000-8000-0000000000a2';

function email(overrides: Partial<InboundEmailInput> = {}) {
  return inboundEmailSchema.parse({
    messageId: '<m2@customer.test>',
    from: { email: 'jane@customer.test', name: 'Jane' },
    subject: "Can't log in",
    text: 'Help',
    ...overrides,
  });
}

function reply(overrides: Partial<InboundEmailInput> = {}) {
  return email({ inReplyTo: '<m1@customer.test>', subject: "Re: Can't log in", ...overrides });
}

interface StubOptions {
  /** The ticket of the message this email replies to */
  parent?: { status: string; customerEmail: string };
  /** Ticket id of an already stored copy of this email */
  duplicateOf?: string;
}

function stubDatabase({ parent, duplicateOf }: StubOptions = {}) {
  vi.spyOn(prisma.message, 'findUnique').mockResolvedValue(
    (duplicateOf ? { ticketId: duplicateOf } : null) as never,
  );
  return {
    findFirst: vi
      .spyOn(prisma.message, 'findFirst')
      .mockResolvedValue((parent ? { ticket: { id: TICKET_ID, ...parent } } : null) as never),
    createTicket: vi
      .spyOn(prisma.ticket, 'create')
      .mockResolvedValue({ id: NEW_TICKET_ID } as never),
    // Only collected into the stubbed $transaction, never awaited
    createMessage: vi.spyOn(prisma.message, 'create').mockReturnValue({} as never),
    updateTicket: vi.spyOn(prisma.ticket, 'update').mockReturnValue({} as never),
    transaction: vi.spyOn(prisma, '$transaction').mockResolvedValue([] as never),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ingestInboundEmail', () => {
  it('creates a ticket with the first message', async () => {
    const { createTicket, findFirst } = stubDatabase();

    const result = await ingestInboundEmail(
      prisma,
      email({ html: '<p>Help<script>x()</script></p>' }),
    );

    expect(result).toEqual({ result: 'created', ticketId: NEW_TICKET_ID });
    expect(findFirst).not.toHaveBeenCalled();
    expect(createTicket).toHaveBeenCalledWith({
      data: {
        subject: "Can't log in",
        customerEmail: 'jane@customer.test',
        customerName: 'Jane',
        messages: {
          create: {
            direction: 'INBOUND',
            fromEmail: 'jane@customer.test',
            fromName: 'Jane',
            bodyText: 'Help',
            bodyHtml: '<p>Help</p>',
            emailMessageId: 'm2@customer.test',
            inReplyTo: null,
            references: [],
          },
        },
      },
      select: { id: true },
    });
  });

  it('uses a placeholder subject and the HTML text when they are missing', async () => {
    const { createTicket } = stubDatabase();

    await ingestInboundEmail(prisma, email({ subject: '  ', text: '', html: '<p>From HTML</p>' }));

    const data = createTicket.mock.calls[0]?.[0].data;
    expect(data?.subject).toBe('(no subject)');
    expect(data?.messages?.create).toMatchObject({ bodyText: 'From HTML' });
  });

  it('assigns a new ticket to assignToId', async () => {
    const { createTicket } = stubDatabase();

    await ingestInboundEmail(prisma, email(), { assignToId: TICKET_ID });

    expect(createTicket.mock.calls[0]?.[0].data.assignedToId).toBe(TICKET_ID);
  });

  it('does not change the assignee of a ticket a reply is added to', async () => {
    const { createTicket, updateTicket } = stubDatabase({
      parent: { status: 'OPEN', customerEmail: 'jane@customer.test' },
    });

    await ingestInboundEmail(prisma, email({ inReplyTo: '<m1@customer.test>' }), {
      assignToId: TICKET_ID,
    });

    expect(createTicket).not.toHaveBeenCalled();
    expect(updateTicket.mock.calls[0]?.[0].data).not.toHaveProperty('assignedToId');
  });

  it('adds a reply to the open ticket it answers', async () => {
    const { createTicket, createMessage, updateTicket, findFirst } = stubDatabase({
      parent: { status: 'OPEN', customerEmail: 'jane@customer.test' },
    });

    const result = await ingestInboundEmail(
      prisma,
      reply({ references: '<m0@customer.test> <m1@customer.test>' }),
    );

    expect(result).toEqual({ result: 'appended', ticketId: TICKET_ID });
    expect(findFirst.mock.calls[0]?.[0]?.where).toEqual({
      emailMessageId: { in: ['m1@customer.test', 'm0@customer.test'] },
    });
    expect(createMessage).toHaveBeenCalledWith({
      data: expect.objectContaining({ ticketId: TICKET_ID, emailMessageId: 'm2@customer.test' }),
    });
    expect(updateTicket).toHaveBeenCalledWith({
      where: { id: TICKET_ID },
      data: { status: 'OPEN' },
    });
    expect(createTicket).not.toHaveBeenCalled();
  });

  it('reopens a Resolved ticket when the customer replies', async () => {
    const { updateTicket } = stubDatabase({
      parent: { status: 'RESOLVED', customerEmail: 'jane@customer.test' },
    });

    const result = await ingestInboundEmail(prisma, reply());

    expect(result.result).toBe('appended');
    expect(updateTicket).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'OPEN' } }),
    );
  });

  it('starts a new ticket for a reply to a Closed ticket', async () => {
    const { createTicket, createMessage } = stubDatabase({
      parent: { status: 'CLOSED', customerEmail: 'jane@customer.test' },
    });

    const result = await ingestInboundEmail(prisma, reply());

    expect(result).toEqual({ result: 'created', ticketId: NEW_TICKET_ID });
    expect(createTicket).toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("starts a new ticket for a reply from someone other than the ticket's customer", async () => {
    const { createTicket, createMessage } = stubDatabase({
      parent: { status: 'OPEN', customerEmail: 'jane@customer.test' },
    });

    const result = await ingestInboundEmail(prisma, reply({ from: { email: 'eve@other.test' } }));

    expect(result.result).toBe('created');
    expect(createTicket).toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('starts a new ticket when the replied-to message is unknown', async () => {
    const { createTicket } = stubDatabase();

    const result = await ingestInboundEmail(prisma, reply());

    expect(result.result).toBe('created');
    expect(createTicket).toHaveBeenCalled();
  });

  it('ignores an email that was already stored', async () => {
    const { createTicket, transaction } = stubDatabase({ duplicateOf: TICKET_ID });

    const result = await ingestInboundEmail(prisma, email());

    expect(result).toEqual({ result: 'duplicate', ticketId: TICKET_ID });
    expect(createTicket).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('reports a duplicate when a concurrent delivery stores the email first', async () => {
    const { createTicket } = stubDatabase();
    vi.spyOn(prisma.message, 'findUnique')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ticketId: TICKET_ID } as never);
    createTicket.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await ingestInboundEmail(prisma, email());

    expect(result).toEqual({ result: 'duplicate', ticketId: TICKET_ID });
  });

  it('rethrows other database errors', async () => {
    const { createTicket } = stubDatabase();
    createTicket.mockRejectedValue(new Error('connection lost'));

    await expect(ingestInboundEmail(prisma, email())).rejects.toThrow('connection lost');
  });

  it('ignores auto-replies without touching the database', async () => {
    const findUnique = vi.spyOn(prisma.message, 'findUnique');

    const result = await ingestInboundEmail(
      prisma,
      email({ headers: { 'Auto-Submitted': 'auto-replied' } }),
    );

    expect(result).toEqual({ result: 'ignored', reason: 'Auto-Submitted: auto-replied' });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
