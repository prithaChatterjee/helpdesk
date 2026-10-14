import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPacer } from './pacer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPacer', () => {
  it('runs the first task right away and returns its result', async () => {
    const pace = createPacer(1000);

    await expect(pace(async () => 5)).resolves.toBe(5);
  });

  it('starts each later task at least the interval after the previous one', async () => {
    const started: number[] = [];
    const pace = createPacer(1000);
    const task = async () => {
      started.push(Date.now());
    };
    const t0 = Date.now();

    const runs = Promise.all([pace(task), pace(task), pace(task)]);
    await vi.runAllTimersAsync();
    await runs;

    expect(started.map((t) => t - t0)).toEqual([0, 1000, 2000]);
  });

  it('paces different kinds of task together', async () => {
    const started: string[] = [];
    const pace = createPacer(1000);
    const t0 = Date.now();

    const runs = Promise.all([
      pace(async () => started.push(`classify@${Date.now() - t0}`)),
      pace(async () => started.push(`resolve@${Date.now() - t0}`)),
    ]);
    await vi.runAllTimersAsync();
    await runs;

    expect(started).toEqual(['classify@0', 'resolve@1000']);
  });

  it('does not wait when the interval has already passed', async () => {
    const task = vi.fn(async () => {});
    const pace = createPacer(1000);

    await pace(task);
    vi.advanceTimersByTime(5000);
    const second = pace(task);

    expect(task).toHaveBeenCalledTimes(2);
    await second;
  });

  it('keeps pacing after a task fails', async () => {
    const started: number[] = [];
    const pace = createPacer(1000);
    const t0 = Date.now();

    const first = pace(async () => {
      started.push(Date.now() - t0);
      throw new Error('quota');
    });
    const second = pace(async () => {
      started.push(Date.now() - t0);
    });
    // Attached before the timers run, so the rejection is never unhandled
    const firstFails = expect(first).rejects.toThrow('quota');
    await vi.runAllTimersAsync();
    await firstFails;
    await second;

    expect(started).toEqual([0, 1000]);
  });
});
