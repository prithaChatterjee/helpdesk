import { describe, expect, it } from 'vitest';
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TicketCategory,
  ticketCategorySchema,
  TicketStatus,
  ticketStatusSchema,
  USER_ROLES,
  UserRole,
} from './domain';

describe('UserRole', () => {
  it('maps each role to itself', () => {
    expect(UserRole).toEqual({ ADMIN: 'ADMIN', AGENT: 'AGENT' });
  });

  it('has exactly the roles in USER_ROLES', () => {
    expect(Object.values(UserRole)).toEqual([...USER_ROLES]);
  });
});

describe('TicketStatus', () => {
  it('lists the label keys in order', () => {
    expect(TICKET_STATUSES).toEqual(['OPEN', 'RESOLVED', 'CLOSED']);
  });

  it('maps each status to itself', () => {
    expect(TicketStatus).toEqual({ OPEN: 'OPEN', RESOLVED: 'RESOLVED', CLOSED: 'CLOSED' });
  });

  it('validates only labelled statuses', () => {
    expect(ticketStatusSchema.safeParse('RESOLVED').success).toBe(true);
    expect(ticketStatusSchema.safeParse('Resolved').success).toBe(false);
  });
});

describe('TicketCategory', () => {
  it('lists the label keys in order', () => {
    expect(TICKET_CATEGORIES).toEqual(['GENERAL', 'TECHNICAL', 'REFUND']);
  });

  it('maps each category to itself', () => {
    expect(TicketCategory).toEqual({
      GENERAL: 'GENERAL',
      TECHNICAL: 'TECHNICAL',
      REFUND: 'REFUND',
    });
  });

  it('validates only labelled categories', () => {
    expect(ticketCategorySchema.safeParse('REFUND').success).toBe(true);
    expect(ticketCategorySchema.safeParse('OTHER').success).toBe(false);
  });
});
