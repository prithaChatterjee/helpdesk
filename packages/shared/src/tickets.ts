import { z } from 'zod';
import { messageDirectionSchema, ticketCategorySchema, ticketStatusSchema } from './domain';
import { pageInfoSchema, paginationQueryShape } from './pagination';
import { type Sort, sortQuerySchema } from './sorting';

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

/** One page of tickets, with the total across all pages. */
export const ticketListResponseSchema = pageInfoSchema.extend({
  tickets: z.array(ticketListItemSchema),
});
export type TicketListResponse = z.infer<typeof ticketListResponseSchema>;

/** One email in a ticket's thread. The body is plain text; the HTML version is not sent. */
export const ticketMessageSchema = z.object({
  id: z.string(),
  direction: messageDirectionSchema,
  fromEmail: z.string(),
  fromName: z.string().nullable(),
  bodyText: z.string(),
  createdAt: z.iso.datetime(),
});
export type TicketMessage = z.infer<typeof ticketMessageSchema>;

/** `GET /api/tickets/:id`: the ticket with its whole thread, oldest message first. */
export const ticketDetailResponseSchema = z.object({
  ticket: ticketListItemSchema.extend({
    summary: z.string().nullable(),
    messages: z.array(ticketMessageSchema),
  }),
});
export type TicketDetailResponse = z.infer<typeof ticketDetailResponseSchema>;
export type TicketDetail = TicketDetailResponse['ticket'];

/**
 * `PATCH /api/tickets/:id` body: a new status, category, or both. A category can be changed but
 * not cleared (only a ticket that was never classified has none).
 */
export const updateTicketSchema = z
  .strictObject({
    status: ticketStatusSchema.optional(),
    category: ticketCategorySchema.optional(),
  })
  .refine((changes) => changes.status !== undefined || changes.category !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

/** The ticket after `PATCH /api/tickets/:id`. */
export const updateTicketResponseSchema = z.object({ ticket: ticketListItemSchema });
export type UpdateTicketResponse = z.infer<typeof updateTicketResponseSchema>;

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

/** Columns the tickets list can be sorted by (`?sortBy=`). */
export const TICKET_SORT_FIELDS = [
  'subject',
  'customer',
  'status',
  'category',
  'createdAt',
  'updatedAt',
] as const;
export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];
/** Most recent activity first */
export const DEFAULT_TICKET_SORT: Sort<TicketSortField> = {
  sortBy: 'updatedAt',
  sortOrder: 'desc',
};
/** `GET /api/tickets` query string: sort and page. */
export const ticketListQuerySchema = sortQuerySchema(
  TICKET_SORT_FIELDS,
  DEFAULT_TICKET_SORT,
).extend(paginationQueryShape);
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;
