import { Link } from '@/i18n/routing';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/Icon';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO, DashboardSummary } from '@/lib/types';
import { formatDateTime, type Locale } from '@aurum/i18n';
import { getTranslations } from 'next-intl/server';

const SPORT_TYPES = new Set(['bet_stake', 'bet_win', 'bet_refund']);
const QUICK: { href: string; labelKey: 'players' | 'bets' | 'withdrawals' | 'ledger'; icon: IconName; tone: string }[] = [
  { href: '/admin/players', labelKey: 'players', icon: 'user', tone: 'players' },
  { href: '/admin/bets', labelKey: 'bets', icon: 'sports', tone: 'bets' },
  { href: '/admin/withdrawals', labelKey: 'withdrawals', icon: 'shop', tone: 'withdrawals' },
  { href: '/admin/ledger', labelKey: 'ledger', icon: 'info', tone: 'ledger' },
];

export async function AdminDashboard({
  dash,
  currencies,
  locale,
  username,
  isSuper,
  scopedToShop = false,
}: {
  dash: DashboardSummary;
  currencies: CurrencyDTO[];
  locale: Locale;
  username: string;
  isSuper: boolean;
  /** Shop admin (or super viewing one admin): hide platform-only figures. */
  scopedToShop?: boolean;
}) {
  const t = await getTranslations('admin');
  const tb = await getTranslations('bets');
  const tw = await getTranslations('wallet');
  const tCommon = await getTranslations('common');

  const fmt = (amountMinor: string, code: string) => {
    const cur = findCurrency(currencies, code);
    return cur ? formatAmountMinor(amountMinor, cur, locale, 'full') : `${amountMinor} ${code}`;
  };

  const pendingTotal = dash.pendingWithdrawals.reduce((n, p) => n + p.count, 0);
  const sportRows = dash.recentActivity.filter((a) => SPORT_TYPES.has(a.entryType));
  const sportStake = sportRows.filter((a) => a.entryType === 'bet_stake');
  const sportWin = sportRows.filter((a) => a.entryType === 'bet_win');

  const shellClass = scopedToShop ? 'admin-dash admin-dash--shop' : isSuper ? 'admin-dash admin-dash--principal' : 'admin-dash';

  return (
    <div className={shellClass}>
      {scopedToShop ? (
        <p className="admin-scope-banner" role="status">
          {t('dashShopScope')}
        </p>
      ) : null}
      <header className="admin-dash-head">
        <div>
          <h2 className="admin-dash-title">
            {scopedToShop ? t('adminShopTitle', { name: username }) : isSuper ? t('superTitle') : t('adminTitle')}
          </h2>
          <p className="muted">{scopedToShop ? t('dashShopScopeHint') : t('welcome', { name: username })}</p>
        </div>
        <p className="admin-dash-updated muted">
          {t('dashUpdatedAt')}:{' '}
          {formatDateTime(dash.generatedAt, locale, { withTime: true })}
        </p>
      </header>

      <div className="admin-dash-kpis">
        <article className="admin-dash-kpi card">
          <span className="admin-dash-kpi-label">{t('totalPlayers')}</span>
          <strong className="admin-dash-kpi-value">{dash.players.total}</strong>
          <span className="muted">
            +{dash.players.newLast7Days} {t('newLast7Days')}
          </span>
        </article>
        {dash.balances.slice(0, 3).map((b) => (
          <article key={b.currency} className="admin-dash-kpi card">
            <span className="admin-dash-kpi-label">{t('dash.balances', { currency: b.currency })}</span>
            <strong className="admin-dash-kpi-value" dir="ltr">
              {fmt(b.total.amountMinor, b.currency)}
            </strong>
            <span className="muted">{t('dash.wallets', { count: b.wallets })}</span>
          </article>
        ))}
        <article className="admin-dash-kpi card">
          <span className="admin-dash-kpi-label">{t('pendingByCurrency')}</span>
          <strong className="admin-dash-kpi-value">{pendingTotal}</strong>
          <span className="muted">
            {dash.pendingWithdrawals.map((p) => `${p.count} ${p.currency}`).join(' · ') || '—'}
          </span>
        </article>
      </div>

      <section className="admin-dash-quick card">
        <h3>{t('dashQuickLinks')}</h3>
        <div className="admin-dash-quick-grid">
          {QUICK.map((q) => (
            <Link key={q.href} href={q.href} className={`admin-dash-quick-link tone-${q.tone}`}>
              <Icon name={q.icon} />
              <span>{q.labelKey === 'bets' ? tb('adminTitle') : t(q.labelKey)}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="admin-dash-cols">
        <section className="card admin-dash-panel">
          <h3>{t('balancesByCurrency')}</h3>
          <table className="admin-dash-table">
            <thead>
              <tr>
                <th>{tCommon('currency')}</th>
                <th>{t('colWallets')}</th>
                <th>{t('dashTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {dash.balances.map((b) => (
                <tr key={b.currency}>
                  <td>{b.currency}</td>
                  <td>{b.wallets}</td>
                  <td dir="ltr">{fmt(b.total.amountMinor, b.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {isSuper && !scopedToShop ? (
          <section className="card admin-dash-panel admin-dash-panel--platform">
            <h3>{t('shopCashByCurrency')}</h3>
            <table className="admin-dash-table">
              <thead>
                <tr>
                  <th>{tCommon('currency')}</th>
                  <th>{t('shops')}</th>
                  <th>{t('dashTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {dash.shopCash.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      —
                    </td>
                  </tr>
                ) : (
                  dash.shopCash.map((s) => (
                    <tr key={s.currency}>
                      <td>{s.currency}</td>
                      <td>
                        {s.activeShops}/{s.shops}
                      </td>
                      <td dir="ltr">{fmt(s.total.amountMinor, s.currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>

      <section className="card admin-dash-panel">
        <h3>{t('dashSports30d')}</h3>
        <p className="muted">{t('dashSports30dHint')}</p>
        <div className="admin-dash-sport-row">
          {sportStake.length === 0 && sportWin.length === 0 ? (
            <p className="muted">{tb('none')}</p>
          ) : (
            [...new Set([...sportStake, ...sportWin].map((r) => r.currency))].map((cur) => {
              const st = sportStake.find((r) => r.currency === cur);
              const wn = sportWin.find((r) => r.currency === cur);
              return (
                <div key={cur} className="admin-dash-sport-chip">
                  <b>{cur}</b>
                  {st ? (
                    <span dir="ltr">
                      {tb('stake')}: {fmt(st.debited.amountMinor, cur)} ({st.entries})
                    </span>
                  ) : null}
                  {wn ? (
                    <span dir="ltr">
                      {tb('paid')}: {fmt(wn.credited.amountMinor, cur)} ({wn.entries})
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="card admin-dash-panel">
        <h3>{t('dash.activity30')}</h3>
        <div className="table-scroll">
          <table className="admin-dash-table">
            <thead>
              <tr>
                <th>{tCommon('currency')}</th>
                <th>{tw('columns.type')}</th>
                <th>{t('dash.entries')}</th>
                <th>{tw('columns.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {dash.recentActivity.slice(0, 24).map((row) => (
                <tr key={`${row.currency}-${row.entryType}`}>
                  <td>{row.currency}</td>
                  <td>{tw(`entryTypes.${row.entryType}`)}</td>
                  <td>{row.entries}</td>
                  <td dir="ltr">
                    +{fmt(row.credited.amountMinor, row.currency)} / −{fmt(row.debited.amountMinor, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
