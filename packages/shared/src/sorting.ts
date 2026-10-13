import { z } from 'zod';
import type { Page } from './pagination';

export const SORT_ORDERS = ['asc', 'desc'] as const;
export const sortOrderSchema = z.enum(SORT_ORDERS);
export type SortOrder = z.infer<typeof sortOrderSchema>;

/** A list's sort: which field, which direction. Sent as `?sortBy=…&sortOrder=…`. */
export interface Sort<TField extends string> {
  sortBy: TField;
  sortOrder: SortOrder;
}

/**
 * Query-string schema for a sortable list. Unknown fields are rejected (the API maps each field
 * to a column, so nothing user-supplied reaches `orderBy`); missing params fall back to `fallback`.
 */
export function sortQuerySchema<const TFields extends readonly [string, ...string[]]>(
  fields: TFields,
  fallback: Sort<TFields[number]>,
) {
  return z.object({
    sortBy: z.enum(fields).default(fallback.sortBy),
    sortOrder: sortOrderSchema.default(fallback.sortOrder),
  });
}

/** `sortBy=…&sortOrder=…` for an API path. */
export function sortSearchParams(sort: Sort<string>): string {
  return new URLSearchParams({ sortBy: sort.sortBy, sortOrder: sort.sortOrder }).toString();
}

/**
 * The query string for a list request, with the leading `?`, or `''` when there is nothing to send.
 * Without a sort the API uses the list's default order.
 */
export function listQueryString({ sort, page }: { sort?: Sort<string>; page?: Page }): string {
  const params = new URLSearchParams();
  if (sort) {
    params.set('sortBy', sort.sortBy);
    params.set('sortOrder', sort.sortOrder);
  }
  if (page) {
    params.set('page', String(page.page));
    params.set('pageSize', String(page.pageSize));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
