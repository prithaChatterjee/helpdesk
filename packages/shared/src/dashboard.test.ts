import { describe, expect, it } from 'vitest';
import { percentOf } from './dashboard';

describe('percentOf', () => {
  it.each([
    [1, 4, 25],
    [1, 3, 33],
    [2, 3, 67],
    [5, 5, 100],
    [0, 7, 0],
  ])('%i of %i is %i%%', (part, whole, percent) => {
    expect(percentOf(part, whole)).toBe(percent);
  });

  it('is 0 when there is nothing to divide by', () => {
    expect(percentOf(0, 0)).toBe(0);
  });
});
