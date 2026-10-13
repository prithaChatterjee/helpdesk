import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from './like-pattern';

describe('escapeLikePattern', () => {
  it('leaves plain text alone', () => {
    expect(escapeLikePattern("Can't log in #42")).toBe("Can't log in #42");
  });

  it('escapes the % and _ wildcards', () => {
    expect(escapeLikePattern('100%_off')).toBe('100\\%\\_off');
  });

  it('escapes the escape character itself', () => {
    expect(escapeLikePattern('C:\\temp')).toBe('C:\\\\temp');
  });

  it('keeps an empty string empty', () => {
    expect(escapeLikePattern('')).toBe('');
  });
});
