import { z } from 'zod';
import {
  messageDirectionSchema,
  type TicketCategory,
  ticketCategorySchema,
  type TicketStatus,
  ticketStatusSchema,
} from './domain';
import { pageInfoSchema, paginationQueryShape } from './pagination';
import { type Sort, sortQuerySchema } from './sorting';

/** A user a ticket can be assigned to: an active Admin or Agent. */
export const ticketAssigneeSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type TicketAssignee = z.infer<typeof ticketAssigneeSchema>;

/** `GET /api/assignees`: everyone a ticket can be assigned to, by name. */
export const assigneeListResponseSchema = z.object({ assignees: z.array(ticketAssigneeSchema) });
export type AssigneeListResponse = z.infer<typeof assigneeListResponseSchema>;

/** A ticket row in the tickets list. */
export const ticketListItemSchema = z.object({
  id: z.string(),
  subject: z.string(),
  status: ticketStatusSchema,
  category: ticketCategorySchema.nullable(),
  customerEmail: z.string(),
  customerName: z.string().nullable(),
  /** Who is working on the ticket; `null` while unassigned */
  assignee: ticketAssigneeSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TicketListItem = z.infer<typeof ticketListItemSchema>;

/** A row of the tickets list: the ticket and how many messages followed the first email. */
export const ticketListRowSchema = ticketListItemSchema.extend({
  replyCount: z.number().int().nonnegative(),
});
export type TicketListRow = z.infer<typeof ticketListRowSchema>;

/** One page of tickets, with the total across all pages. */
export const ticketListResponseSchema = pageInfoSchema.extend({
  tickets: z.array(ticketListRowSchema),
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
 * `PATCH /api/tickets/:id` body: a new status, category and/or assignee. A category can be changed
 * but not cleared (only a ticket that was never classified has none); `assigneeId: null` unassigns.
 */
export const updateTicketSchema = z
  .strictObject({
    status: ticketStatusSchema.optional(),
    category: ticketCategorySchema.optional(),
    assigneeId: z.uuid({ error: 'Unknown assignee' }).nullable().optional(),
  })
  .refine(
    (changes) =>
      changes.status !== undefined ||
      changes.category !== undefined ||
      changes.assigneeId !== undefined,
    { message: 'Nothing to update' },
  );
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

/** The ticket after `PATCH /api/tickets/:id`. */
export const updateTicketResponseSchema = z.object({ ticket: ticketListItemSchema });
export type UpdateTicketResponse = z.infer<typeof updateTicketResponseSchema>;

/** Longest reply an Agent can write, in characters */
export const REPLY_MAX_LENGTH = 20_000;

/** `POST /api/tickets/:id/replies` body: an Agent's reply, as plain text. */
export const createReplySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a reply')
    .max(
      REPLY_MAX_LENGTH,
      `Keep the reply under ${REPLY_MAX_LENGTH.toLocaleString('en')} characters`,
    ),
});
export type CreateReplyInput = z.infer<typeof createReplySchema>;

/** The saved reply, as it appears in the ticket's thread. */
export const createReplyResponseSchema = z.object({ message: ticketMessageSchema });
export type CreateReplyResponse = z.infer<typeof createReplyResponseSchema>;

/** `POST /api/tickets/:id/replies/polish` body: the Agent's draft, same rules as a reply. */
export const polishReplySchema = createReplySchema;
export type PolishReplyInput = CreateReplyInput;

/** The draft rewritten by AI, for the Agent to review before saving. */
export const polishReplyResponseSchema = z.object({ body: z.string() });
export type PolishReplyResponse = z.infer<typeof polishReplyResponseSchema>;

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
/** Longest text the tickets list can be searched for, in characters */
export const TICKET_SEARCH_MAX_LENGTH = 200;

/** Which tickets the list shows. Every filter is optional; together they must all match. */
/** `?assignee=` values: the signed-in user's tickets, or tickets nobody is assigned to. */
export const TICKET_ASSIGNEE_FILTERS = ['me', 'unassigned'] as const;
export type TicketAssigneeFilter = (typeof TICKET_ASSIGNEE_FILTERS)[number];

// A type, not an interface, so it fits `listQueryString`'s `filters` record
export type TicketFilters = {
  status?: TicketStatus;
  category?: TicketCategory;
  assignee?: TicketAssigneeFilter;
  /** Part of the subject, customer email or customer name, any case */
  search?: string;
};

/** Whether any filter is set. */
export function hasTicketFilters({ status, category, assignee, search }: TicketFilters) {
  return Boolean(status || category || assignee || search);
}

/** Query-string fields that filter the tickets list (`?status=&category=&assignee=&search=`). */
export const ticketFilterQueryShape = {
  status: ticketStatusSchema.optional(),
  category: ticketCategorySchema.optional(),
  assignee: z.enum(TICKET_ASSIGNEE_FILTERS).optional(),
  search: z
    .string({ error: 'Search must be text' })
    .trim()
    .max(TICKET_SEARCH_MAX_LENGTH, `Keep the search under ${TICKET_SEARCH_MAX_LENGTH} characters`)
    // Blank means no search
    .transform((search) => search || undefined)
    .optional(),
};

/** `GET /api/tickets` query string: filters, sort and page. */
export const ticketListQuerySchema = sortQuerySchema(TICKET_SORT_FIELDS, DEFAULT_TICKET_SORT)
  .extend(ticketFilterQueryShape)
  .extend(paginationQueryShape);
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;
