/**
 * Wraps `fn` so its calls start at least `intervalMs` apart; later calls wait their turn. Keeps the
 * worker under a per-minute API quota (e.g. the Gemini free tier) instead of failing and retrying.
 */
export function spaceCalls<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  intervalMs: number,
): (...args: Args) => Promise<Result> {
  let nextStart = 0;
  return async (...args) => {
    const now = Date.now();
    const start = Math.max(now, nextStart);
    nextStart = start + intervalMs;
    if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
    return fn(...args);
  };
}
