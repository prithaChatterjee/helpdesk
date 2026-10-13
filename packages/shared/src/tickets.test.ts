import { describe, expect, it } from 'vitest';
import {
  createReplySchema,
  hasTicketFilters,
  REPLY_MAX_LENGTH,
  TICKET_SEARCH_MAX_LENGTH,
  ticketListQuerySchema,
  updateTicketSchema,
} from './tickets';

/** The error messages for `input`, or [] when it is valid. */
function errorsFor(input: unknown) {
  const result = updateTicketSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('updateTicketSchema', () => {
  const assigneeId = '0199a000-0000-7000-8000-000000000002';

  it('accepts an assignee alone', () => {
    expect(updateTicketSchema.parse({ assigneeId })).toEqual({ assigneeId });
  });

  it('accepts a null assignee, to unassign', () => {
    expect(updateTicketSchema.parse({ assigneeId: null })).toEqual({ assigneeId: null });
  });

  it('rejects an assignee that is not a uuid', () => {
    expect(errorsFor({ assigneeId: 'sam' })).toEqual(['Unknown assignee']);
  });

  it('accepts a status alone', () => {
    expect(updateTicketSchema.parse({ status: 'RESOLVED' })).toEqual({ status: 'RESOLVED' });
  });

  it('accepts a category alone', () => {
    expect(updateTicketSchema.parse({ category: 'REFUND' })).toEqual({ category: 'REFUND' });
  });

  it('accepts a status and a category together', () => {
    expect(updateTicketSchema.parse({ status: 'CLOSED', category: 'GENERAL' })).toEqual({
      status: 'CLOSED',
      category: 'GENERAL',
    });
  });

  it('rejects an empty change', () => {
    expect(errorsFor({})).toEqual(['Nothing to update']);
  });

  it('rejects an unknown status', () => {
    expect(errorsFor({ status: 'PENDING' })).toHaveLength(1);
  });

  it('rejects an unknown category', () => {
    expect(errorsFor({ category: 'BILLING' })).toHaveLength(1);
  });

  it('rejects clearing the category', () => {
    expect(errorsFor({ category: null })).toHaveLength(1);
  });

  it('rejects fields that cannot be changed', () => {
    expect(errorsFor({ status: 'OPEN', subject: 'New subject' })).toHaveLength(1);
  });

  it('rejects a body that is not an object', () => {
    expect(errorsFor('RESOLVED')).toHaveLength(1);
  });
});

describe('createReplySchema', () => {
  it('accepts a reply and trims it', () => {
    expect(createReplySchema.parse({ body: '  Thanks, fixed.\n' })).toEqual({
      body: 'Thanks, fixed.',
    });
  });

  it('keeps line breaks inside the reply', () => {
    expect(createReplySchema.parse({ body: 'Hi Jane,\n\nDone.' }).body).toBe('Hi Jane,\n\nDone.');
  });

  it('rejects an empty reply', () => {
    expect(createReplySchema.safeParse({ body: '' }).error?.issues[0]?.message).toBe(
      'Write a reply',
    );
  });

  it('rejects a reply of only whitespace', () => {
    expect(createReplySchema.safeParse({ body: ' \n\t ' }).success).toBe(false);
  });

  it('accepts a reply at the length limit', () => {
    expect(createReplySchema.safeParse({ body: 'a'.repeat(REPLY_MAX_LENGTH) }).success).toBe(true);
  });

  it('rejects a reply over the length limit', () => {
    expect(
      createReplySchema.safeParse({ body: 'a'.repeat(REPLY_MAX_LENGTH + 1) }).error?.issues[0]
        ?.message,
    ).toBe('Keep the reply under 20,000 characters');
  });

  it('rejects a missing or non-string body', () => {
    expect(createReplySchema.safeParse({}).success).toBe(false);
    expect(createReplySchema.safeParse({ body: 42 }).success).toBe(false);
  });
});

describe('ticketListQuerySchema filters', () => {
  it('has no filters by default', () => {
    const query = ticketListQuerySchema.parse({});
    expect(query.status).toBeUndefined();
    expect(query.category).toBeUndefined();
    expect(query.search).toBeUndefined();
  });

  it('parses a status, category and search', () => {
    expect(
      ticketListQuerySchema.parse({ status: 'OPEN', category: 'REFUND', search: 'order 42' }),
    ).toMatchObject({ status: 'OPEN', category: 'REFUND', search: 'order 42' });
  });

  it('trims the search', () => {
    expect(ticketListQuerySchema.parse({ search: '  jane@  ' }).search).toBe('jane@');
  });

  it('treats a blank search as none', () => {
    expect(ticketListQuerySchema.parse({ search: '   ' }).search).toBeUndefined();
  });

  it('accepts a search of the maximum length', () => {
    const search = 'x'.repeat(TICKET_SEARCH_MAX_LENGTH);
    expect(ticketListQuerySchema.parse({ search }).search).toBe(search);
  });

  it('rejects a search one character too long', () => {
    const result = ticketListQuerySchema.safeParse({
      search: 'x'.repeat(TICKET_SEARCH_MAX_LENGTH + 1),
    });
    expect(result.error?.issues[0]?.message).toBe('Keep the search under 200 characters');
  });

  it('parses the assignee filters', () => {
    expect(ticketListQuerySchema.parse({ assignee: 'me' }).assignee).toBe('me');
    expect(ticketListQuerySchema.parse({ assignee: 'unassigned' }).assignee).toBe('unassigned');
  });

  it('rejects any other assignee filter', () => {
    expect(ticketListQuerySchema.safeParse({ assignee: 'someone' }).success).toBe(false);
  });

  it('rejects an unknown status or category', () => {
    expect(ticketListQuerySchema.safeParse({ status: 'open' }).success).toBe(false);
    expect(ticketListQuerySchema.safeParse({ category: 'BILLING' }).success).toBe(false);
  });

  it('rejects a repeated param', () => {
    expect(ticketListQuerySchema.safeParse({ status: ['OPEN', 'CLOSED'] }).success).toBe(false);
    expect(ticketListQuerySchema.safeParse({ search: ['a', 'b'] }).success).toBe(false);
  });
});

describe('hasTicketFilters', () => {
  it('is false without filters', () => {
    expect(hasTicketFilters({})).toBe(false);
  });

  it('is false for an empty search', () => {
    expect(hasTicketFilters({ search: '' })).toBe(false);
  });

  it.each([
    { status: 'OPEN' },
    { category: 'REFUND' },
    { assignee: 'unassigned' },
    { search: 'jane' },
  ] as const)('is true for %o', (filters) => {
    expect(hasTicketFilters(filters)).toBe(true);
  });
});
