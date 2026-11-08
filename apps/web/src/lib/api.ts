import { errorMessageKey, type Locale } from '@aurum/i18n';
import { apiBaseUrl } from './config';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly requestId?: string;

  constructor(status: number, code: string, fields?: Record<string, string>, requestId?: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }

  messageKey(): string {
    return errorMessageKey(this.code);
  }
}

export interface ApiEnvelope<T> {
  data?: T;
  error?: { code: string; fields?: Record<string, string>; requestId?: string };
}

type JsonInit = Omit<RequestInit, 'body'> & {
  json?: unknown;
  cookieHeader?: string;
  locale?: Locale;
};

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, 'internal_error');
  }
}

export async function apiFetch<T>(path: string, init: JsonInit = {}): Promise<T> {
  const { json, cookieHeader, locale, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('Accept', 'application/json');
  if (locale) headers.set('Accept-Language', locale);
  const method = (rest.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-aurum-client', 'web');
  let body: BodyInit | undefined;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }
  if (cookieHeader) headers.set('Cookie', cookieHeader);

  const res = await fetch(`${apiBaseUrl(true)}${path}`, {
    ...rest,
    method,
    headers,
    body,
    cache: rest.cache ?? 'no-store',
  });

  const payload = await parseJson<ApiEnvelope<T> & T>(res);
  if (!res.ok) {
    const err = payload.error ?? { code: 'internal_error' };
    throw new ApiError(res.status, err.code, err.fields, err.requestId);
  }
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}

/** Client-side fetch (browser). Uses credentials and same-origin /api/v1 rewrite. */
export async function apiClient<T>(path: string, init: JsonInit = {}): Promise<T> {
  const { json, locale, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('Accept', 'application/json');
  if (locale) headers.set('Accept-Language', locale);
  const method = (rest.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-aurum-client', 'web');
  let body: BodyInit | undefined;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }

  const res = await fetch(`${apiBaseUrl(false)}${path}`, {
    ...rest,
    method,
    headers,
    body,
    credentials: 'include',
    cache: 'no-store',
  });

  const payload = await parseJson<ApiEnvelope<T> & T>(res);
  if (!res.ok) {
    const err = payload.error ?? { code: 'internal_error' };
    throw new ApiError(res.status, err.code, err.fields, err.requestId);
  }
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}
