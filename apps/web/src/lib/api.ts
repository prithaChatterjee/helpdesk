/** Error from an `/api` request, carrying the HTTP status. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** Requests JSON from the API (same-origin, so the session cookie is sent). Throws `ApiError` on failure. */
async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  // 204 No Content (e.g. DELETE) has no body to parse
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** GETs JSON from the API. Throws `ApiError` on failure. */
export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

/** POSTs `body` as JSON to the API. Throws `ApiError` on failure. */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** PATCHes `body` as JSON to the API. Throws `ApiError` on failure. */
export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** DELETEs a resource. Throws `ApiError` on failure. */
export function apiDelete(path: string): Promise<void> {
  return apiRequest<void>(path, { method: 'DELETE' });
}
