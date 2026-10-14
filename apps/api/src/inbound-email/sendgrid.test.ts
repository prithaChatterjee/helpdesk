import { inboundEmailSchema } from '@helpdesk/shared';
import { describe, expect, it } from 'vitest';
import {
  decodeEncodedWords,
  parseAddress,
  parseHeaderBlock,
  sendGridToInboundEmail,
} from './sendgrid';

describe('parseHeaderBlock', () => {
  it('lowercases header names and trims values', () => {
    expect(parseHeaderBlock('Message-ID: <a1@mail.test>\r\nSubject:  Help \r\n')).toEqual({
      'message-id': '<a1@mail.test>',
      subject: 'Help',
    });
  });

  it('joins folded continuation lines', () => {
    expect(
      parseHeaderBlock('References: <a@x.test>\n\t<b@x.test>\n  <c@x.test>\nTo: s@x.test'),
    ).toEqual({
      references: '<a@x.test> <b@x.test> <c@x.test>',
      to: 's@x.test',
    });
  });

  it('keeps the first value of a repeated header', () => {
    expect(parseHeaderBlock('Received: from a\nReceived: from b')).toEqual({ received: 'from a' });
  });

  it('skips lines without a header name', () => {
    expect(parseHeaderBlock(': no name\nnot a header\n\nX-Ok: yes')).toEqual({ 'x-ok': 'yes' });
  });

  it('does not let a header named __proto__ change the result', () => {
    const headers = parseHeaderBlock('__proto__: polluted\nX-Ok: yes');
    expect(Object.getPrototypeOf(headers)).toBe(Object.prototype);
    expect(headers['x-ok']).toBe('yes');
  });

  it('cuts very long values to what the schema accepts', () => {
    expect(parseHeaderBlock(`X-Long: ${'a'.repeat(20_000)}`)['x-long']).toHaveLength(10_000);
  });

  it('returns no headers for an empty block', () => {
    expect(parseHeaderBlock('')).toEqual({});
  });
});

describe('decodeEncodedWords', () => {
  it('decodes base64 words', () => {
    expect(decodeEncodedWords('=?UTF-8?B?SsO8cmdlbg==?= Smith')).toBe('Jürgen Smith');
  });

  it('decodes quoted-printable words, with underscores as spaces', () => {
    expect(decodeEncodedWords('=?iso-8859-1?Q?Ren=E9e_Dupont?=')).toBe('Renée Dupont');
  });

  it('drops the whitespace between adjacent encoded words', () => {
    expect(decodeEncodedWords('=?UTF-8?Q?J=C3=BCr?= =?UTF-8?Q?gen?=')).toBe('Jürgen');
  });

  it('falls back to UTF-8 for an unknown charset', () => {
    expect(decodeEncodedWords('=?x-unknown?Q?caf=C3=A9?=')).toBe('café');
  });

  it('leaves plain text alone', () => {
    expect(decodeEncodedWords('Jane Doe')).toBe('Jane Doe');
  });
});

describe('parseAddress', () => {
  it.each([
    ['Jane Doe <jane@customer.test>', { email: 'jane@customer.test', name: 'Jane Doe' }],
    ['"Doe, Jane" <jane@customer.test>', { email: 'jane@customer.test', name: 'Doe, Jane' }],
    [
      '"Jane \\"JD\\" Doe" <jane@customer.test>',
      { email: 'jane@customer.test', name: 'Jane "JD" Doe' },
    ],
    ['=?UTF-8?B?SsO8cmdlbg==?= <j@customer.test>', { email: 'j@customer.test', name: 'Jürgen' }],
    ['<jane@customer.test>', { email: 'jane@customer.test' }],
    ['jane@customer.test', { email: 'jane@customer.test' }],
    ['  jane@customer.test  ', { email: 'jane@customer.test' }],
  ])('parses %o', (value, expected) => {
    expect(parseAddress(value)).toEqual(expected);
  });
});

describe('sendGridToInboundEmail', () => {
  const headers = [
    'Message-ID: <a2@customer.test>',
    'From: Jane Doe <jane@customer.test>',
    'Subject: Re: Help',
    'In-Reply-To: <reply@acme.test> (sent by Alan)',
    'References: <a1@customer.test>',
    ' <reply@acme.test>',
  ].join('\r\n');

  it('maps the parsed fields and headers to an inbound email', () => {
    const email = sendGridToInboundEmail({
      headers,
      from: 'Jane Doe <jane@customer.test>',
      subject: 'Re: Help',
      text: 'Still broken',
      html: '<p>Still broken</p>',
    });

    expect(inboundEmailSchema.parse(email)).toEqual({
      messageId: 'a2@customer.test',
      from: { email: 'jane@customer.test', name: 'Jane Doe' },
      subject: 'Re: Help',
      text: 'Still broken',
      html: '<p>Still broken</p>',
      inReplyTo: 'reply@acme.test',
      references: ['a1@customer.test', 'reply@acme.test'],
      headers: expect.objectContaining({ 'message-id': '<a2@customer.test>' }),
    });
  });

  it('falls back to the From and Subject headers', () => {
    const email = sendGridToInboundEmail({
      headers: 'Message-ID: <a@x.test>\nFrom: jane@customer.test\nSubject: =?UTF-8?Q?Caf=C3=A9?=',
    });

    expect(email.from).toEqual({ email: 'jane@customer.test' });
    expect(email.subject).toBe('Café');
  });

  it('derives a stable Message-ID when the header is missing', () => {
    const fields = { headers: 'From: jane@customer.test', from: 'jane@customer.test', text: 'Hi' };

    const first = sendGridToInboundEmail(fields).messageId;

    expect(first).toMatch(/^[0-9a-f]{64}@sendgrid-inbound\.invalid$/);
    expect(sendGridToInboundEmail(fields).messageId).toBe(first);
    expect(sendGridToInboundEmail({ ...fields, text: 'Other' }).messageId).not.toBe(first);
  });

  it('cuts an overlong text and subject to the schema limits', () => {
    const email = sendGridToInboundEmail({
      headers: 'Message-ID: <a@x.test>',
      from: 'jane@customer.test',
      subject: 's'.repeat(2_000),
      text: 't'.repeat(1_500_000),
    });

    expect(email.subject).toHaveLength(998);
    expect(email.text).toHaveLength(1_000_000);
    expect(inboundEmailSchema.safeParse(email).success).toBe(true);
  });

  it('drops HTML over the schema limit instead of cutting the markup', () => {
    const email = sendGridToInboundEmail({
      headers: 'Message-ID: <a@x.test>',
      from: 'jane@customer.test',
      html: 'h'.repeat(5_000_001),
    });

    expect(email).not.toHaveProperty('html');
  });

  it('leaves a sender that is not an address for the schema to reject', () => {
    const email = sendGridToInboundEmail({ headers: 'Message-ID: <a@x.test>' });

    expect(inboundEmailSchema.safeParse(email).success).toBe(false);
  });
});
