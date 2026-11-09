import { absoluteUrl } from './lib/absolute-url';
import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

/**
 * Secret admin link.
 * ADMIN_SECRET_PATH (apps/web/.env.local) is the hidden address, e.g. "hb-panel-x7k2…".
 * When the Super Admin switches "Secret admin link" on (Admin → Settings), /admin answers 404
 * unless the browser first opened /<secret>, which sets a cookie and redirects to the admin panel.
 * Without ADMIN_SECRET_PATH, nothing changes. Admin API calls stay protected by login as before.
 */
const SECRET = (process.env.ADMIN_SECRET_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
const SECRET_OK = /^[a-z0-9-]{16,80}$/.test(SECRET);
const COOKIE = 'hb_admin_gate';
const API = (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
/** Local only: set ADMIN_LOCAL_OPEN=1 in apps/web/.env.local to open /admin without the secret cookie (production unchanged). */
const LOCAL_ADMIN_OPEN = process.env.NODE_ENV === 'development' && process.env.ADMIN_LOCAL_OPEN === '1';
const LOCALE_RE = `(?:${routing.locales.join('|')})`;
const ADMIN_RE = new RegExp(`^/(?:(${LOCALE_RE})/)?admin(?:/|$)`);
const SECRET_RE = SECRET_OK ? new RegExp(`^/(?:(${LOCALE_RE})/)?${SECRET}/?$`) : null;

async function staffSession(req: NextRequest): Promise<boolean> {
  try {
    const res = await fetch(`${API}/v1/auth/me`, {
      headers: { cookie: req.headers.get('cookie') ?? '', accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { data?: { user?: { role?: string } }; user?: { role?: string } };
    const role = body.data?.user?.role ?? body.user?.role;
    return role === 'admin' || role === 'super_admin';
  } catch {
    return false;
  }
}

let cached: { enabled: boolean; at: number } | null = null;
async function gateEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.at < 5000) return cached.enabled;
  try {
    const res = await fetch(`${API}/v1/public/admin-gate`, { cache: 'no-store' });
    const body = (await res.json()) as { data?: { enabled?: boolean } };
    cached = { enabled: body.data?.enabled === true, at: Date.now() };
  } catch {
    // Prod: fail closed. Local dev: do not block /admin when the API is temporarily down.
    const enabled = process.env.NODE_ENV === 'production';
    cached = { enabled, at: Date.now() };
  }
  return cached.enabled;
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (SECRET_RE) {
    const s = SECRET_RE.exec(pathname);
    if (s) {
      const locale = s[1] ?? routing.defaultLocale;
      const res = NextResponse.redirect(absoluteUrl(req, `/${locale}/admin`));
      res.cookies.set(COOKIE, SECRET, {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 60 * 60 * 12,
      });
      return res;
    }
    const a = ADMIN_RE.exec(pathname);
    if (a && req.cookies.get(COOKIE)?.value !== SECRET && (await gateEnabled()) && !LOCAL_ADMIN_OPEN) {
      const locale = a[1] ?? routing.defaultLocale;
      if (await staffSession(req)) {
        return NextResponse.redirect(absoluteUrl(req, `/${locale}/skyx/enter`));
      }
      // Show the site's normal "page not found" screen instead of the admin panel.
      const target = absoluteUrl(req, `/${locale}/page-not-found`);
      const viaIntl = intl(new NextRequest(target, req));
      if (viaIntl.headers.get('x-middleware-rewrite')) return viaIntl;
      const headers = new Headers(viaIntl.headers);
      headers.delete('x-middleware-next');
      return NextResponse.rewrite(target, { headers });
    }
  }

  return intl(req);
}

export const config = {
  matcher: ['/', '/(ar|en|fr|ru|tr)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
