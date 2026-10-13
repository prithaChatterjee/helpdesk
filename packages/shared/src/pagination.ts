import { z } from 'zod';

/** Page sizes the API accepts, offered in the "Rows per page" picker. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

/** A list's page: 1-based page number and rows per page. Sent as `?page=…&pageSize=…`. */
export interface Page {
  page: number;
  pageSize: PageSize;
}

export const FIRST_PAGE: Page = { page: 1, pageSize: DEFAULT_PAGE_SIZE };

const PAGE_SIZE_MESSAGE = `Page size must be one of ${PAGE_SIZES.join(', ')}`;

/** Query-string fields for a paginated list. Missing params mean the first page of 25. */
export const paginationQueryShape = {
  page: z.coerce
    .number({ error: 'Page must be a whole number' })
    .int('Page must be a whole number')
    .min(1, 'Page must be at least 1')
    // Keeps `skip` (page × size) far from overflowing what Postgres accepts
    .max(100_000, 'Page is too large')
    .default(1),
  pageSize: z.coerce
    .number({ error: PAGE_SIZE_MESSAGE })
    .refine((size): size is PageSize => (PAGE_SIZES as readonly number[]).includes(size), {
      message: PAGE_SIZE_MESSAGE,
    })
    .default(DEFAULT_PAGE_SIZE),
};

/** `page=…&pageSize=…` for an API path. */
export function pageSearchParams(page: Page): string {
  return new URLSearchParams({
    page: String(page.page),
    pageSize: String(page.pageSize),
  }).toString();
}

/** The page fields every paginated list response carries next to its rows. */
export const pageInfoSchema = z.object({
  /** Rows on all pages together */
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type PageInfo = z.infer<typeof pageInfoSchema>;
