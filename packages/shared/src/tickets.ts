import { z } from 'zod';
import { ticketCategorySchema, ticketStatusSchema } from './domain';

/** A ticket row in the tickets list. */
export const ticketListItemSchema = z.object({
  id: z.string(),
  subject: z.string(),
  status: ticketStatusSchema,
  category: ticketCategorySchema.nullable(),
  customerEmail: z.string(),
  customerName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TicketListItem = z.infer<typeof ticketListItemSchema>;

export const ticketListResponseSchema = z.object({ tickets: z.array(ticketListItemSchema) });
export type TicketListResponse = z.infer<typeof ticketListResponseSchema>;

export const INBOUND_EMAIL_RESULTS = ['created', 'appended', 'duplicate', 'ignored'] as const;

/** What `POST /api/webhooks/inbound-email` did with the email. */
export const inboundEmailResponseSchema = z.object({
  result: z.enum(INBOUND_EMAIL_RESULTS),
  /** The ticket the email created or was added to (absent when ignored) */
  ticketId: z.string().optional(),
  /** Why an email was ignored, e.g. an auto-reply */
  reason: z.string().optional(),
});
export type InboundEmailResponse = z.infer<typeof inboundEmailResponseSchema>;
