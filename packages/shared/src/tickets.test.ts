import { describe, expect, it } from 'vitest';
import { updateTicketSchema } from './tickets';

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
