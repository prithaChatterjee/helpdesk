import { createPrismaClient, type JobWithMetadata } from '@helpdesk/db';
import type { SendEmailJob } from '@helpdesk/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSendGridSender,
  EmailSendError,
  type EmailSender,
  MAX_REFERENCES,
  type OutgoingEmail,
  replySubject,
  SENDGRID_SEND_URL,
  sendEmailJobs,
  sendMessageEmail,
} from './send-email';

// Prisma connects lazily, so stubbed queries need no running Postgres
const prisma = createPrismaClient('postgresql://unused:unused@localhost:1/unused');
const messageId = '0199a000-0000-7000-8000-0000000000b3';
const options = { supportEmail: 'support@acme.test' };

const email: OutgoingEmail = {
  from: { email: 'support@acme.test', name: 'Alan Agent' },
  to: { email: 'jane@customer.test', name: 'Jane Doe' },
  subject: 'Re: Help',
  text: 'Here is a reset link.',
  headers: { 'Message-ID': '<new@acme.test>' },
};

describe('createSendGridSender', () => {
  function stubFetch(response: Response) {
    return vi.fn<typeof fetch>().mockResolvedValue(response);
  }

  it('posts the email to the Mail Send API with the API key', async () => {
    const fetchFn = stubFetch(new Response(null, { status: 202 }));

    await createSendGridSender('SG.key', fetchFn)({ ...email, replyTo: 'help@parse.acme.test' });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(SENDGRID_SEND_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer SG.key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      personalizations: [{ to: [{ email: 'jane@customer.test', name: 'Jane Doe' }] }],
      from: { email: 'support@acme.test', name: 'Alan Agent' },
      reply_to: { email: 'help@parse.acme.test' },
      subject: 'Re: Help',
      content: [{ type: 'text/plain', value: 'Here is a reset link.' }],
      headers: { 'Message-ID': '<new@acme.test>' },
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
      },
    });
  });

  it('leaves out reply_to when there is none', async () => {
    const fetchFn = stubFetch(new Response(null, { status: 202 }));

    await createSendGridSender('SG.key', fetchFn)(email);

    expect(JSON.parse(fetchFn.mock.calls[0]?.[1]?.body as string)).not.toHaveProperty('reply_to');
  });

  it('removes commas and semicolons SendGrid rejects in display names', async () => {
    const fetchFn = stubFetch(new Response(null, { status: 202 }));

    await createSendGridSender(
      'SG.key',
      fetchFn,
    )({
      ...email,
      to: { email: 'jane@customer.test', name: 'Doe, Jane; "J"' },
    });

    const body = JSON.parse(fetchFn.mock.calls[0]?.[1]?.body as string);
    expect(body.personalizations[0].to[0]).toEqual({
      email: 'jane@customer.test',
      name: 'Doe Jane J',
    });
  });

  it.each([400, 401, 403, 413])('throws a permanent error for %i', async (status) => {
    const fetchFn = stubFetch(new Response('{"errors":[{"message":"bad"}]}', { status }));

    const sent = createSendGridSender('SG.key', fetchFn)(email);

    await expect(sent).rejects.toThrow(
      `SendGrid returned ${status}: {"errors":[{"message":"bad"}]}`,
    );
    await expect(sent).rejects.toMatchObject({ permanent: true });
  });

  it.each([408, 429, 500, 503])('throws a temporary error for %i', async (status) => {
    const fetchFn = stubFetch(new Response('busy', { status }));

    await expect(createSendGridSender('SG.key', fetchFn)(email)).rejects.toMatchObject({
      name: 'EmailSendError',
      permanent: false,
    });
  });
});

describe('replySubject', () => {
  it.each([
    ['Help', 'Re: Help'],
    ['Re: Help', 'Re: Help'],
    ['RE: Help', 'RE: Help'],
    ['  Help ', 'Re: Help'],
  ])('turns %o into %o', (subject, expected) => {
    expect(replySubject(subject)).toBe(expected);
  });
});

/** A thread message as `sendMessageEmail` selects it. */
function threadMessage(id: string, direction: string, minute: number, emailMessageId: string) {
  return { id, direction, emailMessageId, createdAt: new Date(Date.UTC(2026, 9, 1, 10, minute)) };
}

