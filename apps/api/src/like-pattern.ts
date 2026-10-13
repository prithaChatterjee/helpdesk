/**
 * `text` as a literal LIKE pattern, for Prisma's `contains`/`startsWith`/`endsWith`. Prisma passes
 * `%` and `_` through as wildcards, so a search for "100%" would also match "1000"; `\` is
 * Postgres's default LIKE escape character.
 */
export function escapeLikePattern(text: string) {
  return text.replace(/[\\%_]/g, '\\$&');
}
