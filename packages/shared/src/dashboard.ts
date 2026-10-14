import { z } from 'zod';
import { ticketCategorySchema, ticketStatusSchema } from './domain';

const count = z.number().int().nonnegative();

/** `GET /api/dashboard/stats`: ticket counts across all time. */
export const dashboardStatsResponseSchema = z.object({
  total: count,
  open: count,
  resolved: count,
  /** Resolved tickets whose only replies are the AI's (auto-resolved, no Agent reply) */
  resolvedByAi: count,
  /** Every status, in `TICKET_STATUSES` order, including those with no tickets */
  byStatus: z.array(z.object({ status: ticketStatusSchema, count })),
  /** Every category in `TICKET_CATEGORIES` order, then `null` for tickets not classified yet */
  byCategory: z.array(z.object({ category: ticketCategorySchema.nullable(), count })),
});
export type DashboardStatsResponse = z.infer<typeof dashboardStatsResponseSchema>;

/** `part` as a whole-number percentage of `whole`; 0 when `whole` is 0. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
