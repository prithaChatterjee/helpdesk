import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureError, initMonitoring, reportError, sentryOptions } from './monitoring';

vi.mock('@sentry/node', () => ({ init: vi.fn(), captureException: vi.fn(), close: vi.fn() }));

const config = {
  dsn: 'https://key@o1.ingest.sentry.io/1',
  environment: 'test',
  service: 'api',
} as const;

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('sentryOptions', () => {
  const options = sentryOptions(config);

  it('tags events with the environment and service', () => {
    expect(options).toMatchObject({
      dsn: config.dsn,
      environment: 'test',
      initialScope: { tags: { service: 'api' } },
    });
  });

  it('turns tracing off: errors only', () => {
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('tracesSampler');
  });

  it('never sends request bodies, cookies, user details or stack-frame variables', () => {
    expect(options.dataCollection).toMatchObject({
      httpBodies: [],
      cookies: false,
      userInfo: false,
      stackFrameVariables: false,
    });
  });

  it('never sends AI prompts and replies, database query data or queue payloads', () => {
    expect(options.dataCollection).toMatchObject({
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
    });
  });

  it('filters the Cookie header', () => {
    expect(options.dataCollection?.httpHeaders).toEqual({
      request: { deny: ['cookie'] },
      response: { deny: ['set-cookie'] },
    });
  });

  it('keeps only list parameters of the query string, not search or the webhook token', () => {
    const allowed = (options.dataCollection?.urlQueryParams as { allow: string[] }).allow;
    expect(allowed).toContain('page');
    expect(allowed).not.toContain('search');
    expect(allowed).not.toContain('token');
  });
});

describe('initMonitoring', () => {
  it('does nothing without a DSN', () => {
    expect(initMonitoring({ ...config, dsn: undefined })).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('starts Sentry with the options when a DSN is set', () => {
    expect(initMonitoring(config)).toBe(true);
    expect(Sentry.init).toHaveBeenCalledWith(sentryOptions(config));
  });
});

describe('reportError', () => {
  it('logs the error and reports it with its tags', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');

    reportError('Something failed:', err, { feature: 'replies' });

    expect(logged).toHaveBeenCalledWith('Something failed:', err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err, { tags: { feature: 'replies' } });
  });
});

describe('captureError', () => {
  it('reports without logging', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');

    captureError(err, { queue: 'send-email' });

    expect(logged).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(err, { tags: { queue: 'send-email' } });
  });
});
