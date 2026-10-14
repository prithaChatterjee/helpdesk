import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spaceCalls } from './space-calls';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('spaceCalls', () => {
  it('runs the first call right away and passes its arguments and result through', async () => {
    const fn = vi.fn(async (a: number, b: number) => a + b);

    await expect(spaceCalls(fn, 1000)(2, 3)).resolves.toBe(5);
    expect(fn).toHaveBeenCalledWith(2, 3);
  });

  it('starts each later call at least the interval after the previous one', async () => {
    const started: number[] = [];
    const spaced = spaceCalls(async () => {
      started.push(Date.now());
    }, 1000);
    const t0 = Date.now();

    const calls = Promise.all([spaced(), spaced(), spaced()]);
    await vi.runAllTimersAsync();
    await calls;

    expect(started.map((t) => t - t0)).toEqual([0, 1000, 2000]);
  });

  it('does not wait when the interval has already passed', async () => {
    const fn = vi.fn(async () => {});
    const spaced = spaceCalls(fn, 1000);

    await spaced();
    vi.advanceTimersByTime(5000);
    const second = spaced();

    expect(fn).toHaveBeenCalledTimes(2);
    await second;
  });

  it('keeps spacing after a call fails', async () => {
    const started: number[] = [];
    const spaced = spaceCalls(async (fail: boolean) => {
      started.push(Date.now());
      if (fail) throw new Error('quota');
    }, 1000);
    const t0 = Date.now();

    const first = spaced(true);
    const second = spaced(false);
    await vi.runAllTimersAsync();
    await expect(first).rejects.toThrow('quota');
    await second;

    expect(started.map((t) => t - t0)).toEqual([0, 1000]);
  });
});
