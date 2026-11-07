import type { AuthResponse } from '@medequip/shared';

/**
 * API client. The access token lives in memory only (never localStorage); the refresh
 * token is an httpOnly cookie the browser sends to /api/auth automatically.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let sessionListener: ((session: AuthResponse | null) => void) | null = null;
let refreshing: Promise<AuthResponse | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Called whenever the session is refreshed or lost (keeps the signed-in user up to date). */
export function setSessionListener(fn: ((session: AuthResponse | null) => void) | null) {
  sessionListener = fn;
}

/** Get a new access token using the refresh cookie. Concurrent callers share one request. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      if (res.ok) {
        const session = (await res.json()) as AuthResponse;
        accessToken = session.accessToken;
        sessionListener?.(session);
        return session;
      }
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      // Another tab refreshed at the same moment; its new cookie is already set - retry once.
      if (body.code === 'REFRESH_RACE' && attempt === 0) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      break;
    }
    accessToken = null;
    sessionListener?.(null);
    return null;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const send = () =>
    fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let res = await send();
  // Access token expired: refresh once and retry (not for the auth endpoints themselves).
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await send();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      code?: string;
      message?: string | string[];
      issues?: { path: string; message: string }[];
    };
    const message =
      body.issues?.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ') ||
      (Array.isArray(body.message) ? body.message.join('; ') : body.message) ||
      res.statusText;
    throw new ApiError(res.status, body.code, message, body);
  }
  return res;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Download a file from the API (the access token cannot be sent by a plain link). */
export async function download(path: string, filename: string): Promise<void> {
  const blob = await (await request(path)).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
