'use client';

import '@/styles/sportsbook.css';
import type { SportMarket } from '@aurum/shared';
import { apiClient } from '@/lib/api';
import { Link, useRouter } from '@/i18n/routing';
import { readSpot } from '@/lib/return-spot';
import { isPicked, slip, useSlip } from '@/lib/sports-slip';
import { marketLabel, odds, shortPick } from '@/lib/sports-labels';
import type { SbT } from '@/lib/sports-labels';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { SlipFab } from './SlipFab';
import { BetSlip } from '../BetSlip';
import type { BetRulesDTO } from '../BetSlip';

export interface MatchEvent {
  minute: number;
  extra: number | null;
  team: 'home' | 'away' | null;
  type: string;
  detail: string;
  player: string;
  assist: string;
}
export interface MatchStat {
  type: string;
  home: number | string | null;
  away: number | string | null;
}
export interface MatchTeam {
  id: number | null;
  name: string;
  logo: string | null;
  goals: number | null;
}
export interface MatchDetailDTO {
  id: number;
  status: string;
  elapsed: number | null;
  kickoff: string;
  league: string;
  country: string;
  leagueLogo: string | null;
  venue: string;
  referee: string;
  home: MatchTeam;
  away: MatchTeam;
  halftime: { home: number; away: number } | null;
  fulltime: { home: number; away: number } | null;
  events: MatchEvent[];
  stats: MatchStat[] | null;
}
export interface Offer {
  market: SportMarket;
  pick: string;
  lineX10: number | null;
  oddsX100: number;
  suspended: boolean;
}
export interface MatchReply {
  match: MatchDetailDTO;
  markets: { live: boolean; closed: boolean; offers: Offer[] };
}

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);
const DONE = new Set(['FT', 'AET', 'PEN']);
const ORDER: SportMarket[] = [
  'match_winner',
  'next_goal',
  'double_chance',
  'draw_no_bet',
  'goals_ou',
  'btts',
  'ht_winner',
  'sh_winner',
  'ht_ft',
  'correct_score',
  'ht_goals_ou',
  'home_goals_ou',
  'away_goals_ou',
  'odd_even',
  'corners_ou',
  'cards_ou',
];
const PICK_ORDER = ['home', 'draw', 'none', 'away', '1X', '12', 'X2', 'over', 'under', 'yes', 'no', 'odd', 'even'];
const HT_FT_ORDER = ['1-1', '1-X', '1-2', 'X-1', 'X-X', 'X-2', '2-1', '2-X', '2-2'];
/** Market filters of the match centre (international layout: popular, goals, halves, corners & cards). */
const FILTERS: { key: string; markets: SportMarket[] | null }[] = [
  { key: 'f_all', markets: null },
  { key: 'f_main', markets: ['match_winner', 'next_goal', 'double_chance', 'draw_no_bet', 'btts'] },
  { key: 'f_goals', markets: ['goals_ou', 'correct_score', 'home_goals_ou', 'away_goals_ou', 'odd_even', 'btts'] },
  { key: 'f_halves', markets: ['ht_winner', 'sh_winner', 'ht_ft', 'ht_goals_ou'] },
  { key: 'f_stats', markets: ['corners_ou', 'cards_ou'] },
];
const TEAM_LABELS: SportMarket[] = ['match_winner', 'ht_winner', 'sh_winner', 'next_goal', 'draw_no_bet'];
const STAT_ROWS: [string, string][] = [
  ['Ball Possession', 'st_possession'],
  ['Total Shots', 'st_shots'],
  ['Shots on Goal', 'st_on'],
  ['Corner Kicks', 'st_corners'],
  ['Fouls', 'st_fouls'],
  ['Offsides', 'st_offsides'],
  ['Yellow Cards', 'st_yellow'],
  ['Red Cards', 'st_red'],
];

const statNum = (v: number | string | null): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) || 0 : 0);
const minuteText = (e: { minute: number; extra: number | null }) => (e.extra ? `${e.minute}+${e.extra}′` : `${e.minute}′`);

/** Icon of a timeline event: ball, yellow / red card, change, VAR. */
function EventIcon({ e }: { e: MatchEvent }) {
  const type = e.type.toLowerCase();
  const detail = e.detail.toLowerCase();
  if (type === 'goal') return <span className={detail.includes('missed') ? 'sbk-ev-ico is-miss' : 'sbk-ev-ico is-goal'} aria-hidden="true">⚽</span>;
  if (type === 'card') return <span className={detail.includes('red') || detail.includes('second') ? 'sbk-card is-red' : 'sbk-card'} aria-hidden="true" />;
  if (type === 'subst') return <span className="sbk-ev-ico is-sub" aria-hidden="true">⇄</span>;
  return <span className="sbk-ev-ico is-var" aria-hidden="true">VAR</span>;
}

