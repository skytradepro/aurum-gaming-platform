import { Link, redirect } from '@/i18n/routing';
import { getSessionUser, isCashier, isPlayer, isStaff } from '@/lib/auth';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { WelcomeJoker } from '@/components/WelcomeJoker';
import { serverApiFetch } from '@/lib/api-server';
import type { PublicConfig } from '@/lib/types';

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (!user) return redirect({ href: '/login', locale });
  if (isStaff(user)) return redirect({ href: '/skyx/enter', locale });
  if (isCashier(user)) return redirect({ href: '/shop', locale });
  if (!isPlayer(user)) return redirect({ href: '/login', locale });

  const t = await getTranslations('account');
  const config = await serverApiFetch<PublicConfig>('/public/config', { locale }).catch(() => null);
  const tb = await getTranslations('bets');
  const links = [
    { href: '/account', label: t('overview') },
    { href: '/account/bets', label: tb('myBets') },
    { href: '/account/transactions', label: t('transactions') },
    { href: '/account/withdrawals', label: t('withdrawals') },
    { href: '/account/profile', label: t('profile') },
    { href: '/account/security', label: t('security') },
  ];

  return (
    <>
      <h1>{t('title')}</h1>
      <nav className="site-footer-nav" style={{ marginBottom: '1rem' }}>
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
        <Link href="/account/deposits">{t('deposits')}</Link>
      </nav>
      <Suspense fallback={null}>
        <WelcomeJoker currencies={config?.currencies ?? []} locale={locale} />
      </Suspense>
      {children}
    </>
  );
}
