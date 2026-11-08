import { goalOrderFromEvents, isHalfLine, selectionKey } from '@aurum/shared';
import type { MatchFacts, SportMarket } from '@aurum/shared';
import type { Config } from '../config.ts';
import { persistentMap } from './persist-cache.ts';
import { providerGet } from './football.ts';
import { toOddsX100 } from './football-data.ts';

/**
 * Football markets from API-Football: pre-match odds of every market of a match, live (in-play) odds, and the match
 * centre (timeline of goals and cards, statistics such as corners). Only markets whose provider name is known are read;
 * any other market is ignored, so a market can be missing but never be read as another one.
 */

const obj = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x: unknown): string => (typeof x === 'string' ? x : '');
const norm = (s: unknown): string => str(s).trim().toLowerCase().replace(/\s+/g, ' ');

export interface MarketOffer {
  market: SportMarket;
  pick: string;
  lineX10: number | null;
  oddsX100: number;
  suspended: boolean;
}

/** Provider market names (lower case) of the pre-match feed. */
const PREMATCH_NAMES: Record<string, SportMarket> = {
  'match winner': 'match_winner',
  'double chance': 'double_chance',
  'goals over/under': 'goals_ou',
  'both teams score': 'btts',
  'both teams to score': 'btts',
  'first half winner': 'ht_winner',
  'exact score': 'correct_score',
  'correct score': 'correct_score',
  'corners over under': 'corners_ou',
  'corners over/under': 'corners_ou',
  'cards over/under': 'cards_ou',
  'cards over under': 'cards_ou',
  'home/away': 'draw_no_bet',
  'second half winner': 'sh_winner',
  'goals over/under first half': 'ht_goals_ou',
  'total - home': 'home_goals_ou',
  'total - away': 'away_goals_ou',
  'odd/even': 'odd_even',
  'ht/ft double': 'ht_ft',
};
/** Provider market names (lower case) of the live feed. */
const LIVE_NAMES: Record<string, SportMarket> = {
  'fulltime result': 'match_winner',
  'match winner': 'match_winner',
  '1x2': 'match_winner',
  'double chance': 'double_chance',
  'over/under line': 'goals_ou',
  'match goals': 'goals_ou',
  'goals over/under': 'goals_ou',
  'both teams to score': 'btts',
  'both teams score': 'btts',
  'next goal': 'next_goal',
  'corners over under': 'corners_ou',
  'corners over/under': 'corners_ou',
  'total corners': 'corners_ou',
};

const LINE_RANGE: Partial<Record<SportMarket, [number, number]>> = {
  goals_ou: [5, 105],
  corners_ou: [35, 205],
  cards_ou: [5, 125],
  ht_goals_ou: [5, 55],
  home_goals_ou: [5, 65],
  away_goals_ou: [5, 65],
};

/** "Which team will score the 2nd goal?" -> 2 (the live "next goal" market names the goal it is about). */
const NTH_GOAL = /^which team will score the ([0-9]{1,2})(?:st|nd|rd|th) goal\??$/;

/** Market of a live bet name, and for "next goal" names the goal number when the name says it. */
export function liveMarketOf(name: unknown): { market: SportMarket; goalNo: number | null } | null {
  const n = norm(name);
  const known = LIVE_NAMES[n];
  if (known) return { market: known, goalNo: null };
  const m = NTH_GOAL.exec(n);
  return m ? { market: 'next_goal', goalNo: Number(m[1]) } : null;
}

/** "2.5" -> 25 when it is a half line inside the market's range. */
function lineOf(market: SportMarket, raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(str(raw).trim());
  if (!Number.isFinite(n)) return null;
  const x10 = Math.round(n * 10);
  if (Math.abs(n * 10 - x10) > 1e-6 || !isHalfLine(x10)) return null;
  const range = LINE_RANGE[market];
  return range && x10 >= range[0] && x10 <= range[1] ? x10 : null;
}

