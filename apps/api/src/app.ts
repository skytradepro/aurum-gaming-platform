import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';
import { mapDbError } from '@aurum/db';
import type { Db } from '@aurum/db';
import { MoneyError } from '@aurum/money';
import { AppError } from '@aurum/shared';
import type { Config } from './config.ts';
import { fromMoneyError } from './errors.ts';
import { errorFields, createLogger } from './log.ts';
import type { Logger } from './log.ts';
import { readBinary, readFormData, readJson, readRawJson } from './http/body.ts';
import { parseCookies } from './http/cookies.ts';
import { RateLimiter } from './http/ratelimit.ts';
import { Router, isMethod } from './http/router.ts';
import type { Access, Ctx, JsonReply, Method, RawReply, Reply, Route, SessionUser } from './http/types.ts';
import { loadSession } from './security/session.ts';
import { createCaptcha } from './services/captcha.ts';
import type { Captcha } from './services/captcha.ts';

export interface AppDeps {
  config: Config;
  db: Db;
  routes: readonly Route[];
  captcha?: Captcha;
  logger?: Logger;
  limiter?: RateLimiter;
  clock?: () => Date;
}

export interface App {
  server: Server;
  router: Router;
  listen(): Promise<{ host: string; port: number }>;
  close(): Promise<void>;
}

/** Headers added to every response. API responses are JSON: no framing, no sniffing, no caching. */
const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-site',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cache-control': 'no-store',
};

const GLOBAL_LIMIT = { max: 600, windowMs: 60_000 };

export function clientIp(req: IncomingMessage, trustedHops: number): string {
  const remote = req.socket.remoteAddress ?? '0.0.0.0';
  if (trustedHops <= 0) return remote;
  const header = req.headers['x-forwarded-for'];
  const list = (Array.isArray(header) ? header.join(',') : header ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // the proxies we trust each append the address they saw: take the entry just before them
  const candidate = list[list.length - trustedHops];
  return candidate && isIP(candidate) ? candidate : remote;
}

function pickRequestId(req: IncomingMessage): string {
  const incoming = req.headers['x-request-id'];
  return typeof incoming === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
}

function webOriginAllowed(origin: string, config: Config): boolean {
  if (config.webOrigins.includes(origin)) return true;
  if (config.env === 'development' || config.env === 'test') {
    try {
      const { hostname, protocol } = new URL(origin);
      return (hostname === 'localhost' || hostname === '127.0.0.1') && (protocol === 'http:' || protocol === 'https:');
    } catch {
      return false;
    }
  }
  return false;
}

function checkCsrf(req: IncomingMessage, method: Method, config: Config, hasSessionCookie: boolean): void {
  if (method === 'GET') return;
  const origin = req.headers.origin;
  if (origin !== undefined && !webOriginAllowed(origin, config)) throw new AppError('csrf', { message: `origin ${origin} not allowed` });
  const fetchSite = req.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
    throw new AppError('csrf', { message: `sec-fetch-site ${fetchSite}` });
  }
  if (hasSessionCookie && req.headers['x-aurum-client'] !== 'web') throw new AppError('csrf', { message: 'missing x-aurum-client header' });
}

const PASSWORD_CHANGE_PATHS = new Set(['/v1/auth/me', '/v1/auth/change-password', '/v1/auth/logout']);

export function authorize(access: Access, user: SessionUser | null, path: string): void {
  if (access.kind === 'public') return;
  if (!user) throw new AppError('unauthenticated');
  if (user.mustChangePassword && !PASSWORD_CHANGE_PATHS.has(path)) throw new AppError('password_change_required');
  switch (access.kind) {
    case 'user':
      return;
    case 'player':
      if (user.role !== 'user') throw new AppError('forbidden');
      return;
    case 'super':
      if (user.role !== 'super_admin') throw new AppError('forbidden');
      return;
    case 'staff':
      // dashboard staff only: players and shop cashiers are never staff
      if (user.role !== 'admin' && user.role !== 'super_admin') throw new AppError('forbidden');
      if (user.role === 'super_admin' || !access.anyOf || access.anyOf.length === 0) return;
      if (!access.anyOf.some((p) => user.permissions.includes(p))) throw new AppError('forbidden');
      return;
    case 'cashier':
      if (user.role !== 'cashier' || !user.shopId) throw new AppError('forbidden');
      if (access.managerOnly && user.shopRole !== 'manager') throw new AppError('forbidden');
      return;
  }
}

function jsonBytes(body: unknown): Buffer {
  return Buffer.from(JSON.stringify(body, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)), 'utf8');
}

