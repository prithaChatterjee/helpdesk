import { SENTRY_ALLOWED_QUERY_PARAMS } from '@helpdesk/shared';
import type { Breadcrumb } from '@sentry/react';
import type { ErrorInfo } from 'react';
import { ApiError } from '@/lib/api';

type SentryModule = typeof import('@sentry/react');

// The SDK (~100 kB gzipped) is its own chunk, downloaded only when a DSN is set
let sentry: Promise<SentryModule | undefined> = Promise.resolve(undefined);

/**
 * Starts Sentry error reporting when `VITE_SENTRY_DSN` is set; resolves to whether it did. Errors
 * only (no tracing or session replay), and no request bodies, cookies or user details. Query
 * strings keep only the ticket list's own parameters (`search` can be a customer's email address).
 * Errors reported while the SDK loads are sent once it has.
 */
export function initMonitoring(
  dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN,
  environment: string = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
): Promise<boolean> {
  if (!dsn) return Promise.resolve(false);
  sentry = import('@sentry/react').then(
    (Sentry) => {
      Sentry.init({
        dsn,
        environment,
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpBodies: [],
          urlQueryParams: { allow: [...SENTRY_ALLOWED_QUERY_PARAMS] },
          stackFrameVariables: false,
        },
        beforeBreadcrumb: stripQueryStrings,
      });
      return Sentry;
    },
    // e.g. blocked by an ad blocker: the app works on without error reporting
    () => undefined,
  );
  return sentry.then(Boolean);
}

/** Reports an error to Sentry (once it has loaded); does nothing when monitoring is off. */
export async function reportError(err: unknown, componentStack?: string | null): Promise<void> {
  const Sentry = await sentry;
  Sentry?.captureException(
    err,
    componentStack ? { contexts: { react: { componentStack } } } : undefined,
  );
}

/**
 * React 19 root error hooks (`createRoot` options): logs like React's defaults do and reports to
 * Sentry. Covers errors an error boundary caught, uncaught ones and ones React recovered from.
 */
export function reportReactError(error: unknown, errorInfo: ErrorInfo): void {
  console.error(error);
  void reportError(error, errorInfo.componentStack);
}

/** Removes the query string from a URL, absolute or relative. */
function withoutQuery(url: unknown): unknown {
  return typeof url === 'string' ? url.replace(/[?#].*$/, '') : url;
}

/**
 * Drops query strings from request and navigation breadcrumbs (the trail of what happened before
 * an error): e.g. `/api/tickets?search=jane@customer.test` becomes `/api/tickets`.
 */
export function stripQueryStrings(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  for (const key of ['url', 'from', 'to']) {
    if (key in data) data[key] = withoutQuery(data[key]);
  }
  return { ...breadcrumb, data };
}

/**
 * Whether a failed request is a bug worth reporting. A 4xx (signed out, invalid input, not found)
 * is expected and shown in the UI; 5xx responses, network failures and other errors are reported.
 */
export function isUnexpectedError(err: unknown): boolean {
  return !(err instanceof ApiError && err.status < 500);
}

/** `QueryCache`/`MutationCache` `onError`: reports unexpected query and mutation failures. */
export function reportQueryError(err: unknown): void {
  if (isUnexpectedError(err)) void reportError(err);
}
