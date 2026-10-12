import { describe, expect, it } from 'vitest';
import { createUserSchema, updateUserSchema } from './users';

const valid = { name: 'Alan Agent', email: 'alan@example.com', password: 'Secret#123' };

/** The error messages for `input`, or [] when it is valid. */
function errorsFor(input: unknown) {
  const result = createUserSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('createUserSchema', () => {
  it('accepts a valid user', () => {
    expect(createUserSchema.parse(valid)).toEqual(valid);
  });

  it('trims the name and trims and lowercases the email', () => {
    const parsed = createUserSchema.parse({
      ...valid,
      name: '  Alan Agent ',
      email: ' Alan@Example.COM ',
    });
    expect(parsed).toMatchObject({ name: 'Alan Agent', email: 'alan@example.com' });
  });

  it('requires a name', () => {
    expect(errorsFor({ ...valid, name: '   ' })).toEqual(['Name is required']);
  });

  it('rejects a name over 100 characters', () => {
    expect(errorsFor({ ...valid, name: 'a'.repeat(101) })).toEqual([
      'Name must be at most 100 characters',
    ]);
  });

  it('rejects an invalid email', () => {
    expect(errorsFor({ ...valid, email: 'not-an-email' })).toEqual(['Enter a valid email address']);
  });

  it('reports a blank password as required before any other password rule', () => {
    expect(errorsFor({ ...valid, password: '' })[0]).toBe('Password is required');
  });

  it('accepts a password of exactly 8 characters', () => {
    expect(errorsFor({ ...valid, password: 'Abcdef1!' })).toEqual([]);
  });

  it('rejects a password under 8 characters', () => {
    expect(errorsFor({ ...valid, password: 'Abcde1!' })).toEqual([
      'Password must be at least 8 characters',
    ]);
  });

  it('rejects a password over 128 characters', () => {
    expect(errorsFor({ ...valid, password: `Aa!${'a'.repeat(126)}` })).toEqual([
      'Password must be at most 128 characters',
    ]);
  });

  it('requires a lowercase letter', () => {
    expect(errorsFor({ ...valid, password: 'SECRET#123' })).toEqual([
      'Password must contain a lowercase letter',
    ]);
  });

  it('requires an uppercase letter', () => {
    expect(errorsFor({ ...valid, password: 'secret#123' })).toEqual([
      'Password must contain an uppercase letter',
    ]);
  });

  it('requires a special character', () => {
    expect(errorsFor({ ...valid, password: 'Secret1234' })).toEqual([
      'Password must contain a special character',
    ]);
  });

  it('rejects missing fields and wrong types', () => {
    expect(errorsFor({ name: 1 })).toHaveLength(3);
  });
});

describe('updateUserSchema', () => {
  /** The error messages for `input`, or [] when it is valid. */
  function updateErrorsFor(input: unknown) {
    const result = updateUserSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  }

  it('accepts a blank password, meaning keep the current one', () => {
    expect(updateUserSchema.parse({ ...valid, password: '' })).toEqual({ ...valid, password: '' });
  });

  it('accepts a new password that passes the create rules', () => {
    expect(updateErrorsFor(valid)).toEqual([]);
  });

  it('applies the create rules to a new password, one message per failed rule', () => {
    expect(updateErrorsFor({ ...valid, password: 'secret' })).toEqual([
      'Password must be at least 8 characters',
      'Password must contain an uppercase letter',
      'Password must contain a special character',
    ]);
  });

  it('trims and lowercases the email like create', () => {
    expect(
      updateUserSchema.parse({ ...valid, email: ' Alan@Example.COM ', password: '' }).email,
    ).toBe('alan@example.com');
  });

  it('still requires a name', () => {
    expect(updateErrorsFor({ ...valid, name: '' })).toEqual(['Name is required']);
  });

  it('requires the password field to be present', () => {
    expect(updateErrorsFor({ name: valid.name, email: valid.email })).toHaveLength(1);
  });
});
