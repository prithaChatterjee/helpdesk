import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { InboundEmailInput } from '@helpdesk/shared';
import busboy from 'busboy';

// The form fields the adapter reads; the rest (to, cc, envelope, dkim, SPF, spam_*, attachment-info…)
// and the attachments themselves are skipped
const FIELDS = ['headers', 'from', 'subject', 'text', 'html', 'charsets'] as const;
type Field = (typeof FIELDS)[number];
export type SendGridFields = Partial<Record<Field, string>>;

// SendGrid parses emails of up to 20 MB (attachments included); the text parts are far smaller
const FIELD_SIZE_LIMIT = 10 * 1024 * 1024;
// Same caps as inboundEmailSchema, so a long email is cut rather than rejected
const MAX_SUBJECT = 998;
const MAX_TEXT = 1_000_000;
const MAX_HTML = 5_000_000;
const MAX_HEADER_NAME = 200;
const MAX_HEADER_VALUE = 10_000;

/** An error the app's error handler sends to the client as is (like body-parser's). */
function clientError(message: string) {
  return Object.assign(new Error(message), { status: 400, expose: true });
}

/**
 * Reads the text fields of a SendGrid Inbound Parse POST (multipart/form-data). Each field is
 * decoded with the charset SendGrid lists for it in the `charsets` field (UTF-8 when not listed).
 * Attachments are read and discarded.
 */
export function readSendGridFields(req: IncomingMessage): Promise<SendGridFields> {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      // latin1 maps bytes to characters 1:1, so each field's raw bytes can be decoded below
      parser = busboy({
        headers: req.headers,
        defCharset: 'latin1',
        limits: { fieldSize: FIELD_SIZE_LIMIT },
      });
    } catch {
      reject(clientError('Expected a multipart/form-data body'));
      return;
    }

    const raw = new Map<Field, string>();
    parser.on('field', (name, value) => {
      if ((FIELDS as readonly string[]).includes(name) && !raw.has(name as Field)) {
        raw.set(name as Field, value);
      }
    });
    // Unread file streams would stall the parser
    parser.on('file', (_name, file) => file.resume());
    parser.on('error', () => reject(clientError('Malformed multipart/form-data body')));
    parser.on('close', () => resolve(decodeFields(raw)));
    req.pipe(parser);
  });
}

function decodeFields(raw: Map<Field, string>): SendGridFields {
  let charsets: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw.get('charsets') ?? '{}');
    if (parsed && typeof parsed === 'object') charsets = parsed as Record<string, unknown>;
  } catch {
    // No (valid) charsets field: everything is read as UTF-8
  }
  const fields: SendGridFields = {};
  for (const [name, value] of raw) {
    const charset = charsets[name];
    fields[name] = decode(Buffer.from(value, 'latin1'), typeof charset === 'string' ? charset : '');
  }
  return fields;
}

function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    // Unknown charset label
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Decodes RFC 2047 encoded words in a header value, e.g. `=?UTF-8?B?SsO8cmdlbg==?=` → `Jürgen`.
 * Whitespace between two encoded words is dropped, as the RFC says.
 */
export function decodeEncodedWords(value: string): string {
  return value
    .replace(/(=\?[^?\s]+\?[bq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[bq]\?[^?\s]*\?=)/gi, '$1')
    .replace(
      /=\?([^?\s]+)\?([bq])\?([^?\s]*)\?=/gi,
      (word, charset: string, encoding: string, text: string) => {
        // RFC 2231 allows a language after the charset, e.g. `UTF-8*en`
        const label = charset.split('*')[0] ?? '';
        if (encoding.toLowerCase() === 'b') return decode(Buffer.from(text, 'base64'), label);
        const bytes = Buffer.from(
          text
            .replace(/_/g, ' ')
            .replace(/=([0-9a-f]{2})/gi, (_match, hex: string) =>
              String.fromCharCode(parseInt(hex, 16)),
            ),
          'latin1',
        );
        return decode(bytes, label) || word;
      },
    );
}

/**
 * Splits a raw header block into lowercase names and values. Folded (continuation) lines are
 * joined; a repeated header such as `Received` keeps its first value.
 */
export function parseHeaderBlock(raw: string): Record<string, string> {
  const headers = new Map<string, string>();
  for (const line of raw.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    if (!name || name.length > MAX_HEADER_NAME || headers.has(name)) continue;
    headers.set(
      name,
      line
        .slice(colon + 1)
        .trim()
        .slice(0, MAX_HEADER_VALUE),
    );
  }
  return Object.fromEntries(headers);
}

/** Splits `"Doe, Jane" <jane@example.com>` (or a bare address) into address and display name. */
export function parseAddress(value: string): { email: string; name?: string } {
  const match = /^(.*)<([^<>]+)>\s*$/s.exec(value.trim());
  if (!match) return { email: value.trim() };
  const name = decodeEncodedWords(match[1] ?? '')
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .replace(/\\(.)/g, '$1')
    .trim();
  return { email: (match[2] ?? '').trim(), ...(name && { name }) };
}

/** The `<id>` in an In-Reply-To value, which may carry comments or more ids after it. */
function firstMessageId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /<[^<>]+>/.exec(value)?.[0] ?? value;
}

/**
 * Maps a SendGrid Inbound Parse post to the provider-neutral `InboundEmail` body that
 * `inboundEmailSchema` validates. Without a Message-ID header, an id is derived from the headers
 * and body, so SendGrid's redeliveries of the same email are still recognised as duplicates.
 */
export function sendGridToInboundEmail(fields: SendGridFields): InboundEmailInput {
  const headers = parseHeaderBlock(fields.headers ?? '');
  const text = fields.text ?? '';
  const messageId =
    headers['message-id'] ||
    `${createHash('sha256')
      .update(`${fields.headers ?? ''}\n${text}`)
      .digest('hex')}@sendgrid-inbound.invalid`;
  const html = fields.html;

  return {
    messageId,
    from: parseAddress(fields.from || headers.from || ''),
    subject: (fields.subject ?? decodeEncodedWords(headers.subject ?? '')).slice(0, MAX_SUBJECT),
    text: text.slice(0, MAX_TEXT),
    // HTML is only a fallback for an empty text part; cutting it could leave broken markup
    ...(html && html.length <= MAX_HTML && { html }),
    inReplyTo: firstMessageId(headers['in-reply-to']),
    references: headers.references ?? '',
    headers,
  };
}