const pendingReply = {
  id: messageId,
  direction: 'OUTBOUND',
  fromName: 'Alan Agent',
  bodyText: 'Here is a reset link.',
  deliveryStatus: 'PENDING',
  emailMessageId: null,
  createdAt: new Date(Date.UTC(2026, 9, 1, 10, 30)),
  ticket: {
    subject: "Can't log in",
    customerEmail: 'jane@customer.test',
    customerName: 'Jane Doe',
    messages: [
      threadMessage('m1', 'INBOUND', 0, 'first@customer.test'),
      threadMessage('m2', 'OUTBOUND', 10, 'reply@acme.test'),
      threadMessage('m3', 'INBOUND', 20, 'second@customer.test'),
      // A follow-up the Agent sent before this one
      threadMessage('m4', 'OUTBOUND', 25, 'followup@acme.test'),
    ],
  },
};

function stubMessage(message: unknown = pendingReply) {
  vi.spyOn(prisma.message, 'findUnique').mockResolvedValue(message as never);
  const update = vi.spyOn(prisma.message, 'update').mockResolvedValue({} as never);
  const updateMany = vi
    .spyOn(prisma.message, 'updateMany')
    .mockResolvedValue({ count: 1 } as never);
  return { update, updateMany };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendMessageEmail', () => {
  it('emails the reply from the support address to the customer, threaded', async () => {
    stubMessage();
    const send = vi.fn<EmailSender>().mockResolvedValue();

    await expect(sendMessageEmail(prisma, send, messageId, options)).resolves.toEqual({
      result: 'sent',
    });

    const sent = send.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      from: { email: 'support@acme.test', name: 'Alan Agent' },
      to: { email: 'jane@customer.test', name: 'Jane Doe' },
      subject: "Re: Can't log in",
      text: 'Here is a reset link.',
    });
    expect(sent?.headers).toEqual({
      'Message-ID': expect.stringMatching(/^<[0-9a-f-]{36}@acme\.test>$/),
      // The customer's latest email
      'In-Reply-To': '<second@customer.test>',
      References:
        '<first@customer.test> <reply@acme.test> <second@customer.test> <followup@acme.test>',
    });
  });

  it('saves the new Message-ID before sending, so a retry reuses it', async () => {
    const { update } = stubMessage();
    const send = vi.fn<EmailSender>().mockResolvedValue();

    await sendMessageEmail(prisma, send, messageId, options);

    const saved = update.mock.calls[0]?.[0].data.emailMessageId;
    expect(update).toHaveBeenCalledWith({
      where: { id: messageId },
      data: { emailMessageId: saved },
    });
    expect(send.mock.calls[0]?.[0].headers['Message-ID']).toBe(`<${saved}>`);
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0] ?? 0);
  });

  it('reuses a Message-ID saved by an earlier attempt', async () => {
    const { update } = stubMessage({ ...pendingReply, emailMessageId: 'kept@acme.test' });
    const send = vi.fn<EmailSender>().mockResolvedValue();

    await sendMessageEmail(prisma, send, messageId, options);

    expect(update).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].headers['Message-ID']).toBe('<kept@acme.test>');
  });

  it('marks the message sent', async () => {
    const { updateMany } = stubMessage();

    await sendMessageEmail(prisma, vi.fn<EmailSender>().mockResolvedValue(), messageId, options);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: messageId, deliveryStatus: 'PENDING' },
      data: { deliveryStatus: 'SENT', sentAt: expect.any(Date), deliveryError: null },
    });
  });

  it('passes the Reply-To address on', async () => {
    stubMessage();
    const send = vi.fn<EmailSender>().mockResolvedValue();

    await sendMessageEmail(prisma, send, messageId, {
      ...options,
      replyTo: 'help@parse.acme.test',
    });

    expect(send.mock.calls[0]?.[0].replyTo).toBe('help@parse.acme.test');
  });

  it('leaves later messages and itself out of the thread headers', async () => {
    stubMessage({
      ...pendingReply,
      emailMessageId: 'self@acme.test',
      ticket: {
        ...pendingReply.ticket,
        messages: [
          threadMessage('m1', 'INBOUND', 0, 'first@customer.test'),
          { ...threadMessage(messageId, 'OUTBOUND', 30, 'self@acme.test') },
          threadMessage('m9', 'INBOUND', 40, 'later@customer.test'),
        ],
      },
    });
    const send = vi.fn<EmailSender>().mockResolvedValue();

    await sendMessageEmail(prisma, send, messageId, options);

    expect(send.mock.calls[0]?.[0].headers).toEqual({
      'Message-ID': '<self@acme.test>',
      'In-Reply-To': '<first@customer.test>',
      References: '<first@customer.test>',
    });
  });

  it(`keeps only the latest ${MAX_REFERENCES} references`, async () => {
    const messages = Array.from({ length: MAX_REFERENCES + 5 }, (_, i) =>
      threadMessage(`m${i}`, 'INBOUND', i, `id${i}@customer.test`),
    );
    stubMessage({ ...pendingReply, ticket: { ...pendingReply.ticket, messages } });
    const send = vi.fn<EmailSender>().mockResolvedValue();

    await sendMessageEmail(prisma, send, messageId, options);

    const references = send.mock.calls[0]?.[0].headers.References?.split(' ');
    expect(references).toHaveLength(MAX_REFERENCES);
    expect(references?.[0]).toBe('<id5@customer.test>');
  });

  it('sends without thread headers when no earlier email has a Message-ID', async () => {
    stubMessage({ ...pendingReply, ticket: { ...pendingReply.ticket, messages: [] } });
    const send = vi.fn<EmailSender>().mockResolvedValue();

    await sendMessageEmail(prisma, send, messageId, options);

    expect(Object.keys(send.mock.calls[0]?.[0].headers ?? {})).toEqual(['Message-ID']);
  });

  it.each([
    [null, 'no such message'],
    [{ ...pendingReply, direction: 'INBOUND' }, 'not an outbound message'],
    [{ ...pendingReply, deliveryStatus: 'SENT' }, 'delivery status is SENT'],
    [{ ...pendingReply, deliveryStatus: null }, 'delivery status is unset'],
  ])('skips %#: %s', async (message, reason) => {
    stubMessage(message);
    const send = vi.fn<EmailSender>();

    await expect(sendMessageEmail(prisma, send, messageId, options)).resolves.toEqual({
      result: 'skipped',
      reason,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('marks the message failed on a permanent provider error', async () => {
    const { updateMany } = stubMessage();
    const send = vi
      .fn<EmailSender>()
      .mockRejectedValue(new EmailSendError('SendGrid returned 403', true));

    await expect(sendMessageEmail(prisma, send, messageId, options)).resolves.toEqual({
      result: 'failed',
      reason: 'SendGrid returned 403',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: messageId, deliveryStatus: 'PENDING' },
      data: { deliveryStatus: 'FAILED', deliveryError: 'SendGrid returned 403' },
    });
  });

  it('throws on a temporary error so the job is retried, leaving the message pending', async () => {
    const { updateMany } = stubMessage();
    const send = vi
      .fn<EmailSender>()
      .mockRejectedValue(new EmailSendError('SendGrid returned 503', false));

    await expect(sendMessageEmail(prisma, send, messageId, options)).rejects.toThrow('503');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('sendEmailJobs', () => {
  function job(retryCount = 0) {
    return { data: { messageId }, retryCount, retryLimit: 6 } as JobWithMetadata<SendEmailJob>;
  }

  it('sends each job and logs the outcome', async () => {
    stubMessage();
    const send = vi.fn<EmailSender>().mockResolvedValue();
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendEmailJobs(prisma, send, options)([job()]);

    expect(send).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledWith(`[send-email] message ${messageId}: sent`);
  });

  it('rethrows a temporary failure without giving up before the last attempt', async () => {
    const { updateMany } = stubMessage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn<EmailSender>().mockRejectedValue(new Error('network down'));

    await expect(sendEmailJobs(prisma, send, options)([job(2)])).rejects.toThrow('network down');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('marks the message failed when the last attempt fails', async () => {
    const { updateMany } = stubMessage();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn<EmailSender>().mockRejectedValue(new Error('network down'));

    await expect(sendEmailJobs(prisma, send, options)([job(6)])).rejects.toThrow('network down');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: messageId, deliveryStatus: 'PENDING' },
      data: { deliveryStatus: 'FAILED', deliveryError: 'network down' },
    });
    expect(errors).toHaveBeenCalledWith(
      `[send-email] message ${messageId} failed for good: network down`,
    );
  });
});
