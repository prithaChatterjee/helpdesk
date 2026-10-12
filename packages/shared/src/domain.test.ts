import { describe, expect, it } from 'vitest';
import { USER_ROLES, UserRole } from './domain';

describe('UserRole', () => {
  it('maps each role to itself', () => {
    expect(UserRole).toEqual({ ADMIN: 'ADMIN', AGENT: 'AGENT' });
  });

  it('has exactly the roles in USER_ROLES', () => {
    expect(Object.values(UserRole)).toEqual([...USER_ROLES]);
  });
});
