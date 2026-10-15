import * as Sentry from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/react', () => ({ init: vi.fn(), captureException: vi.fn() }));

const DSN = 'https://key@o1.ingest.sentry.io/1';

// The module keeps the loaded SDK, so each test starts from a fresh copy (and the ApiError class
// that copy checks against)
let monitoring: typeof import('./monitoring');
let ApiError: typeof import('@/lib/api').ApiError;
beforeEach(async () => {
  vi.resetModules();
  monitoring = await import('./monitoring');
  ({ ApiError } = await import('@/lib/api'));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('initMonitoring', () => {
  it('does nothing without a DSN', async () => {
    await expect(monitoring.initMonitoring('', 'test')).resolves.toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('starts Sentry without bodies, cookies, user details or search terms', async () => {
    await expect(monitoring.initMonitoring(DSN, 'staging')).resolves.toBe(true);

    const options = vi.mocked(Sentry.init).mock.calls[0]?.[0];
    expect(options).toMatchObject({
      dsn: DSN,
      environment: 'staging',
      dataCollection: { userInfo: false, cookies: false, httpBodies: [] },
      beforeBreadcrumb: monitoring.stripQueryStrings,
    });
    const allowed = (options?.dataCollection?.urlQueryParams as { allow: string[] }).allow;
    expect(allowed).toContain('status');
    expect(allowed).not.toContain('search');
    expect(options).not.toHaveProperty('tracesSampleRate');
  });
});

describe('reportError', () => {
  it('does nothing while monitoring is off', async () => {
    await monitoring.reportError(new Error('boom'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('sends an error reported before the SDK finished loading', async () => {
    const loaded = monitoring.initMonitoring(DSN, 'test');
    const err = new Error('boom');

    const reported = monitoring.reportError(err);
    await Promise.all([loaded, reported]);

    expect(Sentry.captureException).toHaveBeenCalledWith(err, undefined);
  });

  it('attaches the React component stack', async () => {
    await monitoring.initMonitoring(DSN, 'test');
    const err = new Error('render failed');

    await monitoring.reportError(err, '\n    at TicketsPage');

    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      contexts: { react: { componentStack: '\n    at TicketsPage' } },
    });
  });
});

describe('reportReactError', () => {
  it('logs the error and reports it with the component stack', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await monitoring.initMonitoring(DSN, 'test');
    const err = new Error('render failed');

    monitoring.reportReactError(err, { componentStack: '\n    at App' });
    await monitoring.reportError(new Error('flush'));

    expect(logged).toHaveBeenCalledWith(err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      contexts: { react: { componentStack: '\n    at App' } },
    });
  });
});

describe('stripQueryStrings', () => {
  it('removes the query string from request breadcrumbs', () => {
    expect(
      monitoring.stripQueryStrings({
        category: 'fetch',
        data: { method: 'GET', url: '/api/tickets?search=jane@customer.test', status_code: 200 },
      }),
    ).toEqual({
      category: 'fetch',
      data: { method: 'GET', url: '/api/tickets', status_code: 200 },
    });
  });

  it('removes query strings and fragments from navigation breadcrumbs', () => {
    expect(
      monitoring.stripQueryStrings({
        category: 'navigation',
        data: { from: '/tickets?search=jane', to: 'https://app.test/tickets/1#reply' },
      }).data,
    ).toEqual({ from: '/tickets', to: 'https://app.test/tickets/1' });
  });

  it('leaves breadcrumbs without data alone', () => {
    const breadcrumb = { category: 'ui.click', message: 'button' };
    expect(monitoring.stripQueryStrings(breadcrumb)).toBe(breadcrumb);
  });
});

describe('isUnexpectedError', () => {
  it.each([400, 401, 403, 404, 409])('expects a %i response', (status) => {
    expect(monitoring.isUnexpectedError(new ApiError(status, 'No'))).toBe(false);
  });

  it.each([
    // Factories: the table is built before beforeEach loads ApiError
    ['a 500 response', () => new ApiError(500, 'Internal Server Error')],
    ['a 502 response', () => new ApiError(502, "Couldn't polish the reply")],
    ['a network failure', () => new TypeError('Failed to fetch')],
    ['a bug', () => new Error('Cannot read properties of undefined')],
  ])('reports %s', (_name, makeError) => {
    expect(monitoring.isUnexpectedError(makeError())).toBe(true);
  });
});

describe('reportQueryError', () => {
  beforeEach(async () => {
    await monitoring.initMonitoring(DSN, 'test');
  });

  it('reports a server error', async () => {
    const err = new ApiError(500, 'Internal Server Error');

    monitoring.reportQueryError(err);
    await monitoring.reportError(new Error('flush'));

    expect(Sentry.captureException).toHaveBeenCalledWith(err, undefined);
  });

  it('does not report a client error', async () => {
    monitoring.reportQueryError(new ApiError(404, 'Ticket not found'));
    await monitoring.reportError(new Error('flush'));

    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });
});
