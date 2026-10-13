import { describe, expect, it } from 'vitest';
import { createReplySchema, REPLY_MAX_LENGTH, updateTicketSchema } from './tickets';

/** The error messages for `input`, or [] when it is valid. */
function errorsFor(input: unknown) {
  const result = updateTicketSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('updateTicketSchema', () => {
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
