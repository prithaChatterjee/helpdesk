/**
 * URL query parameters whose values may be sent to Sentry, by the api, worker and web app alike.
 * Every other parameter is sent as `[Filtered]`: `search` can hold a customer's email address, and
 * the SendGrid webhook's `token` is a secret.
 */
export const SENTRY_ALLOWED_QUERY_PARAMS = [
  'page',
  'pageSize',
  'sortBy',
  'sortOrder',
  'status',
  'category',
  'assignee',
] as const;
