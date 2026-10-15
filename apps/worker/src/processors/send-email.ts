import { randomUUID } from 'node:crypto';
import type { JobWithMetadata, PrismaClient } from '@helpdesk/db';
import { DeliveryStatus, MessageDirection, type SendEmailJob } from '@helpdesk/shared';
import { captureError } from '@helpdesk/shared/monitoring';

export const SENDGRID_SEND_URL = 'https://api.sendgrid.com/v3/mail/send';
const SEND_TIMEOUT_MS = 30_000;
/** Most earlier Message-IDs in `References`; mail clients only need the recent ones to thread */
export const MAX_REFERENCES = 20;

interface Address {
  email: string;
  name?: string;
}

/** An email ready for the provider: plain text, with the threading headers already set. */
export interface OutgoingEmail {
  from: Address;
  replyTo?: string;
  to: Address;
  subject: string;
  text: string;
  /** `Message-ID`, `In-Reply-To`, `References` */
  headers: Record<string, string>;
}

/** Sends one email; throws `EmailSendError` when the provider refuses it. */
export type EmailSender = (email: OutgoingEmail) => Promise<void>;

/** The provider refused an email. `permanent` errors (e.g. an invalid address) won't pass on retry. */
export class EmailSendError extends Error {
  readonly permanent: boolean;

  constructor(message: string, permanent: boolean) {
    super(message);
    this.name = 'EmailSendError';
    this.permanent = permanent;
  }
}

// SendGrid rejects display names containing `;` or `,` (e.g. "Doe, Jane")
function cleanName(name: string | undefined): string | undefined {
  const cleaned = name?.replace(/[;,"]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

/**
 * An `EmailSender` for SendGrid's v3 Mail Send API. `from` must be a verified sender (Single Sender
 * Verification) or on an authenticated domain. Click and open tracking are off, so links reach the
 * customer unchanged and no tracking pixel is added.
 */
export function createSendGridSender(apiKey: string, fetchFn: typeof fetch = fetch): EmailSender {
  return async ({ from, replyTo, to, subject, text, headers }) => {
    const res = await fetchFn(SENDGRID_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to.email, name: cleanName(to.name) }] }],
        from: { email: from.email, name: cleanName(from.name) },
        ...(replyTo && { reply_to: { email: replyTo } }),
        subject,
        content: [{ type: 'text/plain', value: text }],
        headers,
        tracking_settings: {
          click_tracking: { enable: false, enable_text: false },
          open_tracking: { enable: false },
        },
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    // 202 Accepted: SendGrid queued it for delivery
    if (res.ok) return;
    const detail = (await res.text().catch(() => '')).slice(0, 500);
    // Rate limits (429), timeouts (408) and server errors pass on retry; other 4xx (bad API key,
    // unverified sender, invalid address) need a fix first
    const permanent =
      res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
    throw new EmailSendError(`SendGrid returned ${res.status}: ${detail}`, permanent);
  };
}

export interface SendMessageOptions {
  /** The verified sender every email goes out from, e.g. support@yourcompany.com */
  supportEmail: string;
  /** Where customer replies go, e.g. the Inbound Parse address; unset, they go to `supportEmail` */
  replyTo?: string;
}

export type SendOutcome =
  { result: 'sent' } | { result: 'failed'; reason: string } | { result: 'skipped'; reason: string };

const withBrackets = (id: string) => `<${id}>`;

/** `Re: <subject>`, without stacking a second `Re:`. */
export function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

/**
 * Emails one OUTBOUND message to its ticket's customer. Only a `PENDING` message is sent, so a
 * retried job never sends twice once it is marked. It gets a Message-ID on our domain (saved
 * before sending, so a retry reuses it), and `In-Reply-To`/`References` to the earlier emails of
 * the thread, so the customer's mail client threads it and their reply finds the ticket again.
 * Marks the message `SENT`, or `FAILED` on a permanent provider error; throws on a temporary one.
 */
