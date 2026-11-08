'use client';

import { DEMO_EVENTS, SPORTS, oddsLabel } from '@/lib/demo-sports';
import type { DemoEvent, SportKey } from '@/lib/demo-sports';
import { formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO } from '@/lib/types';
import { parseAmountInput } from '@aurum/money';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Icon } from './Icon';

type Market = 'home' | 'draw' | 'away' | 'over' | 'under';
interface Pick {
  event: DemoEvent;
  market: Market;
  odds: number;
}
type Day = 'all' | 0 | 1 | 2;

function marketLabel(p: Pick, drawLabel: string): string {
  if (p.market === 'home') return p.event.home;
  if (p.market === 'away') return p.event.away;
  if (p.market === 'draw') return drawLabel;
  return `${p.market === 'over' ? 'O' : 'U'} ${p.event.total?.line ?? ''}`;
}

/**
 * Sportsbook interface (sports menu, event list, bet slip). It only renders in demo mode with fictional
 * fixtures. Placing a bet is disabled: it needs a licensed sports data and betting provider.
 */
export function Sportsbook({ live, currency, locale }: { live: boolean; currency: CurrencyDTO; locale: string }) {
  const t = useTranslations('sportsbook');
  const [sport, setSport] = useState<'all' | SportKey>('all');
  const [day, setDay] = useState<Day>('all');
  const [q, setQ] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [mode, setMode] = useState<'single' | 'acc'>('acc');
  const [stake, setStake] = useState('');
  const [slipOpen, setSlipOpen] = useState(false);

  const pool = useMemo(() => DEMO_EVENTS.filter((e) => (live ? Boolean(e.live) : true)), [live]);
  const counts = useMemo(() => {
    const map = new Map<SportKey, number>();
    for (const e of pool) map.set(e.sport, (map.get(e.sport) ?? 0) + 1);
    return map;
  }, [pool]);

  const events = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool.filter(
      (e) =>
        (sport === 'all' || e.sport === sport) &&
        (day === 'all' || e.day === day) &&
        (!needle || `${e.home} ${e.away} ${e.league}`.toLowerCase().includes(needle)),
    );
  }, [pool, sport, day, q]);

  const leagues = useMemo(() => {
    const groups = new Map<string, DemoEvent[]>();
    for (const e of events) {
      const list = groups.get(e.league) ?? [];
      list.push(e);
      groups.set(e.league, list);
    }
    return [...groups.entries()];
  }, [events]);

  function toggle(event: DemoEvent, market: Market, odds: number) {
    setPicks((prev) => {
      const same = prev.find((p) => p.event.id === event.id && p.market === market);
      const others = prev.filter((p) => p.event.id !== event.id);
      return same ? others : [...others, { event, market, odds }];
    });
  }

  const stakeMinor = useMemo(() => {
    if (!stake.trim()) return null;
    try {
      const value = parseAmountInput(stake, currency.decimals);
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  }, [stake, currency.decimals]);

  // Integer math only: odds are thousandths, amounts are minor units.
  const totalOddsMilli = picks.reduce((acc, p) => (acc * BigInt(p.odds)) / 1000n, 1000n);
  const potentialMinor =
    stakeMinor === null
      ? null
      : mode === 'acc'
        ? (stakeMinor * totalOddsMilli) / 1000n
        : picks.reduce((acc, p) => acc + (stakeMinor * BigInt(p.odds)) / 1000n, 0n);
  const totalStakeMinor = stakeMinor === null ? null : mode === 'acc' ? stakeMinor : stakeMinor * BigInt(picks.length);
  const drawLabel = t('draw');
  const fmt = (minor: bigint) => formatAmountMinor(minor.toString(), currency, locale);

  return (
    <>
      <div className="demo-banner" role="note">
        <Icon name="info" />
        <span>{t('demoNotice')}</span>
      </div>

      <div className="sb">
        <aside className="sb-side" aria-label={t('sports')}>
          <h3>{t('sports')}</h3>
          <button type="button" className="sb-sport" aria-pressed={sport === 'all'} onClick={() => setSport('all')}>
            <span className="sb-sport-emoji">🏆</span>
            {t('allSports')}
            <span className="sb-count">{pool.length}</span>
          </button>
          {SPORTS.filter((s) => counts.has(s.key)).map((s) => (
            <button key={s.key} type="button" className="sb-sport" aria-pressed={sport === s.key} onClick={() => setSport(s.key)}>
              <span className="sb-sport-emoji">{s.emoji}</span>
              {t(`sport.${s.key}`)}
              <span className="sb-count">{counts.get(s.key)}</span>
            </button>
          ))}
        </aside>

        <section>
          <div className="sb-toolbar">
            {!live ? (
              <div className="sb-days" role="group">
                {(['all', 0, 1] as const).map((d) => (
                  <button key={String(d)} type="button" className="sb-day" aria-pressed={day === d} onClick={() => setDay(d)}>
                    {d === 'all' ? t('day.all') : d === 0 ? t('day.today') : t('day.tomorrow')}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="search-box" style={{ flex: '1 1 220px' }}>
              <Icon name="search" />
              <input className="input" type="search" value={q} placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {leagues.length === 0 ? <p className="empty-state">{t('noEvents')}</p> : null}

          {leagues.map(([league, list]) => (
            <div key={league}>
              <div className="sb-league">
                <span>{SPORTS.find((s) => s.key === list[0]?.sport)?.emoji}</span>
                {league}
                <small>· {list[0]?.country}</small>
              </div>
              {list.map((e, i) => {
                const sel = (m: Market) => picks.some((p) => p.event.id === e.id && p.market === m);
                const hasDraw = typeof e.odds.draw === 'number';
                return (
                  <div key={e.id} className="sb-event" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                    <div className="sb-teams">
                      <div className="sb-time">
                        {e.live ? <span className="sb-live">{t('live')}</span> : null}
                        <span>{e.live ? e.live.minute : `${e.day === 0 ? t('day.today') : e.day === 1 ? t('day.tomorrow') : '+2'} · ${e.time}`}</span>
                      </div>
                      <div className="sb-team">
                        <span>{e.home}</span>
                        {e.live ? <span className="sb-score">{e.live.home}</span> : null}
                      </div>
                      <div className="sb-team">
                        <span>{e.away}</span>
                        {e.live ? <span className="sb-score">{e.live.away}</span> : null}
                      </div>
                    </div>
                    <div className="sb-odds">
                      <button type="button" className="odd" aria-pressed={sel('home')} onClick={() => toggle(e, 'home', e.odds.home)}>
                        <small>1</small>
                        <strong>{oddsLabel(e.odds.home)}</strong>
                      </button>
                      {hasDraw ? (
                        <button type="button" className="odd" aria-pressed={sel('draw')} onClick={() => toggle(e, 'draw', e.odds.draw ?? 0)}>
                          <small>X</small>
                          <strong>{oddsLabel(e.odds.draw ?? 0)}</strong>
                        </button>
                      ) : null}
                      <button type="button" className="odd" aria-pressed={sel('away')} onClick={() => toggle(e, 'away', e.odds.away)}>
                        <small>2</small>
                        <strong>{oddsLabel(e.odds.away)}</strong>
                      </button>
                      {e.total ? (
                        <>
                          <span className="odd-divider" />
                          <button type="button" className="odd" aria-pressed={sel('over')} onClick={() => toggle(e, 'over', e.total?.over ?? 0)}>
                            <small>O {e.total.line}</small>
                            <strong>{oddsLabel(e.total.over)}</strong>
                          </button>
                          <button type="button" className="odd" aria-pressed={sel('under')} onClick={() => toggle(e, 'under', e.total?.under ?? 0)}>
                            <small>U {e.total.line}</small>
                            <strong>{oddsLabel(e.total.under)}</strong>
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </section>

        <aside className={slipOpen ? 'slip open' : 'slip'} aria-label={t('betslip')}>
          <div className="slip-head">
            <span>{t('betslip')}</span>
            <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="slip-count">{picks.length}</span>
              <button type="button" className="slip-remove" style={{ color: '#111' }} aria-label={t('closeSlip')} onClick={() => setSlipOpen(false)}>
                <Icon name="close" />
              </button>
            </span>
          </div>
          <div className="slip-body">
            {picks.length === 0 ? (
              <p className="slip-empty">{t('emptySlip')}</p>
            ) : (
              <>
                <div className="sb-days" style={{ marginBottom: '0.5rem' }}>
                  <button type="button" className="sb-day" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>
                    {t('single')}
                  </button>
                  <button type="button" className="sb-day" aria-pressed={mode === 'acc'} onClick={() => setMode('acc')}>
                    {t('accumulator')}
                  </button>
                </div>
                {picks.map((p) => (
                  <div key={p.event.id} className="slip-item">
                    <span>
                      <strong>{marketLabel(p, drawLabel)}</strong>
                    </span>
                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <strong>{oddsLabel(p.odds)}</strong>
                      <button type="button" className="slip-remove" aria-label={t('remove')} onClick={() => toggle(p.event, p.market, p.odds)}>
                        <Icon name="close" />
                      </button>
                    </span>
                    <small>
                      {p.event.home} – {p.event.away}
                    </small>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" style={{ margin: '0.6rem 0' }} onClick={() => setPicks([])}>
                  <Icon name="trash" />
                  {t('clearAll')}
                </button>
                <div className="field" style={{ marginBottom: '0.6rem' }}>
                  <label htmlFor="slip-stake">
                    {t('stake')} ({currency.code})
                  </label>
                  <input id="slip-stake" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} placeholder="0" />
                  {stake.trim() && stakeMinor === null ? <span className="field-error">{t('invalidStake')}</span> : null}
                </div>
                {mode === 'acc' ? (
                  <div className="slip-line">
                    <span>{t('totalOdds')}</span>
                    <strong>{oddsLabel(Number(totalOddsMilli))}</strong>
                  </div>
                ) : null}
                <div className="slip-line">
                  <span>{t('total')}</span>
                  <strong>{totalStakeMinor === null ? '—' : fmt(totalStakeMinor)}</strong>
                </div>
                <div className="slip-line">
                  <span>{t('potentialReturn')}</span>
                  <strong style={{ color: 'var(--gold)' }}>{potentialMinor === null ? '—' : fmt(potentialMinor)}</strong>
                </div>
              </>
            )}
            <button type="button" className="btn btn-gold" style={{ width: '100%', marginTop: '0.8rem' }} disabled>
              {t('placeBet')}
            </button>
            <p style={{ margin: '0.6rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('bettingDisabled')}</p>
          </div>
        </aside>
      </div>

      <button type="button" className="slip-fab" onClick={() => setSlipOpen(true)} aria-label={t('openSlip')}>
        <Icon name="ticket" />
        {t('betslip')}
        <span className="slip-count">{picks.length}</span>
      </button>
    </>
  );
}