function writeReply(req: IncomingMessage, res: ServerResponse, reply: Reply): void {
  const headers: Record<string, string | string[]> = { ...SECURITY_HEADERS, ...reply.headers };
  if (reply.type === 'json') {
    if (reply.cookies && reply.cookies.length > 0) headers['set-cookie'] = reply.cookies;
    if (reply.status === 204 || reply.body === undefined) {
      res.writeHead(reply.status, headers);
      res.end();
      return;
    }
    const bytes = jsonBytes(reply.body);
    headers['content-type'] = 'application/json; charset=utf-8';
    headers['content-length'] = String(bytes.length);
    res.writeHead(reply.status, headers);
    res.end(req.method === 'HEAD' ? undefined : bytes);
    return;
  }
  res.writeHead(reply.status, headers);
  if (Buffer.isBuffer(reply.body)) res.end(req.method === 'HEAD' ? undefined : reply.body);
  else if (req.method === 'HEAD') {
    reply.body.destroy();
    res.end();
  } else reply.body.pipe(res);
}

export function createApp(deps: AppDeps): App {
  const { config, db } = deps;
  const logger = deps.logger ?? createLogger(config.logLevel);
  const limiter = deps.limiter ?? new RateLimiter();
  const captcha = deps.captcha ?? createCaptcha(config);
  const clock = deps.clock ?? (() => new Date());
  const router = new Router();
  router.add(deps.routes);

  function errorReply(error: unknown, requestId: string): JsonReply {
    const known = error instanceof AppError ? error : error instanceof MoneyError ? fromMoneyError(error) : mapDbError(error);
    if (known) {
      if (known.status >= 500) logger.error('request failed', { requestId, code: known.code, ...errorFields(known.cause ?? known) });
      const headers: Record<string, string> = {};
      const retry = known.details?.retryAfterSeconds;
      if (typeof retry === 'number') headers['retry-after'] = String(retry);
      return {
        type: 'json',
        status: known.status,
        headers,
        body: { error: { code: known.code, ...(known.fields ? { fields: known.fields } : {}), requestId } },
      };
    }
    logger.error('unhandled error', { requestId, ...errorFields(error) });
    return { type: 'json', status: 500, body: { error: { code: 'internal_error', requestId } } };
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = performance.now();
    const requestId = pickRequestId(req);
    const ip = clientIp(req, config.trustProxyHops);
    let status = 500;
    let userId: string | undefined;
    let routeName = '-';
    try {
      let reply: Reply;
      try {
        let url: URL;
        try {
          url = new URL(req.url ?? '/', 'http://localhost');
        } catch {
          throw new AppError('not_found');
        }
        const rawMethod = req.method === 'HEAD' ? 'GET' : req.method;
        if (!isMethod(rawMethod)) throw new AppError('method_not_allowed');
        const method: Method = rawMethod;
        routeName = `${method} ${url.pathname}`;

        const global = limiter.hit(`global:${ip}`, GLOBAL_LIMIT.max, GLOBAL_LIMIT.windowMs);
        if (!global.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: global.retryAfterSeconds } });

        const { match, methodNotAllowed } = router.match(method, url.pathname);
        if (!match) throw new AppError(methodNotAllowed ? 'method_not_allowed' : 'not_found');
        const { route, params } = match;

        const cookies = parseCookies(req.headers.cookie);
        const token = cookies[config.cookieName] ?? null;
        checkCsrf(req, method, config, token !== null);

        if (route.limit) {
          const hit = limiter.hit(`${route.limit.name}:${ip}`, route.limit.max, route.limit.windowMs);
          if (!hit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: hit.retryAfterSeconds } });
        }

        const needsSession = route.access.kind !== 'public' || route.access.optionalAuth === true;
        const user = needsSession && token ? await loadSession(db, token, clock(), config) : null;
        authorize(route.access, user, url.pathname);
        userId = user?.id;

        const ctx: Ctx = {
          method,
          path: url.pathname,
          query: url.searchParams,
          params,
          headers: req.headers,
          ip,
          userAgent: String(req.headers['user-agent'] ?? '').slice(0, 400),
          requestId,
          now: clock(),
          config,
          db,
          services: { captcha, limiter, logger },
          user,
          sessionToken: user ? token : null,
          principal() {
            if (!user) throw new AppError('unauthenticated');
            return user;
          },
          json: (schema) => readJson(req, schema),
          rawJson: () => readRawJson(req),
          rawBody: (limit) => readBinary(req, limit),
          formData: () => readFormData(req),
        };
        reply = await route.handler(ctx);
      } catch (error) {
        reply = errorReply(error, requestId);
      }
      status = reply.status;
      writeReply(req, res, { ...reply, headers: { ...reply.headers, 'x-request-id': requestId } } as Reply);
    } catch (error) {
      logger.error('failed to write response', { requestId, ...errorFields(error) });
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":{"code":"internal_error"}}');
    } finally {
      logger.info('request', { requestId, route: routeName, status, ms: Math.round(performance.now() - started), ip, userId });
    }
  }

  const server = createServer((req, res) => {
    void handle(req, res);
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 60_000;
  server.keepAliveTimeout = 5_000;

  return {
    server,
    router,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          const address = server.address();
          if (address && typeof address === 'object') resolve({ host: address.address, port: address.port });
          else reject(new Error('server has no address'));
        });
      }),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      }),
  };
}

export type { RawReply };
