import { z } from 'zod';

export const USER_ROLES = ['ADMIN', 'AGENT'] as const;
export const userRoleSchema = z.enum(USER_ROLES);
/** Enum-like access to the roles, e.g. `UserRole.AGENT` (TS `enum` is off: `erasableSyntaxOnly`). */
export const UserRole = userRoleSchema.enum;
export type UserRole = z.infer<typeof userRoleSchema>;

export const TICKET_STATUSES = ['OPEN', 'RESOLVED', 'CLOSED'] as const;
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const TICKET_CATEGORIES = ['GENERAL', 'TECHNICAL', 'REFUND'] as const;
export const ticketCategorySchema = z.enum(TICKET_CATEGORIES);
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  GENERAL: 'General question',
  TECHNICAL: 'Technical question',
  REFUND: 'Refund request',
};
