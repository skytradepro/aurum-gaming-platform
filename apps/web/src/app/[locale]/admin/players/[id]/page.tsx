import { BetsList, type BetView } from '@/components/BetsList';
import { AdminPlayerLedger } from '@/components/admin/AdminPlayerLedger';
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
  const tb = await getTranslations('bets');
  const tp = await getTranslations('adminPlayers');
  const tCommon = await getTranslations('common');
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
        entries = (await serverApiFetch<{ items: LedgerRow[] }>(`/admin/players/${id}/ledger?limit=80`, { locale })).items;
      } catch {
        entries = [];
      }
    }
    const wallet = player.wallets[0];
    const canPost = Boolean(staff && wallet && hasPermission(staff, 'balances.manage'));
    const canResetPw = Boolean(staff && hasPermission(staff, 'users.manage'));
  type SportBetSummary = { currency: string; bets: number; staked: string; paid: string; playerNetMinor: string };
  let sportBets: BetView[] = [];
  let sportSummary: SportBetSummary | null = null;
  if (staff && hasPermission(staff, 'reports.view')) {
    try {
      const sport = await serverApiFetch<{ items: BetView[]; summary: SportBetSummary | null }>(`/admin/players/${id}/bets?limit=40`, { locale });
      sportBets = sport.items;
      sportSummary = sport.summary;
    } catch {
      sportBets = [];
    }
  }

    const ledgerRows = entries.map((e) => ({
      id: e.id,
      createdAtLabel: formatDateTime(e.createdAt, locale),
      typeLabel: tw(`entryTypes.${e.entryType}` as never),
      amountLabel: `${e.direction === 1 ? '+' : '−'}${fmt(e.amount)}`,
      balanceBeforeLabel: fmt(e.balanceBefore),
      balanceAfterLabel: fmt(e.balanceAfter),
      detail: e.reason ?? e.reference ?? '—',
      operator: e.operator?.username ?? '—',
      entryType: e.entryType,
      reference: e.reference,
    }));

    const betTitle = (b: BetView): string => {
      const s = b.selections[0];
      if (!s) return `#${b.id}`;
      if (b.kind === 'accumulator' && b.selections.length > 1) {
        return `${s.home} — ${s.away} (+${b.selections.length - 1})`;
      }
      return `${s.home} — ${s.away}`;
    };

    const betNetMinor = (b: BetView): bigint => {
      if (b.status === 'open' || b.status === 'void') return 0n;
      return BigInt(b.payoutMinor) - BigInt(b.stakeMinor);
    };

    return (
      <>
        <p>
          <Link href="/admin/players" className="staff-back">
            ← {t('players')}
          </Link>
        </p>
        <div className="card admin-player-head">
          <h2>
            {`${player.firstName} ${player.lastName}`.trim() ? `${`${player.firstName} ${player.lastName}`.trim()} (${player.username})` : player.username}
          </h2>
          <div className="admin-player-facts">
            <div className="admin-player-fact">
              <span className="muted">{tp('account')}</span>
              <strong dir="ltr">{player.accountNo}</strong>
            </div>
            <div className="admin-player-fact">
              <span className="muted">{tp('status')}</span>
              <strong className={`status-pill status-${player.status}`}>{player.status}</strong>
            </div>
            <div className="admin-player-fact">
              <span className="muted">{tCommon('currency')}</span>
              <strong>{player.accountCurrency ?? '—'}</strong>
            </div>
            {player.wallets.map((w) => (
              <div key={w.currency} className="admin-player-fact">
                <span className="muted">{tw('balance')}</span>
                <strong dir="ltr">{fmt(w.balance)}</strong>
              </div>
            ))}
          </div>
          <p className="muted admin-player-email" dir="ltr">
            {player.email}
          </p>
        </div>

        {canResetPw ? <ResetPasswordButton userId={player.id} username={player.username} /> : null}

        {canPost && wallet ? <BalanceForm userId={player.id} username={player.username} currency={wallet.currency} balanceMinor={wallet.balance.amountMinor} decimals={findCurrency(config?.currencies ?? [], wallet.currency)?.decimals ?? 2} /> : null}

        {staff && hasPermission(staff, 'reports.view') ? (
          <section className="card admin-player-sports">
            <h3>{tp('sportsBets')}</h3>
            <p className="muted">{tp('sportsBetsHint')}</p>
            {sportSummary ? (
              <p className="admin-sports-totals">
                <strong>{sportSummary.currency}</strong> · {tb('count')}: {sportSummary.bets} · {tb('stake')}:{' '}
                {fmt({ amountMinor: sportSummary.staked, currency: sportSummary.currency })} · {tb('paid')}:{' '}
                {fmt({ amountMinor: sportSummary.paid, currency: sportSummary.currency })} · {tp('playerNet')}:{' '}
                <strong dir="ltr">{fmt({ amountMinor: sportSummary.playerNetMinor, currency: sportSummary.currency })}</strong>
              </p>
            ) : (
              <p className="muted">{tb('none')}</p>
            )}
            {sportBets.length > 0 ? (
              <>
                <div className="table-scroll">
                  <table className="admin-dash-table admin-sports-bets-table">
                    <thead>
                      <tr>
                        <th>{tp('colBet')}</th>
                        <th>{tb('stake')}</th>
                        <th>{tp('colWin')}</th>
                        <th>{tp('colLoss')}</th>
                        <th>{tp('colNet')}</th>
                        <th>{tp('status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sportBets.map((b) => {
                        const money = { currency: b.currency, amountMinor: '0' };
                        const stake = { currency: b.currency, amountMinor: b.stakeMinor };
                        const win =
                          b.status === 'won'
                            ? { currency: b.currency, amountMinor: b.payoutMinor }
                            : null;
                        const loss =
                          b.status === 'lost' ? { currency: b.currency, amountMinor: b.stakeMinor } : null;
                        const netMinor = betNetMinor(b);
                        const netClass =
                          netMinor > 0n ? 'is-win' : netMinor < 0n ? 'is-loss' : undefined;
                        return (
                          <tr key={b.id}>
                            <td>{betTitle(b)}</td>
                            <td dir="ltr">{fmt(stake)}</td>
                            <td dir="ltr">{win ? fmt(win) : '—'}</td>
                            <td dir="ltr">{loss ? fmt(loss) : '—'}</td>
                            <td dir="ltr" className={netClass}>
                              {b.status === 'open' || b.status === 'void'
                                ? '—'
                                : fmt({ ...money, amountMinor: netMinor.toString() })}
                            </td>
                            <td>
                              <span className={`status-pill status-${b.status}`}>{b.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <details className="admin-sports-details">
                  <summary>{tp('slipDetails')}</summary>
                  <BetsList bets={sportBets} currencies={config?.currencies ?? []} locale={locale} linkPlayers={false} />
                </details>
              </>
            ) : null}
          </section>
        ) : null}

        {staff && hasPermission(staff, 'balances.view', 'balances.manage') ? (
          <section className="card admin-player-ledger-panel">
            <h3>{tc('recentEntries')}</h3>
            <p className="muted">{tp('ledgerFilterHint')}</p>
            {ledgerRows.length === 0 ? (
              <p className="muted">{tw('empty')}</p>
            ) : (
              <AdminPlayerLedger
                rows={ledgerRows}
                empty={tw('empty')}
                labels={{
                  all: tp('ledgerAll'),
                  sports: tp('ledgerSports'),
                  casino: tp('ledgerCasino'),
                  deposit: tp('ledgerDeposit'),
                  colDate: tw('columns.date'),
                  colType: tw('columns.type'),
                  colAmount: tw('columns.amount'),
                  colBefore: tw('columns.balanceBefore'),
                  colAfter: tw('columns.balanceAfter'),
                  colDetail: tw('columns.reason'),
                  colOperator: tw('columns.operator'),
                }}
              />
            )}
          </section>
        ) : null}
      </>
    );
  } catch {
    notFound();
  }
}
