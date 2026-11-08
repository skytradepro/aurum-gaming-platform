import { absoluteUrl } from '@/lib/absolute-url';
import { getSessionUser, isStaff } from '@/lib/auth';
import { isLocale } from '@aurum/i18n';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Opens the admin panel for a signed-in admin / super admin: sets the secret-link cookie on the
 * server (the secret itself never reaches the browser's page code) and redirects to /admin.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'en';
  const user = await getSessionUser();
  if (!user || !isStaff(user)) return NextResponse.redirect(absoluteUrl(req, `/${locale}/skyx`));

  const res = NextResponse.redirect(absoluteUrl(req, `/${locale}/admin`));
  const secret = (process.env.ADMIN_SECRET_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (/^[a-z0-9-]{16,80}$/.test(secret)) {
    res.cookies.set('hb_admin_gate', secret, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 12,
    });
  }
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
