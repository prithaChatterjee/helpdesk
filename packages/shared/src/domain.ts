import { z } from 'zod';

export const USER_ROLES = ['ADMIN', 'AGENT'] as const;
export const userRoleSchema = z.enum(USER_ROLES);
/** Enum-like access to the roles, e.g. `UserRole.AGENT` (TS `enum` is off: `erasableSyntaxOnly`). */
export const UserRole = userRoleSchema.enum;
export type UserRole = z.infer<typeof userRoleSchema>;

/** The keys of a label map as a non-empty tuple, typed for `z.enum`. */
function keysOf<T extends Record<string, string>>(labels: T) {
  return Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]];
}

// The label maps are the single source of truth: their keys are the statuses and categories,
// so adding one is a single new entry here, and the type, list and schema follow.

/** Display label per ticket status. */
export const TICKET_STATUS_LABELS = {
  OPEN: 'Open',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
} as const;
/** `'OPEN' | 'RESOLVED' | 'CLOSED'` */
export type TicketStatus = keyof typeof TICKET_STATUS_LABELS;
/** `'Open' | 'Resolved' | 'Closed'` */
export type TicketStatusLabel = (typeof TICKET_STATUS_LABELS)[TicketStatus];
export const TICKET_STATUSES = keysOf(TICKET_STATUS_LABELS);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
/** Enum-like access to the statuses, e.g. `TicketStatus.OPEN`. */
export const TicketStatus = ticketStatusSchema.enum;

/** Display label per ticket category. */
export const TICKET_CATEGORY_LABELS = {
  GENERAL: 'General question',
  TECHNICAL: 'Technical question',
  REFUND: 'Refund request',
} as const;
/** `'GENERAL' | 'TECHNICAL' | 'REFUND'` */
export type TicketCategory = keyof typeof TICKET_CATEGORY_LABELS;
/** `'General question' | 'Technical question' | 'Refund request'` */
export type TicketCategoryLabel = (typeof TICKET_CATEGORY_LABELS)[TicketCategory];
export const TICKET_CATEGORIES = keysOf(TICKET_CATEGORY_LABELS);
export const ticketCategorySchema = z.enum(TICKET_CATEGORIES);
/** Enum-like access to the categories, e.g. `TicketCategory.REFUND`. */
export const TicketCategory = ticketCategorySchema.enum;

export const MESSAGE_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export const messageDirectionSchema = z.enum(MESSAGE_DIRECTIONS);
export const MessageDirection = messageDirectionSchema.enum;
export type MessageDirection = z.infer<typeof messageDirectionSchema>;
