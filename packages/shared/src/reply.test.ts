import { describe, expect, it } from 'vitest';
import { addGreetingAndSignOff, AI_SIGNATURE, customerFirstName } from './reply';

describe('customerFirstName', () => {
  it.each([
    ['Jane Doe', 'Jane'],
    ['Jane', 'Jane'],
    ['  Mary Ann  Smith ', 'Mary'],
    ['Doe, Jane', 'Jane'],
    ['"Jane Doe"', 'Jane'],
  ])('greets %j as %j', (name, first) => {
    expect(customerFirstName(name)).toBe(first);
  });

  it.each([null, '', '   ', '""', 'Doe,'])('has no first name for %j', (name) => {
    expect(customerFirstName(name)).toBeUndefined();
  });
});

describe('addGreetingAndSignOff', () => {
  it('greets by first name and signs with the given name', () => {
    expect(addGreetingAndSignOff('Body.', 'Jane Doe', 'Alan Agent')).toBe(
      ['Hi Jane,', '', 'Body.', '', 'Best regards,', 'Alan Agent'].join('\n'),
    );
  });

  it('greets a customer without a name as "there"', () => {
    expect(addGreetingAndSignOff('Body.', null, AI_SIGNATURE)).toBe(
      ['Hi there,', '', 'Body.', '', 'Best regards,', 'The Support Team'].join('\n'),
    );
  });
});
