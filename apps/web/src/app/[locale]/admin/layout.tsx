import { Link, redirect } from '@/i18n/routing';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminSessionGuard } from '@/components/admin/AdminSessionGuard';
import { Icon } from '@/components/Icon';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser, hasPermission, isStaff } from '@/lib/auth';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (!user) return redirect({ href: '/login', locale });
  if (!isStaff(user)) return redirect({ href: '/account', locale });
  const t = await getTranslations('admin');
  const tc = await getTranslations('adminContent');
  const tb = await getTranslations('bets');
  const tv = await getTranslations('adminVideos');

  const links = [
    { href: '/admin', label: t('dashboard'), ok: hasPermission(user, 'reports.view') },
    { href: '/admin/players', label: t('players'), ok: hasPermission(user, 'users.view', 'users.manage') },
    { href: '/admin/shops', label: t('shops'), ok: hasPermission(user, 'shops.view', 'shops.manage') },
    { href: '/admin/withdrawals', label: t('withdrawals'), ok: hasPermission(user, 'withdrawals.view', 'withdrawals.manage') },
    { href: '/admin/bets', label: tb('adminTitle'), ok: hasPermission(user, 'reports.view') },
    { href: '/admin/ledger', label: t('ledger'), ok: hasPermission(user, 'balances.view') },
    { href: '/admin/banners', label: t('banners'), ok: hasPermission(user, 'banners.manage') },
    { href: '/admin/videos', label: tv('title'), ok: hasPermission(user, 'banners.manage') },
    { href: '/admin/promotions', label: t('promotions'), ok: hasPermission(user, 'promotions.manage') },
    { href: '/admin/staff', label: tc('staff'), ok: user.role === 'super_admin' },
    { href: '/admin/games', label: tc('gameRules'), ok: user.role === 'super_admin' || user.role === 'admin' },
    { href: '/admin/audit', label: t('audit'), ok: hasPermission(user, 'audit.view') },
    { href: '/admin/settings', label: t('settings'), ok: user.role === 'super_admin' },
    { href: '/admin/security', label: t('security'), ok: true },
  ].filter((l) => l.ok);

  let twoFactorOn = true;
  try {
    twoFactorOn = (await serverApiFetch<{ enabled: boolean }>('/account/2fa', { locale })).enabled;
  } catch {
    twoFactorOn = true;
  }
  const t2 = await getTranslations('twoFactor');

  const tShop = await getTranslations('skyx');

  const shellClass =
    user.role === 'super_admin' ? 'admin-shell admin-shell--principal' : user.role === 'admin' ? 'admin-shell admin-shell--shop' : 'admin-shell';

  return (
    <div className={shellClass}>
      <AdminSessionGuard />
      {user.role === 'admin' ? (
        <h1 className="admin-shop-title">
          <span className="admin-shop-logo" aria-hidden="true">
            <Icon name="shop" />
          </span>
          {tShop('title')}
          <small className="admin-shop-user" dir="ltr">
            {user.username}
          </small>
        </h1>
      ) : (
        <h1>{t('title')}</h1>
      )}
      <AdminNav links={links.map((l) => ({ href: l.href, label: l.label }))} />
      {!twoFactorOn ? (
        <Link href="/admin/security" className="alert alert-error twofa-banner">
          {t2('staffWarning')}
        </Link>
      ) : null}
      <div className="admin-area">{children}</div>
    </div>
  );
}
