import { z } from 'zod';

/** Strips the angle brackets around an RFC 5322 Message-ID, e.g. `<a1@mail.test>` → `a1@mail.test`. */
export function normalizeMessageId(id: string): string {
  return id.trim().replace(/^<+|>+$/g, '');
}

// RFC 5322 caps a header line at 998 characters
const messageIdSchema = z
  .string()
  .max(998)
  .transform(normalizeMessageId)
  .pipe(z.string().min(1, 'Message-ID is required'));

// `References` arrives either as the raw header (space-separated ids) or already split
const referencesSchema = z
  .union([z.string().max(100_000), z.array(z.string().max(998)).max(500)])
  .default([])
  .transform((value) =>
    (typeof value === 'string' ? value.split(/\s+/) : value)
      .map(normalizeMessageId)
      .filter((id) => id !== ''),
  );

// Header names are case-insensitive, so they are lowercased for lookups
const headersSchema = z
  .record(z.string().max(200), z.string().max(10_000))
  .default({})
  .transform((headers) =>
    Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])),
  );

/**
 * An email received at the support address, as posted to `POST /api/webhooks/inbound-email`.
 * Provider-neutral: an email provider's inbound webhook gets mapped to this shape.
 */
export const inboundEmailSchema = z.object({
  messageId: messageIdSchema,
  from: z.object({
    email: z.string().trim().toLowerCase().pipe(z.email('Invalid sender email address')),
    name: z.string().trim().max(200).optional(),
  }),
  subject: z.string().max(998).default(''),
  text: z.string().max(1_000_000).default(''),
  html: z.string().max(5_000_000).optional(),
  inReplyTo: messageIdSchema.optional(),
  references: referencesSchema,
  headers: headersSchema,
});
export type InboundEmail = z.infer<typeof inboundEmailSchema>;
/** The JSON body before parsing, e.g. for building test payloads. */
export type InboundEmailInput = z.input<typeof inboundEmailSchema>;
