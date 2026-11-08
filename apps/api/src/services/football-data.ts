import type { Config } from '../config.ts';
import { persistentMap } from './persist-cache.ts';
import { footballMatches, parseFixtures, providerGet } from './football.ts';
import type { FootballMatch, FootballReply } from './football.ts';

/**
 * Odds and final results from API-Football, used by sports betting.
 * Market: "Match Winner" (bet id 1), the result after 90 minutes. Everything is cached so the daily request limit of the plan lasts.
 */
export interface MatchOdds {
  home: number;
  draw: number;
  away: number;
}

const obj = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

const cache = persistentMap<string, { at: number; value: unknown }>('football-data');
const inflight = new Map<string, Promise<unknown>>();

/**
 * Cached provider data. With `staleOk`, an expired entry is returned at once and refreshed in the background, so a
 * visitor never waits for a long refresh (used for the day's odds, which take several provider pages).
 */
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, staleOk = false): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const refresh = (): Promise<T> => {
    let pending = inflight.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = fn()
        .then((value) => {
          cache.set(key, { at: Date.now(), value });
          if (cache.size > 500) cache.delete(cache.keys().next().value as string);
          return value;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    return pending;
  };
  if (hit && staleOk) {
    refresh().catch(() => undefined);
    return hit.value as T;
  }
  try {
    return await refresh();
  } catch (error) {
    if (hit) return hit.value as T;
    throw error;
  }
}

/** "2.10" -> 210, with the operator's margin taken off. Never below 1.01. */
export function toOddsX100(raw: unknown, marginPercent: number): number | null {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n < 1.01 || n > 1000) return null;
  const x100 = Math.round(n * 100);
  const adjusted = Math.floor((x100 * (100 - marginPercent)) / 100);
  return Math.max(101, adjusted);
}

/** Reads the odds response: fixture id -> Match Winner odds from the preferred bookmaker, or the first one that has all three prices. */
export function parseOdds(body: unknown, config: Pick<Config, 'footballOddsMarginPercent' | 'footballBookmakerId'>): Map<number, MatchOdds> {
  const out = new Map<number, MatchOdds>();
  for (const raw of arr(obj(body).response)) {
    const item = obj(raw);
    const id = obj(item.fixture).id;
    if (typeof id !== 'number') continue;
    const found: { bookmaker: number; odds: MatchOdds }[] = [];
    for (const b of arr(item.bookmakers)) {
      const bm = obj(b);
      for (const market of arr(bm.bets)) {
        const m = obj(market);
        if (m.id !== 1) continue;
        const prices: Partial<MatchOdds> = {};
        for (const val of arr(m.values)) {
          const o = obj(val);
          const price = toOddsX100(o.odd, config.footballOddsMarginPercent);
          if (price === null) continue;
          if (o.value === 'Home') prices.home = price;
          if (o.value === 'Draw') prices.draw = price;
          if (o.value === 'Away') prices.away = price;
        }
        if (prices.home && prices.draw && prices.away) found.push({ bookmaker: typeof bm.id === 'number' ? bm.id : 0, odds: { home: prices.home, draw: prices.draw, away: prices.away } });
      }
    }
    const pick = found.find((f) => f.bookmaker === config.footballBookmakerId) ?? found[0];
    if (pick) out.set(id, pick.odds);
  }
  return out;
}


/**
 * Odds of every match of a day: one provider request per page of results (page 1 first, then the other pages 5 at a
 * time), cached 30 minutes and refreshed in the background.
 */
export async function oddsForDate(config: Config, date: string): Promise<Map<number, MatchOdds>> {
  // Stored as [id, odds] pairs so the disk cache can keep it.
  const pairs = await cached(
    `odds:date:${date}`,
    30 * 60_000,
    async () => {
      const all = new Map<number, MatchOdds>();
      const first = await providerGet(config, `/odds?date=${date}&bet=1&page=1`);
      for (const [id, odds] of parseOdds(first, config)) all.set(id, odds);
      const paging = obj(obj(first).paging);
      const total = Math.min(typeof paging.total === 'number' ? paging.total : 1, config.footballOddsMaxPages);
      const pages = Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 2);
      for (let i = 0; i < pages.length; i += 5) {
        const bodies = await Promise.all(
          pages.slice(i, i + 5).map((page) =>
            providerGet(config, `/odds?date=${date}&bet=1&page=${page}`).catch((error: unknown) => {
              // keep the prices already read; a missing page only hides some prices
              console.error(JSON.stringify({ time: new Date().toISOString(), level: 'warn', message: 'football odds page skipped', page, error: error instanceof Error ? error.message : String(error) }));
              return null;
            }),
          ),
        );
        for (const body of bodies) if (body) for (const [id, odds] of parseOdds(body, config)) all.set(id, odds);
      }
      return [...all.entries()];
    },
    true,
  );
  return new Map(pairs);
}