/** One provider value -> pick (and line) of the market, or null when it is not a value we offer. */
export function readValue(market: SportMarket, value: unknown, handicap: unknown): { pick: string; lineX10: number | null } | null {
  const v = norm(value);
  switch (market) {
    case 'match_winner':
    case 'ht_winner':
    case 'sh_winner': {
      const pick = ({ home: 'home', '1': 'home', draw: 'draw', x: 'draw', away: 'away', '2': 'away' } as Record<string, string>)[v];
      return pick ? { pick, lineX10: null } : null;
    }
    case 'double_chance': {
      const pick = ({ 'home/draw': '1X', '1x': '1X', 'home/away': '12', '12': '12', 'draw/away': 'X2', x2: 'X2' } as Record<string, string>)[v];
      return pick ? { pick, lineX10: null } : null;
    }
    case 'goals_ou':
    case 'corners_ou':
    case 'cards_ou':
    case 'ht_goals_ou':
    case 'home_goals_ou':
    case 'away_goals_ou': {
      const m = /^(over|under)(?: ([0-9]+(?:\.[0-9]+)?))?$/.exec(v);
      if (!m) return null;
      const line = lineOf(market, m[2] ?? handicap);
      return line === null ? null : { pick: m[1] as string, lineX10: line };
    }
    case 'btts':
      return v === 'yes' || v === 'no' ? { pick: v, lineX10: null } : null;
    case 'correct_score': {
      const m = /^([0-9]):([0-9])$/.exec(v);
      return m ? { pick: `${m[1]}-${m[2]}`, lineX10: null } : null;
    }
    case 'next_goal': {
      const pick = ({ home: 'home', '1': 'home', away: 'away', '2': 'away', 'no goal': 'none', 'no goals': 'none', none: 'none' } as Record<string, string>)[v];
      return pick ? { pick, lineX10: null } : null;
    }
    case 'draw_no_bet': {
      const pick = ({ home: 'home', '1': 'home', away: 'away', '2': 'away' } as Record<string, string>)[v];
      return pick ? { pick, lineX10: null } : null;
    }
    case 'odd_even':
      return v === 'odd' || v === 'even' ? { pick: v, lineX10: null } : null;
    case 'ht_ft': {
      const m = /^(home|draw|away)\/(home|draw|away)$/.exec(v);
      const sign = (x: string) => (x === 'home' ? '1' : x === 'away' ? '2' : 'X');
      return m ? { pick: `${sign(m[1] as string)}-${sign(m[2] as string)}`, lineX10: null } : null;
    }
  }
}

/** Bet names found in a provider odds response, with a few sample values and the market each is read as (admin check). */
export interface BetNameInfo {
  name: string;
  count: number;
  values: string[];
  market: SportMarket | null;
}
export function betNames(body: unknown, kind: 'live' | 'prematch'): BetNameInfo[] {
  const map = new Map<string, BetNameInfo>();
  const add = (rawBet: unknown) => {
    const bet = obj(rawBet);
    const name = str(bet.name).trim();
    if (!name) return;
    let info = map.get(name);
    if (!info) {
      info = { name, count: 0, values: [], market: kind === 'live' ? (liveMarketOf(name)?.market ?? null) : (PREMATCH_NAMES[norm(name)] ?? null) };
      map.set(name, info);
    }
    info.count += 1;
    for (const val of arr(bet.values)) {
      if (info.values.length >= 6) break;
      const o = obj(val);
      const text = `${str(o.value) || String(o.value ?? '')}${o.handicap !== null && o.handicap !== undefined && str(o.handicap) !== '' ? ` [${str(o.handicap) || String(o.handicap)}]` : ''}`;
      if (!info.values.includes(text)) info.values.push(text);
    }
  };
  for (const raw of arr(obj(body).response)) {
    const item = obj(raw);
    if (kind === 'live') for (const b of arr(item.odds)) add(b);
    else for (const bm of arr(item.bookmakers)) for (const b of arr(obj(bm).bets)) add(b);
  }
  return [...map.values()].sort((a, b) => Number(b.market !== null) - Number(a.market !== null) || b.count - a.count);
}

/**
 * Pre-match odds of one match: every known market, each from one bookmaker (the preferred one when it offers the
 * market, otherwise the first that does), so the prices of a market belong together.
 */
