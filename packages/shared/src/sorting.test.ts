import { describe, expect, it } from 'vitest';
import { listQueryString, sortQuerySchema, sortSearchParams } from './sorting';
import { ticketListQuerySchema } from './tickets';
import { userListQuerySchema } from './users';

const schema = sortQuerySchema(['name', 'createdAt'], { sortBy: 'createdAt', sortOrder: 'desc' });

describe('sortQuerySchema', () => {
  it('parses a field and direction', () => {
    expect(schema.parse({ sortBy: 'name', sortOrder: 'asc' })).toEqual({
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  it('falls back to the default sort when the params are missing', () => {
    expect(schema.parse({})).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('keeps the default direction when only the field is given', () => {
    expect(schema.parse({ sortBy: 'name' })).toEqual({ sortBy: 'name', sortOrder: 'desc' });
  });

  it('rejects a field that is not sortable', () => {
    expect(schema.safeParse({ sortBy: 'passwordHash' }).success).toBe(false);
  });

  it('rejects an unknown direction', () => {
    expect(schema.safeParse({ sortOrder: 'DESC' }).success).toBe(false);
  });

  it('rejects a repeated param', () => {
    expect(schema.safeParse({ sortBy: ['name', 'createdAt'] }).success).toBe(false);
  });
});

describe('sortSearchParams', () => {
  it('builds the query string', () => {
    expect(sortSearchParams({ sortBy: 'createdAt', sortOrder: 'asc' })).toBe(
      'sortBy=createdAt&sortOrder=asc',
    );
  });
});

describe('listQueryString', () => {
  it('sends the sort and the page', () => {
    expect(
      listQueryString({
        sort: { sortBy: 'subject', sortOrder: 'desc' },
        page: { page: 2, pageSize: 50 },
      }),
    ).toBe('?sortBy=subject&sortOrder=desc&page=2&pageSize=50');
  });

  it('leaves out the sort when there is none', () => {
    expect(listQueryString({ page: { page: 1, pageSize: 25 } })).toBe('?page=1&pageSize=25');
  });

  it('is empty with neither sort nor page', () => {
    expect(listQueryString({})).toBe('');
  });

  it('sends the filters first, leaving out empty ones', () => {
    expect(
      listQueryString({
        filters: { status: 'OPEN', category: undefined, search: '' },
        page: { page: 1, pageSize: 25 },
      }),
    ).toBe('?status=OPEN&page=1&pageSize=25');
  });

  it('encodes search text', () => {
    expect(listQueryString({ filters: { search: 'a&b 100%' } })).toBe('?search=a%26b+100%25');
  });
});

describe('list query defaults', () => {
  it('sorts tickets by most recent activity', () => {
    expect(ticketListQuerySchema.parse({})).toMatchObject({
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
  });

  it('sorts users oldest first', () => {
    expect(userListQuerySchema.parse({})).toEqual({ sortBy: 'createdAt', sortOrder: 'asc' });
  });
});
