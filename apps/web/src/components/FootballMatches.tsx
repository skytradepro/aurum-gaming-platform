'use client';

import { apiClient } from '@/lib/api';
import { Link } from '@/i18n/routing';
import { readSpot, showSpot, spotFromClick } from '@/lib/return-spot';
import type { Spot } from '@/lib/return-spot';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

export interface FootballTeam {
  id?: number | null;
  star?: { name: string; photo: string } | null;
  name: string;
  logo: string | null;
  goals: number | null;
}
export interface FootballMatch {
  id: number;
  league: string;
  country: string;
  leagueLogo: string | null;
  kickoff: string;
  status: string;
  elapsed: number | null;
  home: FootballTeam;
  away: FootballTeam;
  odds?: { home: number; draw: number; away: number } | null;
  /** Live 1X2 prices (live board only). */
  liveOdds?: { home: number; draw: number; away: number; suspended: boolean } | null;
  /** Yellow and red cards of each team (live matches, when the provider sends them). */
  cards?: { home: { yellow: number; red: number }; away: { yellow: number; red: number } } | null;
}

/** Small yellow / red card counters next to a team name. */
function TeamCards({ c }: { c: { yellow: number; red: number } }) {
  if (c.yellow === 0 && c.red === 0) return null;
  return (
    <span className="sbk-row-cards">
      {c.yellow > 0 ? (
        <span className="sbk-chip-card">
          <i className="sbk-card" />
          {c.yellow}
        </span>
      ) : null}
      {c.red > 0 ? (
        <span className="sbk-chip-card">
          <i className="sbk-card is-red" />
          {c.red}
        </span>
      ) : null}
    </span>
  );
}
export interface FootballReply {
  enabled: boolean;
  matches: FootballMatch[];
  updatedAt: string | null;
  error?: string;
}

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);
const DONE = new Set(['FT', 'AET', 'PEN']);