export function parsePrematchMarkets(body: unknown, fixtureId: number, config: Pick<Config, 'footballOddsMarginPercent' | 'footballBookmakerId'>): MarketOffer[] {
  const item = arr(obj(body).response).map(obj).find((r) => num(obj(r.fixture).id) === fixtureId);
  if (!item) return [];
  const perMarket = new Map<SportMarket, { bookmaker: number; offers: MarketOffer[] }[]>();
  for (const b of arr(item.bookmakers)) {
    const bm = obj(b);
    const bookmaker = num(bm.id) ?? 0;
    for (const raw of arr(bm.bets)) {
      const bet = obj(raw);
      const market = PREMATCH_NAMES[norm(bet.name)];
      if (!market) continue;
      const offers: MarketOffer[] = [];
      for (const val of arr(bet.values)) {
        const o = obj(val);
        const read = readValue(market, o.value, o.handicap);
        const price = toOddsX100(o.odd, config.footballOddsMarginPercent);
        if (!read || price === null) continue;
        offers.push({ market, pick: read.pick, lineX10: read.lineX10, oddsX100: price, suspended: false });
      }
      if (offers.length > 0) perMarket.set(market, [...(perMarket.get(market) ?? []), { bookmaker, offers }]);
    }
  }
  const out: MarketOffer[] = [];
  for (const list of perMarket.values()) {
    const pick = list.find((l) => l.bookmaker === config.footballBookmakerId) ?? list[0];
    if (!pick) continue;
    const seen = new Set<string>();
    for (const o of pick.offers) {
      const key = selectionKey(o.market, o.pick, o.lineX10);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
  }
  return out;
}

export interface LiveOdds {
  fixtureId: number;
  /** Betting is closed on the whole match (provider stopped / blocked / finished it). */
  closed: boolean;
  elapsed: number | null;
  goals: { home: number; away: number } | null;
  offers: MarketOffer[];
  /** When the provider last updated these prices. */
  update: string | null;
}

/** Live odds of every match in the response. */
export function parseLiveOdds(body: unknown, config: Pick<Config, 'footballOddsMarginPercent'>): LiveOdds[] {
  const out: LiveOdds[] = [];
  for (const raw of arr(obj(body).response)) {
    const item = obj(raw);
    const fixture = obj(item.fixture);
    const id = num(fixture.id);
    if (id === null) continue;
    const st = obj(item.status);
    const teams = obj(item.teams);
    const hg = num(obj(teams.home).goals);
    const ag = num(obj(teams.away).goals);
    const goals = hg !== null && ag !== null ? { home: hg, away: ag } : null;
    const closed = st.stopped === true || st.blocked === true || st.finished === true;
    const offers: MarketOffer[] = [];
    const seen = new Set<string>();
    for (const rawBet of arr(item.odds)) {
      const bet = obj(rawBet);
      const known = liveMarketOf(bet.name);
      if (!known) continue;
      const market = known.market;
      // a "next goal" market names the goal it is about: it must be the next one from the current score
      if (market === 'next_goal' && known.goalNo !== null && (!goals || known.goalNo !== goals.home + goals.away + 1)) continue;
      for (const val of arr(bet.values)) {
        const o = obj(val);
        if (market === 'next_goal') {
          const h = o.handicap;
          if (h !== null && h !== undefined && str(h) !== '') {
            const n = Number(h);
            if (!goals || !Number.isInteger(n) || n !== goals.home + goals.away + 1) continue;
          }
        }
        const read = readValue(market, o.value, o.handicap);
        const price = toOddsX100(o.odd, config.footballOddsMarginPercent);
        if (!read || price === null) continue;
        // an over/under line that is already reached is not offered
        if (market === 'goals_ou' && goals && read.lineX10 !== null && read.lineX10 / 10 < goals.home + goals.away) continue;
        const key = selectionKey(market, read.pick, read.lineX10);
        if (seen.has(key)) continue;
        seen.add(key);
        offers.push({ market, pick: read.pick, lineX10: read.lineX10, oddsX100: price, suspended: o.suspended === true });
      }
    }
    out.push({ fixtureId: id, closed, elapsed: num(obj(fixture.status).elapsed), goals, offers, update: str(item.update) || null });
  }
  return out;
}

// --- caches ---------------------------------------------------------------------------------------------------
const cache = persistentMap<string, { at: number; value: unknown }>('football-markets');
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, fallbackOnError = true): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  try {
    let pending = inflight.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = fn().finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    const value = await pending;
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 800) cache.delete(cache.keys().next().value as string);
    return value;
  } catch (error) {
    if (hit && fallbackOnError) return hit.value as T;
    throw error;
  }
}

/** Every pre-match market of one match (cached 60 seconds; the price a bet is taken at). */
export function prematchMarkets(config: Config, fixtureId: number): Promise<MarketOffer[]> {
  return cached(`pre:${fixtureId}`, 60_000, async () => parsePrematchMarkets(await providerGet(config, `/odds?fixture=${fixtureId}`), fixtureId, config));
}

/** Live odds of every match being played: one provider request shared by every page (kept in memory only). */
const memo = new Map<string, { at: number; value: unknown }>();
async function memCached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  try {
    let pending = inflight.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = fn().finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    const value = await pending;
    memo.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    // a short provider failure keeps the last prices for at most one minute
    if (hit && Date.now() - hit.at < 60_000) return hit.value as T;
    throw error;
  }
}

