/**
 * The website server: static files, a narrow read-only proxy for API media/public data, and the
 * server-rendered pages (public site, player account, dashboards, shop counter).
 */
import { randomUUID } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { negotiateLocale } from '@aurum/i18n';
import { ApiClient, ApiError } from './api.ts';
import { gameArtSvg, getAsset, reloadAssets } from './assets.ts';
import type { WebConfig } from './config.ts';
import type { Flash, PageCtx, PageResult } from './context.ts';
import { BodyTooLarge, CSRF_COOKIE, clientIp, csrfToken, csrfValid, newCsrfSeed, parseCookies, readForm, sameOrigin, serializeCookie } from './http.ts';
import { DEFAULT_LOCALE, LOCALE_META, isLocale, translator } from './i18n.ts';
import type { Locale } from './i18n.ts';
import { createLogger, errorFields } from './log.ts';
import type { Logger } from './log.ts';
import { errorPage, unavailablePage } from './pages/errors.ts';
import { Router } from './router.ts';
import type { WebRoute } from './router.ts';
import { robotsTxt, sitemapXml } from './pages/seo.ts';
import type { Me, PublicConfig } from './types.ts';

export interface WebServerDeps {
  config: WebConfig;
  routes: readonly WebRoute[];
  logger?: Logger;
}

export interface WebServer {
  server: Server;
  listen(): Promise<{ host: string; port: number }>;
  close(): Promise<void>;
}

const FLASH_COOKIE = 'aurum_flash';
const LOCALE_COOKIE = 'aurum_locale';
const THEME_COOKIE = 'aurum_theme';
const CURRENCY_COOKIE = 'aurum_currency';

