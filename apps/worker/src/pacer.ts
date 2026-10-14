/**
 * A pacer: tasks run through it start at least `intervalMs` apart, and later tasks wait their turn.
 * Share one pacer between all calls that count against the same API quota (e.g. the Gemini free
 * tier's requests per minute per model), so the worker stays under it instead of failing and
 * retrying.
 */
export function createPacer(intervalMs: number) {
  let nextStart = 0;
  return async <T>(task: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const start = Math.max(now, nextStart);
    nextStart = start + intervalMs;
    if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
    return task();
  };
}
