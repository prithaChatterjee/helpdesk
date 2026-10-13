import type { InboundEmail } from '@helpdesk/shared';

const BULK_PRECEDENCE = new Set(['bulk', 'junk', 'list', 'auto_reply']);
const SYSTEM_SENDERS = /^(mailer-daemon|postmaster)@/;
const AUTO_REPLY_SUBJECTS =
  /^\s*(out of (the )?office|automatic reply|auto(matic)?[- ]?(reply|response)|undeliverable|undelivered mail|delivery status notification|mail delivery (failed|failure)|returned mail)\b/i;

/**
 * Why an email looks automated (auto-reply, bounce, bulk mail), or `null` for a normal email.
 * Automated emails must not create tickets: answering them could start a mail loop.
 */
export function detectAutoReply(email: InboundEmail): string | null {
  const { headers } = email;
  const autoSubmitted = headers['auto-submitted']?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return `Auto-Submitted: ${autoSubmitted}`;
  if (headers['x-autoreply'] !== undefined || headers['x-autorespond'] !== undefined) {
    return 'X-Autoreply header';
  }
  const precedence = headers['precedence']?.trim().toLowerCase();
  if (precedence && BULK_PRECEDENCE.has(precedence)) return `Precedence: ${precedence}`;
  if (SYSTEM_SENDERS.test(email.from.email)) return `System sender ${email.from.email}`;
  if (AUTO_REPLY_SUBJECTS.test(email.subject)) return 'Auto-reply subject';
  return null;
}
