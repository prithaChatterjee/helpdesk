import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { pageSearchParams, paginationQueryShape } from './pagination';
import { ticketListQuerySchema } from './tickets';

const schema = z.object(paginationQueryShape);

describe('paginationQueryShape', () => {
  it('parses page and page size from query-string values', () => {
    expect(schema.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
  });

  it('defaults to the first page of 25', () => {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });

  it.each(['0', '-1', '1.5', 'abc', '100001'])('rejects the page %s', (page) => {
    expect(schema.safeParse({ page }).success).toBe(false);
  });

  it.each(['10', '25', '50', '100'])('accepts the page size %s', (pageSize) => {
    expect(schema.safeParse({ pageSize }).success).toBe(true);
  });

  it.each(['0', '7', '1000', 'all'])('rejects the page size %s', (pageSize) => {
    expect(schema.safeParse({ pageSize }).error?.issues[0]?.message).toBe(
      'Page size must be one of 10, 25, 50, 100',
    );
  });
});

describe('pageSearchParams', () => {
  it('builds the query string', () => {
    expect(pageSearchParams({ page: 2, pageSize: 10 })).toBe('page=2&pageSize=10');
  });
});

describe('ticketListQuerySchema', () => {
  it('combines the default sort with the first page', () => {
    expect(ticketListQuerySchema.parse({})).toEqual({
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      page: 1,
      pageSize: 25,
    });
  });
});
