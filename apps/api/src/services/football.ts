import { persistentMap } from './persist-cache.ts';
import type { Config } from '../config.ts';

/** Real football data from API-Football (api-sports.io). Results are cached so the provider's daily request limit is not burnt by visitors. */
export interface FootballTeam {
  id: number | null;
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
  /** Match winner odds x100 (2.10 = 210); only on upcoming matches that have a price. */
  odds?: { home: number; draw: number; away: number } | null;
  /** Yellow and red cards of each team, when the provider sent the match timeline (live matches). */
  cards?: { home: { yellow: number; red: number }; away: { yellow: number; red: number } } | null;
}
export interface FootballReply {
  enabled: boolean;
  matches: FootballMatch[];
  updatedAt: string | null;
  error?: 'provider_unavailable' | 'provider_rejected';
}

const cache = persistentMap<string, { at: number; matches: FootballMatch[] }>('football-fixtures');
const inflight = new Map<string, Promise<FootballMatch[]>>();
const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);

/** When the provider is down, use expired cache so live/sports pages are not empty after a deploy. */
function staleFallback(kind: 'live' | 'date', date: string): { at: number; matches: FootballMatch[] } | null {
  const liveBucket = cache.get('/fixtures?live=all');
  if (kind === 'live' && liveBucket?.matches.length) return liveBucket;
  const dateKeys = [...cache.keys()].filter((k) => k.startsWith('/fixtures?date=')).sort().reverse();
  if (kind === 'date') {
    const exact = cache.get(`/fixtures?date=${date}`);
    if (exact?.matches.length) return exact;
    for (const key of dateKeys) {
      const entry = cache.get(key);
      if (entry?.matches.length) return entry;
    }
    return null;
  }
  for (const key of dateKeys) {
    const entry = cache.get(key);
    if (!entry?.matches.length) continue;
    const live = entry.matches.filter((m) => LIVE_STATUSES.has(m.status));
    if (live.length) return { at: entry.at, matches: live };
  }
  return null;
}

const str = (x: unknown, fallback = ''): string => (typeof x === 'string' ? x : fallback);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const obj = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {});

function team(t: unknown, goals: unknown): FootballTeam {
  const o = obj(t);
  return { id: num(o.id), name: str(o.name, '?'), logo: str(o.logo) || null, goals: num(goals) };
}

export function parseFixtures(body: unknown): FootballMatch[] {
  const list = obj(body).response;
  if (!Array.isArray(list)) return [];
  const out: FootballMatch[] = [];
  for (const raw of list) {
    const f = obj(raw);
    const fixture = obj(f.fixture);
    const league = obj(f.league);
    const teams = obj(f.teams);
    const goals = obj(f.goals);
    const status = obj(fixture.status);
    const id = num(fixture.id);
    if (id === null) continue;
    let cards: FootballMatch['cards'] = null;
    if (Array.isArray(f.events)) {
      const homeId = num(obj(teams.home).id);
      const awayId = num(obj(teams.away).id);
      cards = { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } };
      for (const rawE of f.events) {
        const e = obj(rawE);
        if (str(e.type).toLowerCase() !== 'card') continue;
        const t = num(obj(e.team).id);
        const side = t !== null && t === homeId ? cards.home : t !== null && t === awayId ? cards.away : null;
        if (!side) continue;
        // a second yellow is shown as a red card
        if (/red|second yellow/i.test(str(e.detail))) side.red += 1;
        else side.yellow += 1;
      }
    }
    out.push({
      id,
      league: str(league.name, '-'),
      country: str(league.country),
      leagueLogo: str(league.logo) || null,
      kickoff: str(fixture.date),
      status: str(status.short, 'NS'),
      elapsed: num(status.elapsed),
      home: team(teams.home, goals.home),
      away: team(teams.away, goals.away),
      ...(cards ? { cards } : {}),
    });
  }
  out.sort((a, b) => a.country.localeCompare(b.country) || a.league.localeCompare(b.league) || a.kickoff.localeCompare(b.kickoff));
  return out;
}

/** After a failure, the same provider endpoint is not called again for this long (pages use the saved data meanwhile). */
const PROVIDER_PAUSE_MS = 60_000;
const providerFailedAt = new Map<string, number>();