/** Fresh odds of one match (cached 60 seconds): this is the price a bet is taken at. */
export async function oddsForFixture(config: Config, fixtureId: number): Promise<MatchOdds | null> {
  return cached(`odds:fixture:${fixtureId}`, 60_000, async () => {
    const body = await providerGet(config, `/odds?fixture=${fixtureId}&bet=1`);
    return parseOdds(body, config).get(fixtureId) ?? null;
  });
}

/** One match with its status and kick-off (cached 60 seconds). */
export async function fixtureById(config: Config, fixtureId: number): Promise<FootballMatch | null> {
  return cached(`fixture:${fixtureId}`, 60_000, async () => parseFixtures(await providerGet(config, `/fixtures?id=${fixtureId}`))[0] ?? null);
}

/** A day's matches with their prices. A failing odds feed never hides the matches. */
export async function matchesWithOdds(config: Config, date: string): Promise<FootballReply> {
  const reply = await footballMatches(config, 'date', date);
  if (!reply.enabled || reply.matches.length === 0) return reply;
  try {
    const odds = await oddsForDate(config, date);
    return { ...reply, matches: reply.matches.map((m) => ({ ...m, odds: m.status === 'NS' ? (odds.get(m.id) ?? null) : null })) };
  } catch (error) {
    console.error(JSON.stringify({ time: new Date().toISOString(), level: 'warn', message: 'football odds error', error: error instanceof Error ? error.message : String(error) }));
    return reply;
  }
}

// --- results ---------------------------------------------------------------------------------------------
export interface MatchResult {
  id: number;
  status: string;
  kickoff: string;
  /** Score after 90 minutes (extra time and penalties do not count for the 1X2 market). */
  homeGoals: number | null;
  awayGoals: number | null;
}

export function parseResults(body: unknown): MatchResult[] {
  const out: MatchResult[] = [];
  for (const raw of arr(obj(body).response)) {
    const f = obj(raw);
    const fixture = obj(f.fixture);
    const id = fixture.id;
    if (typeof id !== 'number') continue;
    const ft = obj(obj(f.score).fulltime);
    const goals = obj(f.goals);
    const pick = (a: unknown, b: unknown): number | null => (typeof a === 'number' ? a : typeof b === 'number' ? b : null);
    out.push({
      id,
      status: typeof obj(fixture.status).short === 'string' ? (obj(fixture.status).short as string) : 'NS',
      kickoff: typeof fixture.date === 'string' ? fixture.date : '',
      homeGoals: pick(ft.home, goals.home),
      awayGoals: pick(ft.away, goals.away),
    });
  }
  return out;
}

/** Results of up to 20 matches in one provider request. */
export async function resultsByIds(config: Config, ids: number[]): Promise<MatchResult[]> {
  if (ids.length === 0) return [];
  return parseResults(await providerGet(config, `/fixtures?ids=${ids.slice(0, 20).join('-')}`));
}

export type Side = 'home' | 'draw' | 'away';
export type Decision = { kind: 'wait' } | { kind: 'void' } | { kind: 'settled'; winner: Side };

const FINISHED = new Set(['FT', 'AET', 'PEN']);
const VOID_NOW = new Set(['CANC', 'ABD', 'AWD', 'WO']);
const POSTPONED_VOID_AFTER_MS = 72 * 3600_000;

/** What a match result means for the bets on it. Postponed matches wait three days for a new date, then the bets are voided. */
export function decide(r: MatchResult, now: number = Date.now()): Decision {
  if (FINISHED.has(r.status) && r.homeGoals !== null && r.awayGoals !== null) {
    return { kind: 'settled', winner: r.homeGoals > r.awayGoals ? 'home' : r.homeGoals < r.awayGoals ? 'away' : 'draw' };
  }
  if (VOID_NOW.has(r.status)) return { kind: 'void' };
  if (r.status === 'PST' && r.kickoff && now - Date.parse(r.kickoff) > POSTPONED_VOID_AFTER_MS) return { kind: 'void' };
  return { kind: 'wait' };
}
