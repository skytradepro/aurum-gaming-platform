'use client';

import { Link, usePathname } from '@/i18n/routing';
import type { Locale } from '@aurum/i18n';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import { convertForDisplay } from '@/lib/rates';
import type { PublicRate } from '@/lib/rates';
import type { MeUser, PublicConfig } from '@/lib/types';
import { CurrencySwitcher } from './CurrencySwitcher';
import { Dropdown } from './Dropdown';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { LocaleSwitcher } from './LocaleSwitcher';
import { ThemeToggle } from './ThemeToggle';

const NAV: { href: string; key: 'home' | 'sportsBetting' | 'liveBetting' | 'casino' | 'liveCasino' | 'virtuals' | 'promotions'; icon: IconName }[] = [
  { href: '/', key: 'home', icon: 'home' },
  { href: '/sports', key: 'sportsBetting', icon: 'sports' },
  { href: '/live-betting', key: 'liveBetting', icon: 'live' },
  { href: '/casino', key: 'casino', icon: 'casino' },
  { href: '/live-casino', key: 'liveCasino', icon: 'liveCasino' },
  { href: '/promotions', key: 'promotions', icon: 'promo' },
];

const BOTTOM = ['/', '/sports', '/casino', '/live-casino'] as const;

export function SiteHeader({
  locale,
  user,
  config,
  displayCurrency,
  rates,
  staffCredit = null,
}: {
  locale: Locale;
  user: MeUser | null;
  config: PublicConfig | null;
  displayCurrency: string;
  rates: PublicRate[];
  /** a shop admin's own balance (given by the Super Admin), shown instead of a player balance */
  staffCredit?: { text: string; empty: boolean } | null;
}) {
  const t = useTranslations('nav');
  const tm = useTranslations('meta');
  const tc = useTranslations('common');
  const tw = useTranslations('wallet');
  const ta = useTranslations('appInstall');
  const ts = useTranslations('staffCredit');
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawer]);

  const staffHref =
    user && (user.role === 'admin' || user.role === 'super_admin')
      ? '/skyx/enter'
      : user?.role === 'cashier'
        ? '/shop'
        : null;
  const walletCur = user?.wallet ? findCurrency(config?.currencies ?? [], user.wallet.balance.currency) : undefined;
  const showCur = findCurrency(config?.currencies ?? [], displayCurrency);
  const convertedMinor = user?.wallet && walletCur && showCur ? convertForDisplay(user.wallet.balance.amountMinor, walletCur, showCur, rates) : null;
  const balanceText =
    user?.role === 'user' && user.wallet
      ? convertedMinor && showCur
        ? `≈ ${formatAmountMinor(convertedMinor, showCur, locale, 'full')}`
        : walletCur
          ? formatAmountMinor(user.wallet.balance.amountMinor, walletCur, locale, 'full')
          : `${user.wallet.balance.amountMinor} ${user.wallet.balance.currency}`
      : null;
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <button type="button" className="icon-btn menu-btn" aria-label={tc('openMenu')} onClick={() => setDrawer(true)}>
            <Icon name="menu" />
          </button>

          <Link href="/" className="site-logo" aria-label={t('home')}>
            <img className="site-logo-mark site-logo-img" src="/media/hannibal-logo-192.png" alt="" width={44} height={44} />
            <span className="site-logo-text">{tm('logoText')}</span>
          </Link>

          <nav className="site-nav" aria-label={t('mainNavigation')}>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(item.href) ? 'site-nav-link active' : 'site-nav-link'}>
                <Icon name={item.icon} />
                {t(item.key)}
              </Link>
            ))}
          </nav>

          <div className="site-header-actions">
            <ThemeToggle />
            <LocaleSwitcher current={locale} languages={config?.languages ?? []} />
            <CurrencySwitcher currencies={config?.currencies ?? []} locale={locale} initial={displayCurrency} />
            {balanceText ? (
              <Link href="/account" className="balance-chip" title={tw('balance')}>
                {balanceText}
              </Link>
            ) : null}
            {staffCredit ? (
              <Link href="/admin/players" className={staffCredit.empty ? 'balance-chip staff-chip is-empty' : 'balance-chip staff-chip'} title={ts('mine')}>
                <Icon name="shop" />
                <span dir="ltr">{staffCredit.text}</span>
              </Link>
            ) : null}
            {user?.role === 'user' ? (
              <Link href="/account/deposits" className="deposit-btn" title={t('deposit')} aria-label={t('deposit')}>
                <b aria-hidden="true">+</b>
                <span className="deposit-word">{t('deposit')}</span>
              </Link>
            ) : null}
            {user ? (
              <Dropdown
                label={t('account')}
                trigger={
                  <>
                    <Icon name="user" />
                    <span className="user-name">{user.username}</span>
                  </>
                }
              >
                {(close) => (
                  <>
                    {staffHref ? (
                      <Link href={staffHref} role="menuitem" className="dropdown-item" onClick={close}>
                        {user.role === 'cashier' ? t('shop') : t('admin')}
                      </Link>
                    ) : null}
                    {user.role === 'user' ? (
                      <Link href="/account" role="menuitem" className="dropdown-item" onClick={close}>
                        {t('account')}
                      </Link>
                    ) : null}
                    {user.role === 'user' ? (
                      <Link href="/account/deposits" role="menuitem" className="dropdown-item" onClick={close}>
                        {t('deposit')}
                      </Link>
                    ) : null}
                    <button type="button" role="menuitem" className="dropdown-item" onClick={() => void handleLogout(locale)}>
                      {t('logout')}
                    </button>
                  </>
                )}
              </Dropdown>
            ) : (
              <>
                <Link href="/login" className="btn btn-dark btn-sm">
                  {t('login')}
                </Link>
                <Link href="/register" className="btn btn-gold btn-sm">
                  {t('register')}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {drawer ? (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <aside className="drawer" aria-label={t('mainNavigation')}>
            <div className="drawer-head">
              <span className="site-logo">
                <img className="site-logo-mark site-logo-img" src="/media/hannibal-logo-192.png" alt="" width={44} height={44} />
                <span className="site-logo-text">{tm('logoText')}</span>
              </span>
              <button type="button" className="icon-btn" aria-label={tc('closeMenu')} onClick={() => setDrawer(false)}>
                <Icon name="close" />
              </button>
            </div>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(item.href) ? 'drawer-link active' : 'drawer-link'}>
                <Icon name={item.icon} />
                {t(item.key)}
              </Link>
            ))}
            <Link href="/shops" className="drawer-link">
              <Icon name="shop" />
              {t('shops')}
            </Link>
            <Link href="/app" className="drawer-link drawer-app">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/media/app/icon-192.png" alt="" width={22} height={22} />
              {ta('footerLink')}
            </Link>
            <div className="drawer-foot">
              {user ? (
                <>
                  {staffHref ? (
                    <Link href={staffHref} className="btn btn-ghost">
                      {user.role === 'cashier' ? t('shop') : t('admin')}
                    </Link>
                  ) : null}
                  <Link href="/account" className="btn btn-dark">
                    {t('account')}
                  </Link>
                  <button type="button" className="btn btn-ghost" onClick={() => void handleLogout(locale)}>
                    {t('logout')}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/register" className="btn btn-gold">
                    {t('register')}
                  </Link>
                  <Link href="/login" className="btn btn-dark">
                    {t('login')}
                  </Link>
                </>
              )}
            </div>
          </aside>
        </>
      ) : null}

      <nav className="bottom-nav" aria-label={t('mainNavigation')}>
        {BOTTOM.map((href) => {
          const item = NAV.find((n) => n.href === href);
          if (!item) return null;
          return (
            <Link key={href} href={href} className={isActive(href) ? 'active' : undefined}>
              <Icon name={item.icon} />
              {t(item.key)}
            </Link>
          );
        })}
        <button type="button" onClick={() => setDrawer(true)}>
          <Icon name="menu" />
          {tc('more')}
        </button>
      </nav>
    </>
  );
}

async function handleLogout(locale: Locale) {
  await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include', headers: { 'x-aurum-client': 'web' } });
  window.location.href = `/${locale}`;
}
