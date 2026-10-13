import { describe, expect, it } from 'vitest';
import { htmlToText, sanitizeEmailHtml } from './sanitize';

describe('sanitizeEmailHtml', () => {
  it('keeps basic formatting', () => {
    expect(sanitizeEmailHtml('<p>Hello <strong>there</strong></p><ul><li>a</li></ul>')).toBe(
      '<p>Hello <strong>there</strong></p><ul><li>a</li></ul>',
    );
  });

  it('removes scripts and styles with their content', () => {
    expect(sanitizeEmailHtml('<style>p{}</style><p>Hi</p><script>alert(1)</script>')).toBe(
      '<p>Hi</p>',
    );
  });

  it('removes event handler attributes', () => {
    expect(sanitizeEmailHtml('<p onclick="alert(1)">Hi</p>')).toBe('<p>Hi</p>');
  });

  it('removes images', () => {
    expect(sanitizeEmailHtml('<p>Hi<img src="https://track.test/p.gif" onerror="x()"></p>')).toBe(
      '<p>Hi</p>',
    );
  });

  it('drops javascript: links', () => {
    expect(sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a rel="noopener noreferrer nofollow" target="_blank">x</a>',
    );
  });

  it('makes links open safely in a new tab', () => {
    expect(sanitizeEmailHtml('<a href="https://example.test" rel="opener">x</a>')).toBe(
      '<a href="https://example.test" rel="noopener noreferrer nofollow" target="_blank">x</a>',
    );
  });

  it('drops the document head', () => {
    expect(
      sanitizeEmailHtml('<html><head><title>T</title></head><body><p>Hi</p></body></html>'),
    ).toBe('<p>Hi</p>');
  });
});

describe('htmlToText', () => {
  it('puts blocks on separate lines', () => {
    expect(htmlToText('<p>Hello</p><p>World<br>again</p>')).toBe('Hello\nWorld\nagain');
  });

  it('decodes entities instead of escaping them', () => {
    expect(htmlToText('<p>Tom &amp; Jerry &lt;3 &quot;hi&quot;</p>')).toBe('Tom & Jerry <3 "hi"');
  });

  it('drops scripts, styles and the title', () => {
    expect(htmlToText('<title>T</title><style>p{}</style><p>Hi</p><script>x()</script>')).toBe(
      'Hi',
    );
  });

  it('returns an empty string for markup without text', () => {
    expect(htmlToText('<div><img src="x"></div>')).toBe('');
  });
});