export interface LiveAll {
  list: LiveOdds[];
  names: BetNameInfo[];
  at: string;
}
export function liveAll(config: Config): Promise<LiveAll> {
  return memCached('live:all', Math.max(config.footballLiveOddsSeconds, 5) * 1000, async () => {
    const body = await providerGet(config, '/odds/live');
    return { list: parseLiveOdds(body, config), names: betNames(body, 'live'), at: new Date().toISOString() };
  });
}

/**
 * Live odds of one match. Pages read the shared list of every live match (one provider request for all visitors);
 * `fresh` asks the provider for this match only (used to accept a bet; never twice in 2 s).
 */
export async function liveOdds(config: Config, fixtureId: number, fresh = false): Promise<LiveOdds | null> {
  if (!fresh) return (await liveAll(config)).list.find((l) => l.fixtureId === fixtureId) ?? null;
  return cached(`live:${fixtureId}`, 2_000, async () => parseLiveOdds(await providerGet(config, `/odds/live?fixture=${fixtureId}`), config).find((l) => l.fixtureId === fixtureId) ?? null, false);
}

/** Live 1X2 prices of every match being played, for the live board. */
export async function liveWinnerPrices(config: Config): Promise<Map<number, { home: number; draw: number; away: number; suspended: boolean }>> {
  const out = new Map<number, { home: number; draw: number; away: number; suspended: boolean }>();
  for (const l of (await liveAll(config)).list) {
    const w = l.offers.filter((o) => o.market === 'match_winner');
    const p = (pick: string) => w.find((o) => o.pick === pick);
    const h = p('home');
    const d = p('draw');
    const a = p('away');
    if (h && d && a) out.set(l.fixtureId, { home: h.oddsX100, draw: d.oddsX100, away: a.oddsX100, suspended: l.closed || h.suspended || d.suspended || a.suspended });
  }
  return out;
}

/** Bet names of the pre-match feed of one match (admin check; one provider request). */
export async function prematchNames(config: Config, fixtureId: number): Promise<BetNameInfo[]> {
  return betNames(await providerGet(config, `/odds?fixture=${fixtureId}`), 'prematch');
}

// --- match centre ---------------------------------------------------------------------------------------------
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
export interface MatchDetail {
  id: number;
  status: string;
  elapsed: number | null;
  kickoff: string;
  league: string;
  country: string;
  leagueLogo: string | null;
  venue: string;
  referee: string;
  home: { id: number | null; name: string; logo: string | null; goals: number | null };
  away: { id: number | null; name: string; logo: string | null; goals: number | null };
  halftime: { home: number; away: number } | null;
  fulltime: { home: number; away: number } | null;
  events: MatchEvent[];
  /** null: the provider sent no statistics block at all (unknown); []: the match has no statistics. */
  stats: MatchStat[] | null;
  /** Whether the provider's answer contained the events / statistics blocks. */
  hasEvents: boolean;
  hasStats: boolean;
}

const score = (s: unknown): { home: number; away: number } | null => {
  const o = obj(s);
  const h = num(o.home);
  const a = num(o.away);
  return h !== null && a !== null ? { home: h, away: a } : null;
};

