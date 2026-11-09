'use client';

import { Link, usePathname } from '@/i18n/routing';

const TONE: Record<string, string> = {
  '/admin': 'dash',
  '/admin/players': 'players',
  '/admin/shops': 'shops',
  '/admin/withdrawals': 'withdrawals',
  '/admin/bets': 'bets',
  '/admin/ledger': 'ledger',
  '/admin/banners': 'content',
  '/admin/videos': 'content',
  '/admin/promotions': 'content',
  '/admin/staff': 'staff',
  '/admin/games': 'rules',
  '/admin/audit': 'audit',
  '/admin/settings': 'settings',
  '/admin/security': 'security',
};

export function AdminNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin">
      {links.map((l) => {
        const active = path === l.href || (l.href !== '/admin' && path.startsWith(l.href));
        const tone = TONE[l.href] ?? 'default';
        return (
          <Link key={l.href} href={l.href} className={`admin-nav-pill tone-${tone}${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
