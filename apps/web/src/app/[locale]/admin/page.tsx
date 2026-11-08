import { serverApiFetch } from '@/lib/api-server';
import type { DashboardSummary } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  let dash: DashboardSummary | null = null;
  try {
    dash = await serverApiFetch<DashboardSummary>('/admin/dashboard', { locale });
  } catch {
    dash = null;
  }

  if (!dash) return <p>{t('noAccess')}</p>;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="card">
        <h2>{t('dashboard')}</h2>
        <p>
          {t('totalPlayers')}: {dash.players.total} ({t('newLast7Days')}: {dash.players.newLast7Days})
        </p>
      </div>
      <div className="card">
        <h3>{t('balancesByCurrency')}</h3>
        <ul>
          {dash.balances.map((b) => (
            <li key={b.currency}>
              {b.currency}: {b.wallets} wallets — {b.total.amountMinor} minor units
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>{t('shopCashByCurrency')}</h3>
        <ul>
          {dash.shopCash.map((s) => (
            <li key={s.currency}>
              {s.currency}: {s.activeShops}/{s.shops} shops — {s.total.amountMinor}
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>{t('pendingByCurrency')}</h3>
        <ul>
          {dash.pendingWithdrawals.map((p) => (
            <li key={p.currency}>
              {p.currency}: {p.count} — {p.total.amountMinor}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