/** The match centre data of every fixture in a /fixtures response (works for ?id= and ?ids=). */
export function parseMatchDetails(body: unknown): MatchDetail[] {
  const out: MatchDetail[] = [];
  for (const raw of arr(obj(body).response)) {
    const f = obj(raw);
    const fixture = obj(f.fixture);
    const id = num(fixture.id);
    if (id === null) continue;
    const teams = obj(f.teams);
    const th = obj(teams.home);
    const ta = obj(teams.away);
    const homeId = num(th.id);
    const awayId = num(ta.id);
    const side = (teamId: unknown): 'home' | 'away' | null => {
      const t = num(obj(teamId).id);
      return t === null ? null : t === homeId ? 'home' : t === awayId ? 'away' : null;
    };
    const goals = obj(f.goals);
    const sc = obj(f.score);
    const events: MatchEvent[] = arr(f.events).map((rawE) => {
      const e = obj(rawE);
      const time = obj(e.time);
      return {
        minute: num(time.elapsed) ?? 0,
        extra: num(time.extra),
        team: side(e.team),
        type: str(e.type),
        detail: str(e.detail),
        player: str(obj(e.player).name),
        assist: str(obj(e.assist).name),
      };
    });
    let stats: MatchStat[] | null = null;
    if (Array.isArray(f.statistics)) {
      const byTeam = new Map<'home' | 'away', Map<string, number | string | null>>();
      for (const rawS of f.statistics) {
        const s = obj(rawS);
        const t = side(s.team);
        if (!t) continue;
        const m = new Map<string, number | string | null>();
        for (const rawV of arr(s.statistics)) {
          const v = obj(rawV);
          const val = v.value;
          m.set(str(v.type), typeof val === 'number' || typeof val === 'string' ? val : null);
        }
        byTeam.set(t, m);
      }
      const types = new Set([...(byTeam.get('home')?.keys() ?? []), ...(byTeam.get('away')?.keys() ?? [])]);
      stats = [...types].map((type) => ({ type, home: byTeam.get('home')?.get(type) ?? null, away: byTeam.get('away')?.get(type) ?? null }));
    }
    const league = obj(f.league);
    const venue = obj(fixture.venue);
    out.push({
      id,
      status: str(obj(fixture.status).short) || 'NS',
      elapsed: num(obj(fixture.status).elapsed),
      kickoff: str(fixture.date),
      league: str(league.name),
      country: str(league.country),
      leagueLogo: str(league.logo) || null,
      venue: [str(venue.name), str(venue.city)].filter(Boolean).join(', '),
      referee: str(fixture.referee),
      home: { id: homeId, name: str(th.name) || '?', logo: str(th.logo) || null, goals: num(goals.home) },
      away: { id: awayId, name: str(ta.name) || '?', logo: str(ta.logo) || null, goals: num(goals.away) },
      halftime: score(sc.halftime),
      fulltime: score(sc.fulltime),
      events,
      stats,
      hasEvents: Array.isArray(f.events),
      hasStats: Array.isArray(f.statistics),
    });
  }
  return out;
}

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);
const DONE = new Set(['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO']);

/**
 * One match with its timeline and statistics. Cached 15 s while live, 5 min before kick-off, 1 h when finished.
 * `fresh` always asks the provider (used to settle bets) and never falls back to older data.
 */
export async function matchDetail(config: Config, fixtureId: number, fresh = false): Promise<MatchDetail | null> {
  const hit = cache.get(`detail:${fixtureId}`);
  const prev = hit?.value as MatchDetail | null | undefined;
  const ttl = fresh ? 0 : !prev ? 15_000 : LIVE.has(prev.status) ? config.footballDetailLiveSeconds * 1000 : DONE.has(prev.status) ? 3600_000 : 5 * 60_000;
  return cached(`detail:${fixtureId}`, ttl, async () => parseMatchDetails(await providerGet(config, `/fixtures?id=${fixtureId}`))[0] ?? null, !fresh);
}

/**
 * Total of one statistic for both teams; null when the match has no statistics or not this one. Inside a covered
 * statistic the provider writes 0 as an empty value, so an empty value counts 0.
 */
function statTotal(stats: MatchStat[] | null, type: string): number | null {
  if (!stats || stats.length < 4) return null;
  const row = stats.find((s) => s.type.toLowerCase() === type.toLowerCase());
  if (!row) return null;
  const n = (v: number | string | null | undefined) => (typeof v === 'number' ? v : 0);
  return n(row.home) + n(row.away);
}

/** Facts used to settle every market of a finished match. */
export function factsOf(d: MatchDetail): MatchFacts & { cornersTotal: number | null; cardsTotal: number | null } {
  const corners = d.hasStats ? statTotal(d.stats, 'Corner Kicks') : null;
  const yellow = d.hasStats ? statTotal(d.stats, 'Yellow Cards') : null;
  const red = d.hasStats ? statTotal(d.stats, 'Red Cards') : null;
  const cards = yellow === null || red === null ? null : yellow + red;
  const fulltime = d.fulltime ?? (d.status === 'FT' && d.home.goals !== null && d.away.goals !== null ? { home: d.home.goals, away: d.away.goals } : null);
  return {
    status: d.status,
    fulltime,
    halftime: d.halftime,
    corners,
    cards,
    goalOrder: d.hasEvents ? goalOrderFromEvents(d.events, fulltime) : null,
    cornersTotal: corners,
    cardsTotal: cards,
  };
}

/** Match centre data of up to 20 matches in one provider request (used to settle bets). */
export async function detailsByIds(config: Config, ids: number[]): Promise<MatchDetail[]> {
  if (ids.length === 0) return [];
  return parseMatchDetails(await providerGet(config, `/fixtures?ids=${ids.slice(0, 20).join('-')}`));
}

/** Clears cached data of a match (tests). */
export function forgetMatch(fixtureId: number): void {
  for (const k of [`pre:${fixtureId}`, `live:${fixtureId}`, `detail:${fixtureId}`]) cache.delete(k);
  memo.clear();
}
