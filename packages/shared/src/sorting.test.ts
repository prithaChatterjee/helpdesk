import { describe, expect, it } from 'vitest';
import { sortQuerySchema, sortSearchParams } from './sorting';
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