function dayString(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Real football matches from the data provider. Live mode shows what is being played now; fixtures mode a chosen day. */
export interface BetPicker {
  selected: (fixtureId: number) => 'home' | 'draw' | 'away' | undefined;
  toggle: (m: FootballMatch, pick: 'home' | 'draw' | 'away') => void;
  /** Called with every fresh list of matches, so the bet slip can follow price changes. */
  onMatches: (matches: FootballMatch[]) => void;
}

/** 1X2 prices a row can be bet at: pre-match prices before kick-off, live prices while it is played. */
export function rowPrices(m: FootballMatch): { home: number; draw: number; away: number; suspended: boolean; live: boolean } | null {
  if (m.status === 'NS' && m.odds) return { ...m.odds, suspended: false, live: false };
  if (LIVE.has(m.status) && m.liveOdds) return { ...m.liveOdds, live: true };
  return null;
}

export function FootballMatches({ mode, initial, locale, bet }: { mode: 'live' | 'fixtures'; initial: FootballReply; locale: string; bet?: BetPicker }) {
  const t = useTranslations('football');
  const ts = useTranslations('sbk');
  const [data, setData] = useState<FootballReply>(initial);
  const [offset, setOffset] = useState(0);
  const [failed, setFailed] = useState(false);
  // back from a match: same day, same filter, and the list scrolls to that match
  const scope = `sports:${mode}`;
  const [spot, setSpot] = useState<Spot | null>(null);

  const load = useCallback(async () => {
    try {
      const path = mode === 'live' ? '/public/football/live' : `/public/football/fixtures?date=${dayString(offset)}`;
      const next = await apiClient<FootballReply>(path);
      setData(next);
      bet?.onMatches(next.matches);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [mode, offset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'fixtures' && offset === 0 && data === initial) return;
    void load();
  }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => void load(), mode === 'live' ? 15_000 : 60_000);
    return () => clearInterval(timer);
  }, [load, mode]);

  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const s = readSpot(scope, true);
    if (!s) return;
    if (typeof s.extra?.filter === 'string') setFilter(s.extra.filter);
    if (mode === 'fixtures' && typeof s.extra?.offset === 'number' && s.extra.offset >= 0 && s.extra.offset <= 6) setOffset(s.extra.offset);
    setSpot(s);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // once the day of the saved match is on screen, scroll to it
  useEffect(() => {
    if (!spot) return;
    const day = typeof spot.extra?.offset === 'number' ? spot.extra.offset : 0;
    if (mode === 'fixtures' && day !== 0 && data === initial) return;
    setSpot(null);
    showSpot(spot);
  }, [spot, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const POPULAR: [string, string][] = [
    ['England', 'Premier League'],
    ['Spain', 'La Liga'],
    ['Italy', 'Serie A'],
    ['Germany', 'Bundesliga'],
    ['France', 'Ligue 1'],
    ['World', 'UEFA Champions League'],
    ['World', 'UEFA Europa League'],
    ['Tunisia', 'Ligue 1'],
  ];
  const keyOf = (m: FootballMatch) => `${m.country}|${m.league}`;
  const liveCount = data.matches.filter((m) => LIVE.has(m.status)).length;
  const oddsCount = data.matches.filter((m) => m.status === 'NS' && m.odds).length;
  // League tiles: the big leagues first, then every other league of the day by number of matches (real data only).
  const leagueCounts = new Map<string, { label: string; count: number }>();
  for (const m of data.matches) {
    const k = keyOf(m);
    const cur = leagueCounts.get(k);
    if (cur) cur.count += 1;
    else leagueCounts.set(k, { label: POPULAR.some(([c, l]) => `${c}|${l}` === k) && m.country !== 'Tunisia' ? m.league : `${m.league} · ${m.country}`, count: 1 });
  }
  const bigKeys = POPULAR.map(([c, l]) => `${c}|${l}`).filter((k) => leagueCounts.has(k));
  const otherKeys = [...leagueCounts.keys()].filter((k) => !bigKeys.includes(k)).sort((a, b) => (leagueCounts.get(b)?.count ?? 0) - (leagueCounts.get(a)?.count ?? 0));
  const popular = [...bigKeys, ...otherKeys].slice(0, 16).map((k) => ({ key: k, label: leagueCounts.get(k)?.label ?? k, count: leagueCounts.get(k)?.count ?? 0 }));
  // a league that has no match any more (another day, finished) falls back to every match: the list is never empty by mistake
  const active = filter === 'all' || filter === 'live' || filter === 'odds' || leagueCounts.has(filter) ? filter : 'all';
  const shown = data.matches.filter((m) => (active === 'all' ? true : active === 'live' ? LIVE.has(m.status) : active === 'odds' ? m.status === 'NS' && !!m.odds : keyOf(m) === active));

  const groups = new Map<string, FootballMatch[]>();
  for (const m of shown) {
    const key = `${m.country ? `${m.country} · ` : ''}${m.league}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }

  function statusText(m: FootballMatch): string {
    if (m.status === 'HT') return t('ht');
    if (LIVE.has(m.status)) return m.elapsed !== null ? `${m.elapsed}′` : t('liveNow');
    if (DONE.has(m.status)) return t('ft');
    if (m.status === 'PST') return t('postponed');
    if (m.status === 'CANC') return t('cancelled');
    return new Date(m.kickoff).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <section onClickCapture={(e) => spotFromClick(scope, e, '/match/', { filter: active, offset })}>
      {mode === 'fixtures' ? (
        <div className="sb-days" role="tablist" aria-label={t('today')}>
          {[0, 1, 2, 3, 4, 5, 6].map((o) => {
            const d = new Date();
            d.setDate(d.getDate() + o);
            return (
              <button key={o} type="button" role="tab" aria-selected={offset === o} className={offset === o ? 'sb-day on' : 'sb-day'} onClick={() => setOffset(o)}>
                <span>{o === 0 ? t('today') : d.toLocaleDateString(locale, { weekday: 'short' })}</span>
                <strong>{d.getDate()}</strong>
              </button>
            );
          })}
        </div>
      ) : null}
      {mode === 'fixtures' ? (
        <div className="sb-sports" role="tablist">
          {[
            { key: 'live', label: t('liveNow'), count: liveCount, icon: <SbIcon name="live" /> },
            { key: 'all', label: t('sport'), count: data.matches.length, icon: <SbIcon name="football" /> },
            { key: 'odds', label: t('withOdds'), count: oddsCount, icon: <SbIcon name="odds" /> },
            ...popular.map((p) => {
              const logo = data.matches.find((m) => keyOf(m) === p.key)?.leagueLogo;
              return {
                ...p,
                // eslint-disable-next-line @next/next/no-img-element
                icon: logo ? <img src={logo} alt="" width={30} height={30} loading="lazy" /> : <SbIcon name="trophy" />,
              };
            }),
          ].map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={active === c.key} title={c.label} className={active === c.key ? 'sb-sport on' : 'sb-sport'} onClick={() => setFilter(c.key)}>
              <sup>{c.count}</sup>
              <span className="sb-sport-icon" aria-hidden="true">
                {c.icon}
              </span>
              <span className="sb-sport-label">{c.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {failed || data.error ? <div className="alert alert-error">{t('loadError')}</div> : null}
      {data.matches.length === 0 ? <p className="muted">{t('noMatches')}</p> : null}
      {[...groups.entries()].map(([name, list]) => (
        <div key={name} className="sbk-league">
          <h3 className="sbk-league-head">
            {list.find((x) => x.leagueLogo)?.leagueLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={list.find((x) => x.leagueLogo)?.leagueLogo ?? ''} alt="" width={20} height={20} loading="lazy" />
            ) : null}
            <span>{name}</span>
            <small>{list.length}</small>
          </h3>
          {list.map((m) => {
            const live = LIVE.has(m.status);
            const prices = bet ? rowPrices(m) : null;
            return (
              <div key={m.id} id={`m-${m.id}`} data-spot="" className={live ? 'sbk-row is-live' : 'sbk-row'}>
                <div className="sbk-row-time">
                  {live ? (
                    <span className="live-pill">
                      <i /> {statusText(m)}
                    </span>
                  ) : (
                    <span className="muted">{statusText(m)}</span>
                  )}
                </div>
                <Link href={`/match/${m.id}`} className="sbk-row-teams">
                  {(['home', 'away'] as const).map((side) => (
                    <span key={side} className="sbk-row-team">
                      {m[side].logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m[side].logo as string} alt="" width={20} height={20} loading="lazy" />
                      ) : (
                        <i className="sbk-row-ph" aria-hidden="true" />
                      )}
                      <span className="sbk-row-name">{m[side].name}</span>
                      {live && m.cards ? <TeamCards c={m.cards[side]} /> : null}
                      {m[side].goals !== null && (live || DONE.has(m.status)) ? <b className={live ? 'sbk-row-goals is-live' : 'sbk-row-goals'}>{m[side].goals}</b> : null}
                    </span>
                  ))}
                </Link>
                {bet && prices ? (
                  <div className="sbk-row-odds">
                    {(['home', 'draw', 'away'] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        className={`sbk-odd${bet.selected(m.id) === side ? ' on' : ''}${prices.suspended ? ' locked' : ''}`}
                        disabled={prices.suspended}
                        onClick={() => bet.toggle(m, side)}
                        aria-pressed={bet.selected(m.id) === side}
                      >
                        <span>{side === 'home' ? '1' : side === 'draw' ? 'X' : '2'}</span>
                        <b>{prices.suspended ? '🔒' : (prices[side] / 100).toFixed(2)}</b>
                      </button>
                    ))}
                    <Link href={`/match/${m.id}`} className="sbk-more" aria-label={ts('allMarkets')}>
                      {ts('more')} ›
                    </Link>
                  </div>
                ) : m.status === 'NS' || live ? (
                  <div className="sbk-row-odds is-link">
                    <Link href={`/match/${m.id}`} className={live ? 'sbk-more is-live' : 'sbk-more'}>
                      {live ? ts('watchLive') : ts('allMarkets')} ›
                    </Link>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
      {data.updatedAt ? (
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          {t('updated')}: {new Date(data.updatedAt).toLocaleTimeString(locale)}
        </p>
      ) : null}
    </section>
  );
}

/** Line icons for the sports filter tiles. */
function SbIcon({ name }: { name: 'live' | 'football' | 'odds' | 'trophy' }) {
  const common = { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'live')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
      </svg>
    );
  if (name === 'football')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 7.2l3.6 2.6-1.4 4.2H9.8L8.4 9.8z" />
        <path d="M12 7.2V2.6M15.6 9.8l4.2-1.6M14.2 14l2.6 3.8M9.8 14l-2.6 3.8M8.4 9.8L4.2 8.2" />
      </svg>
    );
  if (name === 'odds')
    return (
      <svg {...common}>
        <rect x="4" y="3" width="16" height="18" rx="2.5" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" />
    </svg>
  );
}
