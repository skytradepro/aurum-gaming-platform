/**
 * Server-side client for the Aurum API. The website never talks to the database: every read and
 * every change goes through the API, which owns validation, permissions and the ledger.
 *
 * The visitor's session cookie is forwarded, the client IP is passed in X-Forwarded-For (the API
 * trusts exactly one proxy hop: this server), and cookies the API sets are relayed to the browser.
 */

export interface ApiErrorBody {
  code: string;
  fields?: Record<string, string>;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly requestId: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, body: ApiErrorBody, retryAfterSeconds?: number) {
    super(`API ${status} ${body.code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.fields = body.fields ?? {};
    this.requestId = body.requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isApiError(value: unknown, code?: string): value is ApiError {
  return value instanceof ApiError && (code === undefined || value.code === code);
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Sent as Origin: the API only accepts state-changing requests from the website's origin. */
  origin: string;
  sessionCookieName: string;
  sessionToken: string | null;
  clientIp: string;
  userAgent: string;
  requestId: string;
  timeoutMs?: number;
}

export interface ApiResult<T> {
  status: number;
  data: T;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
}

export class ApiClient {
  private readonly options: ApiClientOptions;
  private token: string | null;
  /** Set-Cookie lines from the API, to relay to the browser. */
  readonly setCookies: string[] = [];

  constructor(options: ApiClientOptions) {
    this.options = options;
    this.token = options.sessionToken;
  }

  get sessionToken(): string | null {
    return this.token;
  }

  async request<T>(method: string, path: string, init: { json?: unknown; form?: FormData; query?: Query } = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      origin: this.options.origin,
      'x-aurum-client': 'web',
      'x-forwarded-for': this.options.clientIp,
      'x-request-id': this.options.requestId,
      'user-agent': this.options.userAgent.slice(0, 400) || 'aurum-web',
    };
    if (this.token) headers.cookie = `${this.options.sessionCookieName}=${encodeURIComponent(this.token)}`;
    let body: string | FormData | undefined;
    if (init.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.json);
    } else if (init.form) {
      body = init.form;
    }
    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl}${withQuery(path, init.query)}`, {
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
      });
    } catch (error) {
      throw new ApiError(502, { code: 'internal_error' }, undefined);
    }
    for (const line of response.headers.getSetCookie()) {
      this.setCookies.push(line);
      const [pair = ''] = line.split(';');
      const eq = pair.indexOf('=');
      if (pair.slice(0, eq).trim() === this.options.sessionCookieName) {
        const value = decodeURIComponent(pair.slice(eq + 1).trim());
        const expired = /max-age=0/i.test(line) || value === '';
        this.token = expired ? null : value;
      }
    }
    const text = await response.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }
    if (!response.ok) {
      const error = (parsed as { error?: ApiErrorBody } | undefined)?.error ?? { code: response.status === 404 ? 'not_found' : 'internal_error' };
      const retry = Number(response.headers.get('retry-after'));
      throw new ApiError(response.status, error, Number.isFinite(retry) && retry > 0 ? retry : undefined);
    }
    return { status: response.status, data: (parsed as { data?: T } | undefined)?.data as T };
  }

  get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>('GET', path, { query }).then((r) => r.data);
  }
  post<T>(path: string, json?: unknown): Promise<T> {
    return this.request<T>('POST', path, json === undefined ? {} : { json }).then((r) => r.data);
  }
  put<T>(path: string, json: unknown): Promise<T> {
    return this.request<T>('PUT', path, { json }).then((r) => r.data);
  }
  patch<T>(path: string, json: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { json }).then((r) => r.data);
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path).then((r) => r.data);
  }
  upload<T>(path: string, form: FormData): Promise<T> {
    return this.request<T>('POST', path, { form }).then((r) => r.data);
  }
}
