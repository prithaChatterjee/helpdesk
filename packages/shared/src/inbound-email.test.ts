import { describe, expect, it } from 'vitest';
import { type InboundEmailInput, inboundEmailSchema, normalizeMessageId } from './inbound-email';

const validEmail: InboundEmailInput = {
  messageId: '<a1@customer.test>',
  from: { email: 'Jane@Customer.test', name: ' Jane Doe ' },
  subject: "Can't log in",
  text: 'Help please',
};

describe('normalizeMessageId', () => {
  it('strips angle brackets and whitespace', () => {
    expect(normalizeMessageId(' <a1@customer.test> ')).toBe('a1@customer.test');
  });

  it('keeps an id without brackets as is', () => {
    expect(normalizeMessageId('a1@customer.test')).toBe('a1@customer.test');
  });
});

describe('inboundEmailSchema', () => {
  it('parses a minimal email and fills defaults', () => {
    expect(
      inboundEmailSchema.parse({ messageId: 'a1@x.test', from: { email: 'a@x.test' } }),
    ).toEqual({
      messageId: 'a1@x.test',
      from: { email: 'a@x.test' },
      subject: '',
      text: '',
      references: [],
      headers: {},
    });
  });

  it('normalizes the message id and lowercases the sender email', () => {
    const email = inboundEmailSchema.parse(validEmail);
    expect(email.messageId).toBe('a1@customer.test');
    expect(email.from).toEqual({ email: 'jane@customer.test', name: 'Jane Doe' });
  });

  it('rejects a missing message id', () => {
    expect(inboundEmailSchema.safeParse({ ...validEmail, messageId: undefined }).success).toBe(
      false,
    );
  });

  it('rejects a message id that is only brackets', () => {
    expect(inboundEmailSchema.safeParse({ ...validEmail, messageId: '<>' }).success).toBe(false);
  });

  it('rejects an invalid sender email', () => {
    const result = inboundEmailSchema.safeParse({ ...validEmail, from: { email: 'not-an-email' } });
    expect(result.error?.issues[0]?.message).toBe('Invalid sender email address');
  });

  it('normalizes In-Reply-To', () => {
    const email = inboundEmailSchema.parse({ ...validEmail, inReplyTo: '<r1@support.test>' });
    expect(email.inReplyTo).toBe('r1@support.test');
  });

  it('splits a raw References header into ids', () => {
    const email = inboundEmailSchema.parse({
      ...validEmail,
      references: ' <r1@support.test>\n <r2@support.test> ',
    });
    expect(email.references).toEqual(['r1@support.test', 'r2@support.test']);
  });

  it('normalizes a References array and drops blank entries', () => {
    const email = inboundEmailSchema.parse({
      ...validEmail,
      references: ['<r1@support.test>', ' '],
    });
    expect(email.references).toEqual(['r1@support.test']);
  });

  it('lowercases header names', () => {
    const email = inboundEmailSchema.parse({
      ...validEmail,
      headers: { 'Auto-Submitted': 'auto-replied' },
    });
    expect(email.headers).toEqual({ 'auto-submitted': 'auto-replied' });
  });

  it('rejects a non-string header value', () => {
    expect(inboundEmailSchema.safeParse({ ...validEmail, headers: { a: 1 } }).success).toBe(false);
  });
});
