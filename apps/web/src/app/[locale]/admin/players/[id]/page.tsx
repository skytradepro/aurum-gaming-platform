import { BalanceForm } from '@/components/admin/BalanceForm';
import { ResetPasswordButton } from '@/components/admin/ResetPasswordButton';
import { Link } from '@/i18n/routing';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser, hasPermission } from '@/lib/auth';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { PublicConfig } from '@/lib/types';
import { formatDateTime, isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface MoneyView {
  amountMinor: string;
  currency: string;
}

interface LedgerRow {
  id: string;
  createdAt: string;
  entryType: string;
  direction: 1 | -1;
  amount: MoneyView;
  balanceBefore: MoneyView;
  balanceAfter: MoneyView;
  reference: string | null;
  reason: string | null;
  operator: { username: string } | null;
}

export default async function AdminPlayerDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  const tc = await getTranslations('adminContent');
  const tw = await getTranslations('wallet');
  const staff = await getSessionUser();
  try {
    const { player } = await serverApiFetch<{
      player: {
        id: string;
        accountNo: string;
        username: string;
        email: string;
        firstName: string;
        lastName: string;
        status: string;
        accountCurrency: string | null;
        wallets: { currency: string; balance: MoneyView }[];
      };
    }>(`/admin/players/${id}`, { locale });

    let config: PublicConfig | null = null;
    try {
      config = await serverApiFetch<PublicConfig>('/public/config', { locale });
    } catch {
      config = null;
    }
    const fmt = (m: MoneyView): string => {
      const cur = findCurrency(config?.currencies ?? [], m.currency);
      return cur ? formatAmountMinor(m.amountMinor, cur, locale, 'full') : `${m.amountMinor} ${m.currency} (minor)`;
    };

    let entries: LedgerRow[] = [];
    if (staff && hasPermission(staff, 'balances.view', 'balances.manage')) {
      try {
        entries = (await serverApiFetch<{ items: LedgerRow[] }>(`/admin/players/${id}/ledger?limit=20`, { locale })).items;
      } catch {
        entries = [];
      }
    }
    const wallet = player.wallets[0];
    const canPost = Boolean(staff && wallet && hasPermission(staff, 'balances.manage'));
    const canResetPw = Boolean(staff && hasPermission(staff, 'users.manage'));

    return (
      <>
        <p>
          <Link href="/admin/players">← {t('players')}</Link>
        </p>
        <div className="card">
          <h2>
            {`${player.firstName} ${player.lastName}`.trim() ? `${`${player.firstName} ${player.lastName}`.trim()} (${player.username})` : player.username}
          </h2>
          <p>Account: {player.accountNo}</p>
          <p>Email: {player.email}</p>
          <p>Status: {player.status}</p>
          <p>Currency: {player.accountCurrency ?? '—'}</p>
          <ul>
            {player.wallets.map((w) => (
              <li key={w.currency}>
                <strong>{tw('balance')}:</strong> {fmt(w.balance)}
              </li>
            ))}
          </ul>
        </div>

        {canResetPw ? <ResetPasswordButton userId={player.id} username={player.username} /> : null}

        {canPost && wallet ? <BalanceForm userId={player.id} username={player.username} currency={wallet.currency} balanceMinor={wallet.balance.amountMinor} decimals={findCurrency(config?.currencies ?? [], wallet.currency)?.decimals ?? 2} /> : null}

        <div className="card">
          <h3>{tc('recentEntries')}</h3>
          {entries.length === 0 ? (
            <p className="muted">{tw('empty')}</p>
          ) : (
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>{tw('columns.date')}</th>
                  <th>{tw('columns.type')}</th>
                  <th>{tw('columns.amount')}</th>
                  <th>{tw('columns.balanceBefore')}</th>
                  <th>{tw('columns.balanceAfter')}</th>
                  <th>{tw('columns.reason')}</th>
                  <th>{tw('columns.operator')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateTime(e.createdAt, locale)}</td>
                    <td>{tw(`entryTypes.${e.entryType}` as never)}</td>
                    <td>
                      {e.direction === 1 ? '+' : '−'}
                      {fmt(e.amount)}
                    </td>
                    <td>{fmt(e.balanceBefore)}</td>
                    <td>{fmt(e.balanceAfter)}</td>
                    <td>{e.reason ?? e.reference ?? '—'}</td>
                    <td>{e.operator?.username ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  } catch {
    notFound();
  }
}
