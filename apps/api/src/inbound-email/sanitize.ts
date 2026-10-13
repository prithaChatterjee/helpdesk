import sanitizeHtml from 'sanitize-html';

// Tags whose content is dropped along with the tag (not shown as text)
const NON_TEXT_TAGS = ['script', 'style', 'textarea', 'option', 'title', 'head', 'noscript'];

const HTML_OPTIONS: sanitizeHtml.IOptions = {
  // Images are left out: remote ones are tracking pixels, and inline (cid:) ones need attachments
  allowedTags: sanitizeHtml.defaults.allowedTags,
  allowedAttributes: {
    a: ['href', 'name', 'title', 'rel', 'target'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  nonTextTags: NON_TEXT_TAGS,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
};

/** Email HTML reduced to safe formatting and links: no scripts, styles, event handlers or images. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, HTML_OPTIONS);
}

const TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  nonTextTags: NON_TEXT_TAGS,
};

/** Plain text of an HTML email, for emails sent without a text part. */
export function htmlToText(html: string): string {
  // Line breaks where blocks end, since stripping tags would run paragraphs together
  const withBreaks = html.replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|blockquote|pre)>/gi, '$&\n');
  return (
    sanitizeHtml(withBreaks, TEXT_OPTIONS)
      // sanitize-html escapes text for HTML; this is plain text, so undo it
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
