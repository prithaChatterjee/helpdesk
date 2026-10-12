/** Error from an `/api` request, carrying the HTTP status. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** GETs JSON from the API (same-origin, so the session cookie is sent). Throws `ApiError` on failure. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}
