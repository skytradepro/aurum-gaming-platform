import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO, PlayerEntry, PublicConfig } from '@/lib/types';
import { formatDateTime, isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { notFound } from 'next/navigation';

export default async function AccountOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('account');
  const tWallet = await getTranslations('wallet');
  const user = await getSessionUser();
  if (!user?.wallet) return null;

  let config: PublicConfig | null = null;
  let recent: PlayerEntry[] = [];
  try {
    config = await serverApiFetch<PublicConfig>('/public/config', { locale });
    const tx = await serverApiFetch<{ items: PlayerEntry[] }>('/account/transactions?limit=5', { locale });
    recent = tx.items;
  } catch {
    config = null;
  }

  const cur = findCurrency(config?.currencies ?? [], user.wallet.currency);
  const balance = cur ? formatAmountMinor(user.wallet.balance.amountMinor, cur, locale, 'full') : user.wallet.balance.amountMinor;

  return (
    <>
      <div className="card">
        <p>
          {t('accountNumber')}: <strong>{user.accountNo}</strong>
        </p>
        <p>
          {t('balance')}: <strong>{balance}</strong>
        </p>
        <p>{t('accountCurrencyNote', { currency: user.accountCurrency ?? user.wallet.currency })}</p>
        <div className="acct-money-actions">
          <Link href="/account/deposits" className="deposit-btn">
            <b aria-hidden="true">+</b> {t('deposits')}
          </Link>
          <Link href="/account/withdrawals" className="btn btn-ghost btn-sm">
            {t('withdrawals')}
          </Link>
        </div>
      </div>
      <h2>{t('recentTransactions')}</h2>
      {recent.length === 0 ? (
        <p>{tWallet('empty')}</p>
      ) : (
        <table className="card" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>{tWallet('columns.date')}</th>
              <th>{tWallet('columns.type')}</th>
              <th>{tWallet('columns.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((row) => (
              <tr key={row.id}>
                <td>{formatDateTime(row.createdAt, locale, { withTime: true })}</td>
                <td>{tWallet(`entryTypes.${row.entryType}` as never)}</td>
                <td className={row.direction === 1 ? 'amount-in' : 'amount-out'}>{row.direction === 1 ? '+' : '−'}{cur ? formatAmountMinor(row.amount.amountMinor, cur, locale, 'full') : row.amount.amountMinor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        <Link href="/account/transactions">{t('viewAllTransactions')}</Link>
      </p>
    </>
  );
}
