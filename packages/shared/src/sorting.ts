import { z } from 'zod';

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

/** `?sortBy=…&sortOrder=…` for an API path. */
export function sortSearchParams(sort: Sort<string>): string {
  return new URLSearchParams({ sortBy: sort.sortBy, sortOrder: sort.sortOrder }).toString();
}
