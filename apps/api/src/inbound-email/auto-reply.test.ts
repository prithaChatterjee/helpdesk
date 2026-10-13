import { type InboundEmailInput, inboundEmailSchema } from '@helpdesk/shared';
import { describe, expect, it } from 'vitest';
import { detectAutoReply } from './auto-reply';

function email(overrides: Partial<InboundEmailInput> = {}) {
  return inboundEmailSchema.parse({
    messageId: 'a1@customer.test',
    from: { email: 'jane@customer.test' },
    subject: "Can't log in",
    text: 'Help',
    ...overrides,
  });
}

describe('detectAutoReply', () => {
  it('returns null for a normal email', () => {
    expect(detectAutoReply(email())).toBeNull();
  });

  it('flags Auto-Submitted: auto-replied', () => {
    expect(detectAutoReply(email({ headers: { 'Auto-Submitted': 'auto-replied' } }))).toBe(
      'Auto-Submitted: auto-replied',
    );
  });

  it('allows Auto-Submitted: no', () => {
    expect(detectAutoReply(email({ headers: { 'Auto-Submitted': 'No' } }))).toBeNull();
  });

  it('flags an X-Autoreply header', () => {
    expect(detectAutoReply(email({ headers: { 'X-Autoreply': 'yes' } }))).toBe(
      'X-Autoreply header',
    );
  });

  it('flags bulk precedence', () => {
    expect(detectAutoReply(email({ headers: { Precedence: 'bulk' } }))).toBe('Precedence: bulk');
  });

  it('allows other precedence values', () => {
    expect(detectAutoReply(email({ headers: { Precedence: 'first-class' } }))).toBeNull();
  });

  it('flags bounces from the mailer daemon', () => {
    expect(detectAutoReply(email({ from: { email: 'MAILER-DAEMON@mail.test' } }))).toBe(
      'System sender mailer-daemon@mail.test',
    );
  });

  it.each([
    'Out of Office: back Monday',
    "Automatic reply: Can't log in",
    'Auto-Reply: thanks',
    'Undeliverable: Your message',
    'Delivery Status Notification (Failure)',
    'Mail delivery failed: returning message to sender',
  ])('flags the subject "%s"', (subject) => {
    expect(detectAutoReply(email({ subject }))).toBe('Auto-reply subject');
  });

  it('allows a subject that mentions auto-replies later on', () => {
    expect(detectAutoReply(email({ subject: 'Question about automatic reply settings' }))).toBe(
      null,
    );
  });
});