function securityHeaders(config: WebConfig, captcha: boolean): Record<string, string> {
  const turnstile = captcha ? ' https://challenges.cloudflare.com' : '';
  const csp = [
    "default-src 'self'",
    `script-src 'self'${turnstile}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    `frame-src ${captcha ? turnstile.trim() : "'none'"}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    ...(config.cookieSecure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  return {
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'cross-origin-opener-policy': 'same-origin',
    ...(config.cookieSecure ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}

function encodeFlash(flash: Flash): string {
  return Buffer.from(JSON.stringify(flash), 'utf8').toString('base64url');
}

function decodeFlash(value: string | undefined): Flash | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Flash;
    if (!['success', 'error', 'info'].includes(parsed.kind) || typeof parsed.key !== 'string' || !/^[\w.]+$/.test(parsed.key)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createWebServer(deps: WebServerDeps): WebServer {
  const { config } = deps;
  const logger = deps.logger ?? createLogger(config.logLevel);
  const router = new Router();
  router.add(deps.routes);

  // public configuration (languages, currencies, countries, switches) changes rarely: cache it briefly
  let configCache: { value: PublicConfig; at: number } | null = null;
  async function publicConfig(api: ApiClient): Promise<PublicConfig> {
    if (configCache && Date.now() - configCache.at < 15_000) return configCache.value;
    const value = await api.get<PublicConfig>('/v1/public/config');
    configCache = { value, at: Date.now() };
    return value;
  }

  function send(res: ServerResponse, status: number, headers: Record<string, string | string[]>, body?: string | Buffer, head = false): void {
    res.writeHead(status, headers);
    res.end(head ? undefined : body);
  }

  /** GET-only pass-through for images and public JSON (used by uploaded banners and promotions). */
  function proxy(req: IncomingMessage, res: ServerResponse, path: string, ip: string): void {
    const target = new URL(path.replace(/^\/api/, ''), config.apiUrl);
    const lib = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const upstream = lib(
      target,
      { method: req.method, headers: { accept: String(req.headers.accept ?? '*/*'), 'x-forwarded-for': ip, 'user-agent': String(req.headers['user-agent'] ?? '').slice(0, 400) }, timeout: 20_000 },
      (response) => {
        const headers: Record<string, string> = {};
        for (const name of ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified', 'content-security-policy', 'x-content-type-options']) {
          const value = response.headers[name];
          if (typeof value === 'string') headers[name] = value;
        }
        res.writeHead(response.statusCode ?? 502, headers);
        response.pipe(res);
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) send(res, 502, { 'content-type': 'text/plain; charset=utf-8' }, 'Bad gateway');
      else res.destroy();
    });
    upstream.end();
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = randomUUID();
    const started = Date.now();
    const ip = clientIp(req, config.trustProxyHops);
    let status = 500;
    let url: URL;
    try {
      url = new URL(req.url ?? '/', config.publicOrigin);
    } catch {
      send(res, 400, { 'content-type': 'text/plain' }, 'Bad request');
      return;
    }
    const method = req.method ?? 'GET';
    const head = method === 'HEAD';
    const path = url.pathname;
    try {
      // ---- infrastructure routes ------------------------------------------------------------
      if (path === '/healthz') {
        status = 200;
        send(res, 200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, 'ok', head);
        return;
      }
      if (path.startsWith('/assets/')) {
        if (config.env === 'development') reloadAssets();
        const asset = getAsset(path.slice('/assets/'.length));
        if (!asset || (method !== 'GET' && !head)) {
          status = 404;
          send(res, 404, { 'content-type': 'text/plain' }, 'Not found', head);
          return;
        }
        status = 200;
        const versioned = url.searchParams.get('v') === asset.hash;
        send(res, 200, { 'content-type': asset.type, 'content-length': String(asset.body.length), 'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300', 'x-content-type-options': 'nosniff' }, asset.body, head);
        return;
      }
      if (path === '/art/game.svg') {
        status = 200;
        send(res, 200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'x-content-type-options': 'nosniff' }, gameArtSvg(url.searchParams), head);
        return;
      }
      if ((path.startsWith('/api/v1/media/') || path.startsWith('/api/v1/public/')) && (method === 'GET' || head)) {
        status = 200;
        proxy(req, res, `${path}${url.search}`, ip);
        return;
      }
      if (path === '/favicon.ico') {
        const asset = getAsset('favicon.svg');
        status = asset ? 200 : 404;
        send(res, status, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' }, asset?.body ?? 'Not found', head);
        return;
      }

      const cookies = parseCookies(req.headers.cookie);
      const api = new ApiClient({
        baseUrl: config.apiUrl,
        origin: config.publicOrigin,
        sessionCookieName: config.sessionCookie,
        sessionToken: cookies[config.sessionCookie] ?? null,
        clientIp: ip,
        userAgent: String(req.headers['user-agent'] ?? ''),
        requestId,
      });

      let pc: PublicConfig;
      try {
        pc = await publicConfig(api);
      } catch (error) {
        logger.error('api unavailable', { requestId, ...errorFields(error) });
        const locale = isLocale(path.split('/')[1]) ? (path.split('/')[1] as Locale) : DEFAULT_LOCALE;
        status = 503;
        send(res, 503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '30', ...securityHeaders(config, false) }, unavailablePage(locale).value, head);
        return;
      }
      const enabled = pc.languages.map((l) => l.code).filter(isLocale);
      const defaultLocale = (pc.languages.find((l) => l.isDefault)?.code ?? DEFAULT_LOCALE) as Locale;

      if (path === '/robots.txt') {
        status = 200;
        send(res, 200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' }, robotsTxt(config), head);
        return;
      }
      if (path === '/sitemap.xml') {
        status = 200;
        send(res, 200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' }, sitemapXml(config, enabled), head);
        return;
      }

      // ---- language prefix ----------------------------------------------------------------
      const first = path.split('/')[1] ?? '';
      if (!isLocale(first) || !enabled.includes(first)) {
        const preferred = cookies[LOCALE_COOKIE];
        const locale = isLocale(preferred) && enabled.includes(preferred) ? preferred : negotiateLocale(req.headers['accept-language'], defaultLocale);
        const chosen = enabled.includes(locale) ? locale : defaultLocale;
        const rest = isLocale(first) ? path.slice(first.length + 1) : path;
        status = 302;
        send(res, 302, { location: `/${chosen}${rest === '' || rest === '/' ? '/' : rest}${url.search}`, 'cache-control': 'no-store' });
        return;
      }
      const locale = first;
      if (path === `/${locale}`) {
        status = 301;
        send(res, 301, { location: `/${locale}/${url.search}` });
        return;
      }
      const pagePath = path.slice(locale.length + 1) || '/';

      // ---- the signed-in user -------------------------------------------------------------
      let me: Me | null = null;
      if (api.sessionToken) {
        try {
          me = (await api.get<{ user: Me }>('/v1/auth/me')).user;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status >= 500) throw error;
          me = null; // expired or revoked: the browser gets the cookie cleared below
        }
      }

      const setCookies: string[] = [];
      let seed = cookies[CSRF_COOKIE];
      if (!seed || !/^[A-Za-z0-9_-]{32}$/.test(seed)) {
        seed = newCsrfSeed();
        setCookies.push(serializeCookie(CSRF_COOKIE, seed, { secure: config.cookieSecure }));
      }
      if (cookies[LOCALE_COOKIE] !== locale) setCookies.push(serializeCookie(LOCALE_COOKIE, locale, { secure: config.cookieSecure, maxAgeSeconds: 365 * 86_400 }));
      if (api.sessionToken && !me) setCookies.push(serializeCookie(config.sessionCookie, '', { secure: config.cookieSecure, maxAgeSeconds: 0 }));
      const flash = decodeFlash(cookies[FLASH_COOKIE]);
      if (cookies[FLASH_COOKIE]) setCookies.push(serializeCookie(FLASH_COOKIE, '', { secure: config.cookieSecure, maxAgeSeconds: 0 }));

      const currencyCookie = cookies[CURRENCY_COOKIE];
      const displayCurrency =
        (me?.role === 'user' ? me.displayCurrency ?? me.accountCurrency : null) ??
        (currencyCookie && pc.currencies.some((c) => c.code === currencyCookie) ? currencyCookie : null) ??
        pc.currencies[0]?.code ??
        null;

      const ctx: PageCtx = {
        req,
        method,
        url,
        path: pagePath,
        locale,
        dir: LOCALE_META[locale].direction,
        t: translator(locale),
        config,
        logger,
        api,
        publicConfig: pc,
        me,
        ip,
        requestId,
        cookies,
        theme: cookies[THEME_COOKIE] === 'light' ? 'light' : 'dark',
        displayCurrency,
        csrfToken: csrfToken(config.secret, seed),
        flash,
        setCookies,
        form: new URLSearchParams(),
        files: new Map(),
        now: new Date(),
      };

      const matched = router.match(method === 'HEAD' ? 'GET' : method, pagePath);
      let result: PageResult;
      if (!matched) {
        result = errorPage(ctx, 404);
      } else if ('methodNotAllowed' in matched) {
        result = errorPage(ctx, 405);
      } else {
        if (method === 'POST') {
          try {
            const body = await readForm(req);
            ctx.form = body.fields;
            ctx.files = body.files;
          } catch (error) {
            if (error instanceof BodyTooLarge) {
              result = errorPage(ctx, 413);
              return finish(result);
            }
            throw error;
          }
          if (!sameOrigin(req, config.publicOrigin) || !csrfValid(config.secret, seed, ctx.form.get('_csrf'))) {
            logger.warn('csrf check failed', { requestId, path: pagePath, ip });
            return finish(errorPage(ctx, 403, 'errors.csrf'));
          }
        }
        try {
          result = await matched.route.handler(ctx, matched.params);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            result = { kind: 'redirect', location: `/${locale}/login?next=${encodeURIComponent(pagePath + url.search)}`, status: 303 };
          } else if (error instanceof ApiError && error.code === 'password_change_required') {
            result = { kind: 'redirect', location: `/${locale}/account/password?forced=1`, status: 303 };
          } else if (error instanceof ApiError && error.status === 403) {
            result = errorPage(ctx, 403);
          } else if (error instanceof ApiError && error.status === 404) {
            result = errorPage(ctx, 404);
          } else if (error instanceof ApiError && error.status === 429) {
            result = errorPage(ctx, 429);
          } else {
            logger.error('page failed', { requestId, path: pagePath, ...errorFields(error), ...(error instanceof ApiError ? { apiCode: error.code, apiRequestId: error.requestId } : {}) });
            result = errorPage(ctx, 500);
          }
        }
      }
      return finish(result);

      function finish(r: PageResult): void {
        const cookiesOut = [...api.setCookies, ...setCookies];
        if (r.kind === 'redirect') {
          if (r.flash) cookiesOut.push(serializeCookie(FLASH_COOKIE, encodeFlash(r.flash), { secure: config.cookieSecure, maxAgeSeconds: 120 }));
          status = r.status ?? 303;
          send(res, status, { location: r.location, 'cache-control': 'no-store', ...(cookiesOut.length ? { 'set-cookie': cookiesOut } : {}) });
          return;
        }
        if (r.kind === 'raw') {
          status = r.status;
          send(res, r.status, { ...securityHeaders(config, false), 'cache-control': 'no-store', ...r.headers, ...(cookiesOut.length ? { 'set-cookie': cookiesOut } : {}) }, r.body, head);
          return;
        }
        status = r.status;
        const body = `<!doctype html>\n${r.body.value}`;
        send(
          res,
          r.status,
          {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            ...securityHeaders(config, pc.captcha.enabled),
            ...r.headers,
            ...(cookiesOut.length ? { 'set-cookie': cookiesOut } : {}),
          },
          body,
          head,
        );
      }
    } catch (error) {
      logger.error('request failed', { requestId, path, ...errorFields(error) });
      if (!res.headersSent) send(res, 500, { 'content-type': 'text/plain; charset=utf-8' }, 'Internal error');
      else res.end();
    } finally {
      logger.info('request', { requestId, method, path, status, ms: Date.now() - started, ip });
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
