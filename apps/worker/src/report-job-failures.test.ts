import type { JobWithMetadata } from '@helpdesk/db';
import { describe, expect, it, vi } from 'vitest';
import { reportFinalFailures } from './report-job-failures';

function job(retryCount: number, retryLimit = 8) {
  return { id: 'job-1', data: {}, retryCount, retryLimit } as JobWithMetadata<object>;
}

describe('reportFinalFailures', () => {
  it('runs the handler and reports nothing when it succeeds', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const capture = vi.fn();

    await reportFinalFailures('classify-ticket', handler, capture)([job(0)]);

    expect(handler).toHaveBeenCalledWith([job(0)]);
    expect(capture).not.toHaveBeenCalled();
  });

  it('rethrows a failure that pg-boss will retry, without reporting it', async () => {
    const err = new Error('Gemini is busy');
    const capture = vi.fn();

    await expect(
      reportFinalFailures('classify-ticket', vi.fn().mockRejectedValue(err), capture)([job(3)]),
    ).rejects.toBe(err);

    expect(capture).not.toHaveBeenCalled();
  });

  it('reports the last failed attempt, tagged with its queue and job', async () => {
    const err = new Error('Gemini is busy');
    const capture = vi.fn();

    await expect(
      reportFinalFailures('classify-ticket', vi.fn().mockRejectedValue(err), capture)([job(8)]),
    ).rejects.toBe(err);

    expect(capture).toHaveBeenCalledExactlyOnceWith(err, {
      queue: 'classify-ticket',
      jobId: 'job-1',
    });
  });

  it('reports a job that has no retries at all', async () => {
    const capture = vi.fn();

    await expect(
      reportFinalFailures(
        'send-email',
        vi.fn().mockRejectedValue(new Error('x')),
        capture,
      )([job(0, 0)]),
    ).rejects.toThrow('x');

    expect(capture).toHaveBeenCalledOnce();
  });
});
