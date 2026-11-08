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
const LOCALE_RE = `(?:${routing.locales.join('|')})`;
const ADMIN_RE = new RegExp(`^/(?:(${LOCALE_RE})/)?admin(?:/|$)`);
const SECRET_RE = SECRET_OK ? new RegExp(`^/(?:(${LOCALE_RE})/)?${SECRET}/?$`) : null;

let cached: { enabled: boolean; at: number } | null = null;
async function gateEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.at < 5000) return cached.enabled;
  try {
    const res = await fetch(`${API}/v1/public/admin-gate`, { cache: 'no-store' });
    const body = (await res.json()) as { data?: { enabled?: boolean } };
    cached = { enabled: body.data?.enabled === true, at: Date.now() };
  } catch {
    // API unreachable: keep the admin panel closed rather than open.
    cached = { enabled: true, at: Date.now() };
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
    if (a && req.cookies.get(COOKIE)?.value !== SECRET && (await gateEnabled())) {
      const locale = a[1] ?? routing.defaultLocale;
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
