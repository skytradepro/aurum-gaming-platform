import { serverApiFetch } from '@/lib/api-server';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { PlayerEntry, PublicConfig } from '@/lib/types';
import { formatDateTime, isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function TransactionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('wallet');
  let items: PlayerEntry[] = [];
  let config: PublicConfig | null = null;
  try {
    config = await serverApiFetch<PublicConfig>('/public/config', { locale });
    const page = await serverApiFetch<{ items: PlayerEntry[] }>('/account/transactions?limit=100', { locale });
    items = page.items;
  } catch {
    items = [];
  }
  const curCode = items[0]?.amount.currency;
  const cur = findCurrency(config?.currencies ?? [], curCode);

  return (
    <>
      <h2>{t('history')}</h2>
      {items.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <table className="card" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>{t('columns.date')}</th>
              <th>{t('columns.type')}</th>
              <th>{t('columns.amount')}</th>
              <th>{t('columns.balanceAfter')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{formatDateTime(row.createdAt, locale, { withTime: true })}</td>
                <td>{t(`entryTypes.${row.entryType}` as never)}</td>
                <td className={row.direction === 1 ? 'amount-in' : 'amount-out'}>{row.direction === 1 ? '+' : '−'}{cur ? formatAmountMinor(row.amount.amountMinor, cur, locale, 'full') : row.amount.amountMinor}</td>
                <td>{cur ? formatAmountMinor(row.balanceAfter.amountMinor, cur, locale, 'full') : row.balanceAfter.amountMinor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