/** One GET to the provider. Throws when the provider is unreachable or rejects the request. */
export async function providerGet(config: Config, path: string): Promise<unknown> {
  const endpoint = path.split('?')[0] ?? path;
  const failedAt = providerFailedAt.get(endpoint);
  if (endpoint !== '/status' && failedAt !== undefined && Date.now() - failedAt < PROVIDER_PAUSE_MS) {
    throw new Error('provider paused after a recent failure');
  }
  try {
    const res = await fetch(`${config.footballApiBase}${path}`, { headers: { 'x-apisports-key': config.footballApiKey, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`provider status ${res.status}`);
    const body: unknown = await res.json();
    const errors = obj(body).errors;
    const hasErrors = Array.isArray(errors) ? errors.length > 0 : Object.keys(obj(errors)).length > 0;
    if (hasErrors) throw new Error(`provider rejected: ${JSON.stringify(errors).slice(0, 200)}`);
    providerFailedAt.delete(endpoint);
    return body;
  } catch (error) {
    providerFailedAt.set(endpoint, Date.now());
    throw error;
  }
}

async function load(config: Config, path: string): Promise<FootballMatch[]> {
  return parseFixtures(await providerGet(config, path));
}

export async function footballMatches(config: Config, kind: 'live' | 'date', date: string): Promise<FootballReply> {
  if (!config.footballApiKey) return { enabled: false, matches: [], updatedAt: null };
  const path = kind === 'live' ? '/fixtures?live=all' : `/fixtures?date=${date}`;
  const ttl = kind === 'live' ? config.footballLiveCacheSeconds * 1000 : 10 * 60_000;
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttl) return { enabled: true, matches: hit.matches, updatedAt: new Date(hit.at).toISOString() };
  try {
    let pending = inflight.get(path);
    if (!pending) {
      pending = load(config, path).finally(() => inflight.delete(path));
      inflight.set(path, pending);
    }
    const matches = await pending;
    cache.set(path, { at: Date.now(), matches });
    return { enabled: true, matches, updatedAt: new Date().toISOString() };
  } catch (error) {
    console.error(JSON.stringify({ time: new Date().toISOString(), level: 'warn', message: 'football provider error', error: error instanceof Error ? error.message : String(error) }));
    if (hit) return { enabled: true, matches: hit.matches, updatedAt: new Date(hit.at).toISOString(), error: 'provider_unavailable' };
    const stale = staleFallback(kind, date);
    if (stale) return { enabled: true, matches: stale.matches, updatedAt: new Date(stale.at).toISOString(), error: 'provider_unavailable' };
    return { enabled: true, matches: [], updatedAt: null, error: 'provider_unavailable' };
  }
}

// --- star players (photos from the data provider) --------------------------------------------------
export interface StarPlayer {
  name: string;
  photo: string;
  position: string;
}
const stars = persistentMap<number, { at: number; star: StarPlayer | null }>('football-stars');

const placeholderHashes = new Set<string>();

async function photoHash(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    const { createHash } = await import('node:crypto');
    return createHash('sha1').update(bytes).digest('hex');
  } catch {
    return null;
  }
}

/**
 * One real face per team (cached 24 hours: 1 provider request per team per day). Players without a photo get the
 * provider's generic silhouette, which is the same image for everyone: a picture shared by two players is treated
 * as that silhouette and skipped, so only real photos are shown.
 */
export async function teamStar(config: Config, teamId: number): Promise<StarPlayer | null> {
  const hit = stars.get(teamId);
  if (hit && Date.now() - hit.at < 24 * 60 * 60_000) return hit.star;
  const body = obj(await providerGet(config, `/players/squads?team=${teamId}`));
  const first = Array.isArray(body.response) ? obj(body.response[0]) : {};
  const players = (Array.isArray(first.players) ? first.players.map(obj) : []).filter((p) => str(p.photo));
  // Prefer first-team attackers (a shirt number, age 21-33), then the rest; youth players rarely have a photo.
  const rank = (p: Record<string, unknown>) => {
    const pos = ({ Attacker: 0, Midfielder: 1, Defender: 2, Goalkeeper: 3 } as Record<string, number>)[str(p.position)] ?? 4;
    const age = num(p.age) ?? 0;
    const senior = num(p.number) !== null && age >= 21 && age <= 33 ? 0 : 10;
    return senior + pos;
  };
  const ordered = [...players].sort((a, b) => rank(a) - rank(b)).slice(0, 8);
  // The provider's "no photo" picture: it is what an unknown player id returns.
  if (placeholderHashes.size === 0) {
    const ref = await photoHash('https://media.api-sports.io/football/players/999999999.png');
    if (ref) placeholderHashes.add(ref);
  }
  const hashes = await Promise.all(ordered.map((p) => photoHash(str(p.photo))));
  const count = new Map<string, number>();
  for (const h of hashes) if (h) count.set(h, (count.get(h) ?? 0) + 1);
  for (const [h, c] of count) if (c >= 2) placeholderHashes.add(h);
  let star: StarPlayer | null = null;
  for (let i = 0; i < ordered.length; i += 1) {
    const h = hashes[i];
    if (!h || placeholderHashes.has(h)) continue;
    const p = ordered[i] as Record<string, unknown>;
    star = { name: str(p.name), photo: str(p.photo), position: str(p.position) };
    break;
  }
  stars.set(teamId, { at: Date.now(), star });
  return star;
}
