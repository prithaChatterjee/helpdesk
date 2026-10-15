import * as Sentry from '@sentry/node';
import { SENTRY_ALLOWED_QUERY_PARAMS } from './sentry-privacy';

export interface MonitoringConfig {
  /** Sentry project DSN; without it nothing is sent */
  dsn: string | undefined;
  /** e.g. `production`, `development` */
  environment: string;
  /** Which process reports, so the api's and the worker's errors can be told apart */
  service: 'api' | 'worker';
}

/**
 * Sentry options for the api and worker: errors only (no tracing), and nothing that may hold
 * customer data or secrets. Request bodies (sign-in passwords, inbound emails), cookies (the
 * session), stack-frame variables (email bodies), AI prompts and replies, and database query data
 * stay out; of the query string only the ticket list's own parameters keep their values (`search`
 * can be a customer's email address, and the SendGrid webhook's `token` is a secret).
 */
export function sentryOptions({ dsn, environment, service }: MonitoringConfig): Sentry.NodeOptions {
  return {
    dsn,
    environment,
    initialScope: { tags: { service } },
    dataCollection: {
      userInfo: false,
      cookies: false,
      // Authorization is filtered by Sentry already; the Cookie header holds the session
      httpHeaders: { request: { deny: ['cookie'] }, response: { deny: ['set-cookie'] } },
      httpBodies: [],
      urlQueryParams: { allow: [...SENTRY_ALLOWED_QUERY_PARAMS] },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
  };
}

/** Starts Sentry when a DSN is configured; returns whether it did. Call once, at startup. */
export function initMonitoring(config: MonitoringConfig): boolean {
  if (!config.dsn) return false;
  Sentry.init(sentryOptions(config));
  return true;
}

/**
 * Logs an error and reports it to Sentry, tagged (e.g. `{ queue: 'send-email' }`). Without
 * `initMonitoring`, only the log line is written.
 */
export function reportError(message: string, err: unknown, tags?: Record<string, string>): void {
  console.error(message, err);
  captureError(err, tags);
}

/** Reports an error to Sentry without logging it, for errors already logged elsewhere. */
export function captureError(err: unknown, tags?: Record<string, string>): void {
  Sentry.captureException(err, { tags });
}

/** Sends the errors still queued before the process exits. */
export function flushMonitoring(timeoutMs = 2_000): Promise<boolean> {
  return Sentry.close(timeoutMs);
}
