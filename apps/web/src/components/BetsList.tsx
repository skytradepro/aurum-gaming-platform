import '@/styles/sportsbook.css';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import { marketLabel, pickLabel } from '@/lib/sports-labels';
import type { SbT } from '@/lib/sports-labels';
import type { SportMarket } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { formatDateTime } from '@aurum/i18n';
import type { Locale } from '@aurum/i18n';
import { getTranslations } from 'next-intl/server';

export interface BetSelectionView {
  fixtureId: string;
  /** Older bets have no market: they are all match winner bets. */
  market?: SportMarket;
  pick: string;
  lineX10?: number | null;
  live?: boolean;
  scoreAtBet?: string | null;
  minuteAtBet?: number | null;
  statTotal?: number | null;
  oddsX100: number;
  league: string;
  home: string;
  away: string;
  kickoff: string;
  result: 'pending' | 'won' | 'lost' | 'void';
  homeGoals: number | null;
  awayGoals: number | null;
}
export interface BetView {
  id: string;
  kind: 'single' | 'accumulator';
  status: 'open' | 'won' | 'lost' | 'void';
  currency: string;
  stakeMinor: string;
  totalOdds: string;
  potentialPayoutMinor: string;
  payoutMinor: string;
  createdAt: string;
  settledAt: string | null;
  selections: BetSelectionView[];
  player?: string;
}

/** Bet slips with every match, the odds taken, the result and the money. Used by the player and by the back office. */
export async function BetsList({ bets, currencies, locale }: { bets: BetView[]; currencies: CurrencyDTO[]; locale: string }) {
  const t = await getTranslations('bets');
  const ts = (await getTranslations('sbk')) as unknown as SbT;
  if (bets.length === 0) return <p>{t('none')}</p>;
  return (
    <>
      {bets.map((b) => {
        const cur = findCurrency(currencies, b.currency);
        const fmt = (m: string) => (cur ? formatAmountMinor(m, cur, locale) : `${m} ${b.currency}`);
        return (
          <div key={b.id} className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <strong>
                #{b.id} · {b.kind === 'single' ? t('single') : t('accumulator')}
                {b.player ? ` · ${b.player}` : ''}
              </strong>
              <span className="badge">{t(`status_${b.status}` as never)}</span>
            </div>
            <small className="muted">{formatDateTime(b.createdAt, locale as Locale, { withTime: true })}</small>
            {b.selections.map((s) => {
              const market: SportMarket = s.market ?? 'match_winner';
              const sel = { market, pick: s.pick, lineX10: s.lineX10 ?? null };
              const stat = s.statTotal !== null && s.statTotal !== undefined && (market === 'corners_ou' || market === 'cards_ou') ? ts(market === 'corners_ou' ? 'statCorners' : 'statCards', { n: s.statTotal }) : null;
              return (
                <div key={s.fixtureId} className="sbk-bet-sel">
                  <span>
                    {s.live ? <span className="sbk-live-tag">LIVE</span> : null}
                    {s.home} – {s.away}
                    {s.homeGoals !== null && s.awayGoals !== null ? ` (${s.homeGoals}:${s.awayGoals})` : ''}
                    <br />
                    <small className="muted">
                      {marketLabel(ts, market, s.home, s.away)}: <b>{pickLabel(ts, sel, s.home, s.away)}</b> · {(s.oddsX100 / 100).toFixed(2)}
                      {s.live && s.scoreAtBet ? ` · ${ts('takenAt', { score: s.scoreAtBet.replace('-', ':'), minute: s.minuteAtBet ?? 0 })}` : ''}
                      {stat ? ` · ${stat}` : ''}
                    </small>
                  </span>
                  <span className={`sbk-res is-${s.result}`}>{t(`result_${s.result}` as never)}</span>
                </div>
              );
            })}
            <p style={{ margin: '0.5rem 0 0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span>
                {t('stake')}: <strong>{fmt(b.stakeMinor)}</strong> · {t('totalOdds')}: <strong>{Number(b.totalOdds).toFixed(2)}</strong>
              </span>
              <span>
                {b.status === 'open' ? t('potentialWin') : t('paid')}: <strong>{fmt(b.status === 'open' ? b.potentialPayoutMinor : b.payoutMinor)}</strong>
              </span>
            </p>
          </div>
        );
      })}
    </>
  );
}