export async function sendMessageEmail(
  prisma: PrismaClient,
  send: EmailSender,
  messageId: string,
  { supportEmail, replyTo }: SendMessageOptions,
): Promise<SendOutcome> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      direction: true,
      fromName: true,
      bodyText: true,
      deliveryStatus: true,
      emailMessageId: true,
      createdAt: true,
      ticket: {
        select: {
          subject: true,
          customerEmail: true,
          customerName: true,
          messages: {
            where: { emailMessageId: { not: null } },
            select: { id: true, direction: true, emailMessageId: true, createdAt: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      },
    },
  });
  if (!message) return { result: 'skipped', reason: 'no such message' };
  if (message.direction !== MessageDirection.OUTBOUND) {
    return { result: 'skipped', reason: 'not an outbound message' };
  }
  if (message.deliveryStatus !== DeliveryStatus.PENDING) {
    return { result: 'skipped', reason: `delivery status is ${message.deliveryStatus ?? 'unset'}` };
  }

  let emailMessageId = message.emailMessageId;
  if (!emailMessageId) {
    const domain = supportEmail.slice(supportEmail.lastIndexOf('@') + 1);
    emailMessageId = `${randomUUID()}@${domain}`;
    await prisma.message.update({ where: { id: message.id }, data: { emailMessageId } });
  }

  const { ticket } = message;
  // Emails of the thread before this one (uuid v7 ids are time-ordered, breaking timestamp ties)
  const earlier = ticket.messages.filter(
    (m) =>
      m.id !== message.id &&
      (m.createdAt < message.createdAt ||
        (m.createdAt.getTime() === message.createdAt.getTime() && m.id < message.id)),
  );
  const references = earlier.map((m) => m.emailMessageId as string).slice(-MAX_REFERENCES);
  // Reply to the customer's latest email; fall back to the latest of any
  const parent =
    earlier.findLast((m) => m.direction === MessageDirection.INBOUND) ?? earlier.at(-1);

  try {
    await send({
      from: { email: supportEmail, name: message.fromName ?? undefined },
      replyTo,
      to: { email: ticket.customerEmail, name: ticket.customerName ?? undefined },
      subject: replySubject(ticket.subject),
      text: message.bodyText,
      headers: {
        'Message-ID': withBrackets(emailMessageId),
        ...(parent && { 'In-Reply-To': withBrackets(parent.emailMessageId as string) }),
        ...(references.length > 0 && { References: references.map(withBrackets).join(' ') }),
      },
    });
  } catch (err) {
    if (err instanceof EmailSendError && err.permanent) {
      await markFailed(prisma, message.id, err.message);
      return { result: 'failed', reason: err.message };
    }
    throw err;
  }

  await prisma.message.updateMany({
    where: { id: message.id, deliveryStatus: DeliveryStatus.PENDING },
    data: { deliveryStatus: DeliveryStatus.SENT, sentAt: new Date(), deliveryError: null },
  });
  return { result: 'sent' };
}

/** Gives up on a message that is still pending, keeping the error for debugging. */
export function markFailed(prisma: PrismaClient, messageId: string, error: string) {
  return prisma.message.updateMany({
    where: { id: messageId, deliveryStatus: DeliveryStatus.PENDING },
    data: { deliveryStatus: DeliveryStatus.FAILED, deliveryError: error.slice(0, 1000) },
  });
}

/**
 * Handles `send-email` jobs; register with `includeMetadata: true` (it needs `retryLimit`). A
 * temporary failure (SendGrid down or rate limiting, network error) throws, so pg-boss retries;
 * the last failed attempt marks the message `FAILED`, so the Agent sees it wasn't sent.
 */
export function sendEmailJobs(
  prisma: PrismaClient,
  send: EmailSender,
  options: SendMessageOptions,
) {
  return async (jobs: JobWithMetadata<SendEmailJob>[]) => {
    for (const job of jobs) {
      const { messageId } = job.data;
      let outcome;
      try {
        outcome = await sendMessageEmail(prisma, send, messageId, options);
      } catch (err) {
        const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
        const lastAttempt = job.retryCount >= job.retryLimit;
        console.error(
          `[send-email] message ${messageId} failed${lastAttempt ? ' for good' : ''}: ${reason}`,
        );
        if (lastAttempt) await markFailed(prisma, messageId, reason ?? 'Unknown error');
        throw err;
      }
      const reason = 'reason' in outcome ? ` (${outcome.reason})` : '';
      console.log(`[send-email] message ${messageId}: ${outcome.result}${reason}`);
      // Refused for good (e.g. unverified sender, invalid API key): no retry will throw, so report it
      // here; it often means every reply is failing until the setup is fixed
      if (outcome.result === 'failed') {
        captureError(new Error(`SendGrid refused message ${messageId}: ${outcome.reason}`), {
          queue: 'send-email',
        });
      }
    }
  };
}