/** Match centre: score and minute, every market with its price, the timeline (goals, cards, changes) and the statistics. */
export function MatchCenter({ initial, locale, currency, rules, balanceMinor }: { initial: MatchReply; locale: string; currency: CurrencyDTO | null; rules: BetRulesDTO | null; balanceMinor: string | null }) {
  const t = useTranslations('sbk') as unknown as SbT;
  const tf = useTranslations('football');
  const router = useRouter();
  const [data, setData] = useState<MatchReply>(initial);
  const [tab, setTab] = useState<'markets' | 'timeline' | 'stats'>('markets');
  const [filter, setFilter] = useState('f_all');
  const [goal, setGoal] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const items = useSlip();
  const m = data.match;
  const live = LIVE.has(m.status);
  const goals = (m.home.goals ?? 0) + (m.away.goals ?? 0);
  const lastGoals = useRef(goals);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const next = await apiClient<MatchReply>(`/public/football/match/${initial.match.id}`);
        if (stop) return;
        setData(next);
        setFailed(false);
        slip.follow(next.match.id, next.markets.offers.filter((o) => !o.suspended));
      } catch {
        if (!stop) setFailed(true);
      }
    };
    const timer = setInterval(() => void tick(), live ? 5_000 : 60_000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [initial.match.id, live]);

  // a new goal: short banner with the team that scored
  useEffect(() => {
    if (goals > lastGoals.current) {
      const g = [...m.events].reverse().find((e) => e.type.toLowerCase() === 'goal' && !e.detail.toLowerCase().includes('missed'));
      setGoal(g?.team === 'away' ? m.away.name : g?.team === 'home' ? m.home.name : `${m.home.goals ?? 0} : ${m.away.goals ?? 0}`);
      const timer = setTimeout(() => setGoal(null), 7000);
      lastGoals.current = goals;
      return () => clearTimeout(timer);
    }
    lastGoals.current = goals;
    return undefined;
  }, [goals, m.events, m.home.name, m.away.name, m.home.goals, m.away.goals]);

  const { offers, closed } = data.markets;
  const allGroups = ORDER.map((market) => ({ market, list: offers.filter((o) => o.market === market) })).filter((g) => g.list.length > 0);
  const filters = FILTERS.filter((f) => !f.markets || allGroups.some((g) => f.markets?.includes(g.market)));
  const activeFilter = filters.find((f) => f.key === filter) ?? FILTERS[0];
  const groups = allGroups.filter((g) => !activeFilter?.markets || activeFilter.markets.includes(g.market));
  // kick-off has passed (or is 2 minutes away) but the provider has not started the match yet: betting is closed
  const kickoffGone = m.status === 'NS' && Date.parse(m.kickoff) - Date.now() < 2 * 60_000;
  const sortPicks = (list: Offer[]) => [...list].sort((a, b) => PICK_ORDER.indexOf(a.pick) - PICK_ORDER.indexOf(b.pick));

  const pick = (o: Offer) =>
    slip.toggle({ fixtureId: m.id, market: o.market, pick: o.pick, lineX10: o.lineX10, oddsX100: o.oddsX100, home: m.home.name, away: m.away.name, league: m.league, live: data.markets.live, kickoff: m.kickoff });

  const btn = (o: Offer, label?: string) => {
    const on = isPicked(items, m.id, o.market, o.pick, o.lineX10);
    const locked = closed || o.suspended;
    return (
      <button key={`${o.market}:${o.pick}:${o.lineX10 ?? ''}`} type="button" className={`sbk-odd${on ? ' on' : ''}${locked ? ' locked' : ''}`} disabled={locked} onClick={() => pick(o)} aria-pressed={on}>
        <span>{label ?? shortPick(t, o)}</span>
        <b>{locked ? '🔒' : odds(o.oddsX100)}</b>
      </button>
    );
  };

  const statusPill = live ? (
    <span className="live-pill">
      <i /> {m.status === 'HT' ? tf('ht') : m.elapsed !== null ? `${m.elapsed}′` : tf('liveNow')}
    </span>
  ) : DONE.has(m.status) ? (
    <span className="sbk-pill">{tf('ft')}</span>
  ) : (
    <span className="sbk-pill">{new Date(m.kickoff).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
  );

  const events = [...m.events].sort((a, b) => b.minute - a.minute || (b.extra ?? 0) - (a.extra ?? 0));
  const reds = (side: 'home' | 'away') => m.events.filter((e) => e.team === side && e.type.toLowerCase() === 'card' && /red|second/i.test(e.detail)).length;
  const yellows = (side: 'home' | 'away') => m.events.filter((e) => e.team === side && e.type.toLowerCase() === 'card' && !/red|second/i.test(e.detail)).length;

  return (
    <div className="sbk-layout">
      <div className="sbk-main">
        <Link
          href={live ? '/live-betting' : '/sports'}
          className="sbk-back"
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            // opened from a list in this tab: go back to it (it returns to the same match)
            if (window.history.length > 1 && (readSpot('sports:fixtures') || readSpot('sports:live'))) {
              e.preventDefault();
              router.back();
            }
          }}
        >
          ‹ {t('back')}
        </Link>
        <section className={live ? 'sbk-head is-live' : 'sbk-head'} aria-live="polite">
          <div className="sbk-head-league">
            {m.leagueLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.leagueLogo} alt="" width={22} height={22} />
            ) : null}
            <span>
              {m.league}
              {m.country ? ` · ${m.country}` : ''}
            </span>
            {statusPill}
          </div>
          <div className="sbk-head-teams">
            {(['home', 'away'] as const).map((side, k) => {
              const team = m[side];
              return (
                <div key={side} className={`sbk-team ${k === 0 ? 'is-home' : 'is-away'}`}>
                  <span className="sbk-team-logo">
                    {team.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={team.logo} alt="" width={64} height={64} />
                    ) : (
                      <span className="sbk-team-ph" aria-hidden="true">
                        {team.name.slice(0, 1)}
                      </span>
                    )}
                    {reds(side) > 0 ? (
                      <span className="sbk-team-red" title={t('st_red')}>
                        {reds(side) > 1 ? reds(side) : ''}
                      </span>
                    ) : null}
                  </span>
                  <strong>{team.name}</strong>
                  {yellows(side) + reds(side) > 0 ? (
                    <span className="sbk-team-cards" aria-label={`${t('st_yellow')}: ${yellows(side)} · ${t('st_red')}: ${reds(side)}`}>
                      {yellows(side) > 0 ? (
                        <span className="sbk-chip-card">
                          <i className="sbk-card" />
                          {yellows(side)}
                        </span>
                      ) : null}
                      {reds(side) > 0 ? (
                        <span className="sbk-chip-card">
                          <i className="sbk-card is-red" />
                          {reds(side)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              );
            })}
            <div className="sbk-score">
              {m.home.goals === null || m.away.goals === null ? (
                <span className="sbk-vs">VS</span>
              ) : (
                <span className="sbk-score-main">
                  <b>{m.home.goals}</b>
                  <em>:</em>
                  <b>{m.away.goals}</b>
                </span>
              )}
              {m.halftime && (DONE.has(m.status) || m.status === '2H' || m.status === 'HT' || m.status === 'ET' || m.status === 'P') ? (
                <small title={tf('ht')}>
                  <span>{tf('ht')}</span>
                  <span>{m.halftime.home}</span>:<span>{m.halftime.away}</span>
                </small>
              ) : null}
            </div>
          </div>
          {goal ? (
            <div className="sbk-goal-flash" role="status">
              ⚽ {t('goalFor', { team: goal })}
            </div>
          ) : null}
          {m.venue || m.referee ? (
            <p className="sbk-head-meta">
              {m.venue ? `${t('venue')}: ${m.venue}` : ''}
              {m.venue && m.referee ? ' · ' : ''}
              {m.referee ? `${t('referee')}: ${m.referee}` : ''}
            </p>
          ) : null}
        </section>

        <div className="sbk-tabs" role="tablist">
          {(['markets', 'timeline', 'stats'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {t(k)}
              {k === 'markets' && offers.length > 0 ? <sup>{allGroups.length}</sup> : null}
              {k === 'timeline' && m.events.length > 0 ? <sup>{m.events.length}</sup> : null}
            </button>
          ))}
        </div>
        {failed ? <div className="alert alert-error">{tf('loadError')}</div> : null}

        {tab === 'markets' ? (
          <div className="sbk-markets">
            {data.markets.live && !closed ? <p className="sbk-live-note">{t('liveNoteShort')}</p> : null}
            {closed && offers.length > 0 ? <p className="sbk-closed">{t('closed')}</p> : null}
            {filters.length > 2 ? (
              <div className="sbk-filters" role="tablist">
                {filters.map((f) => (
                  <button key={f.key} type="button" role="tab" aria-selected={activeFilter?.key === f.key} className={activeFilter?.key === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
                    {t(f.key)}
                  </button>
                ))}
              </div>
            ) : null}
            {groups.length === 0 ? <p className="muted sbk-empty">{DONE.has(m.status) ? t('finished') : closed && (live || kickoffGone) ? t('closed') : t('noMarkets')}</p> : null}
            {groups.map(({ market, list }) => {
              const lines = [...new Set(list.map((o) => o.lineX10).filter((l): l is number => l !== null))].sort((a, b) => a - b);
              return (
                <section key={market} className="sbk-market">
                  <h3>{marketLabel(t, market, m.home.name, m.away.name)}</h3>
                  {lines.length > 0 ? (
                    <div className="sbk-lines">
                      {lines.map((l) => (
                        <div key={l} className="sbk-line">
                          <span className="sbk-line-n">{(l / 10).toFixed(1)}</span>
                          {sortPicks(list.filter((o) => o.lineX10 === l)).map((o) => btn(o, t(o.pick === 'over' ? 'overShort' : 'underShort')))}
                        </div>
                      ))}
                    </div>
                  ) : market === 'correct_score' ? (
                    <div className="sbk-grid is-scores">{[...list].sort((a, b) => a.pick.localeCompare(b.pick)).map((o) => btn(o))}</div>
                  ) : market === 'ht_ft' ? (
                    <div className="sbk-grid is-3">{[...list].sort((a, b) => HT_FT_ORDER.indexOf(a.pick) - HT_FT_ORDER.indexOf(b.pick)).map((o) => btn(o))}</div>
                  ) : (
                    <div className={`sbk-grid is-${list.length}`}>
                      {sortPicks(list).map((o) =>
                        btn(
                          o,
                          TEAM_LABELS.includes(market) ? (o.pick === 'home' ? m.home.name : o.pick === 'away' ? m.away.name : shortPick(t, o)) : undefined,
                        ),
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : null}

        {tab === 'timeline' ? (
          <div className="sbk-timeline">
            {events.length === 0 ? <p className="muted sbk-empty">{t('noEvents')}</p> : null}
            {events.map((e, i) => (
              <div key={i} className={`sbk-ev is-${e.team ?? 'none'}`}>
                <span className="sbk-ev-min">{minuteText(e)}</span>
                <EventIcon e={e} />
                <span className="sbk-ev-text">
                  <b>{e.player || (e.team === 'home' ? m.home.name : e.team === 'away' ? m.away.name : '')}</b>
                  <small>
                    {e.type.toLowerCase() === 'goal'
                      ? e.detail.toLowerCase().includes('own')
                        ? t('ev_og')
                        : e.detail.toLowerCase().includes('missed')
                          ? t('ev_missed')
                          : e.detail.toLowerCase().includes('penalty')
                            ? t('ev_pen')
                            : t('ev_goal')
                      : e.type.toLowerCase() === 'card'
                        ? /red|second/i.test(e.detail)
                          ? t('ev_red')
                          : t('ev_yellow')
                        : e.type.toLowerCase() === 'subst'
                          ? t('ev_sub')
                          : `${t('ev_var')} · ${e.detail}`}
                    {e.assist ? ` · ${e.assist}` : ''}
                  </small>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'stats' ? (
          <div className="sbk-stats">
            {!m.stats || m.stats.length === 0 ? <p className="muted sbk-empty">{t('noStats')}</p> : null}
            {m.stats && m.stats.length > 0
              ? STAT_ROWS.map(([type, key]) => {
                  const row = m.stats?.find((s) => s.type === type);
                  if (!row) return null;
                  const h = statNum(row.home);
                  const a = statNum(row.away);
                  const share = h + a > 0 ? (h / (h + a)) * 100 : 50;
                  return (
                    <div key={type} className="sbk-stat">
                      <div className="sbk-stat-top">
                        <b>{row.home ?? 0}</b>
                        <span>{t(key)}</span>
                        <b>{row.away ?? 0}</b>
                      </div>
                      <div className="sbk-bar">
                        <i style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })
              : null}
          </div>
        ) : null}

        <details className="sbk-rules">
          <summary>{t('rulesTitle')}</summary>
          <ul>
            <li>{t('rule90')}</li>
            <li>{t('ruleCorners')}</li>
            <li>{t('ruleNextGoal')}</li>
            <li>{t('ruleLive')}</li>
            <li>{t('ruleVoid')}</li>
          </ul>
        </details>
      </div>
      <div className="sports-aside sbk-aside">
        <BetSlip currency={currency} rules={rules} balanceMinor={balanceMinor} locale={locale} />
      </div>
      <SlipFab count={items.length} label={t('slipShort')} />
    </div>
  );
}
