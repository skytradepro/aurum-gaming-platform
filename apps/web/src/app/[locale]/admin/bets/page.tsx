import { BetsList } from '@/components/BetsList';
import type { BetView } from '@/components/BetsList';
import { serverApiFetch } from '@/lib/api-server';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface Totals {
  currency: string;
  bets: number;
  staked: string;
  paid: string;
}

export default async function AdminBetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('bets');
  const ta = await getTranslations('admin');
  try {
    const config = await serverApiFetch<PublicConfig>('/public/config', { locale });
    const data = await serverApiFetch<{ items: BetView[]; totals: Totals[] }>('/admin/bets?limit=100', { locale });
    return (
      <>
        <h2>{t('adminTitle')}</h2>
        {data.totals.map((x) => {
          const cur = findCurrency(config.currencies, x.currency);
          const fmt = (m: string) => (cur ? formatAmountMinor(m, cur, locale) : `${m} ${x.currency}`);
          const houseMinor = (BigInt(x.staked) - BigInt(x.paid)).toString();
          return (
            <p key={x.currency} className="card">
              <strong>{x.currency}</strong> · {t('count')}: {x.bets} · {t('stake')}: {fmt(x.staked)} · {t('paid')}: {fmt(x.paid)} · {t('houseNet')}:{' '}
              <strong dir="ltr">{fmt(houseMinor)}</strong>
            </p>
          );
        })}
        <BetsList bets={data.items} currencies={config.currencies} locale={locale} />
      </>
    );
  } catch {
    return <p>{ta('noAccess')}</p>;
  }
}
