import { getWalletByUser, postEntry } from '@aurum/ledger';
import { parseAmountInput } from '@aurum/money';
import { AppError, LIVE_ONLY_MARKETS, isAppError, isValidPick, selectionKey, settleSelection, wheelLimits } from '@aurum/shared';
import type { SportMarket } from '@aurum/shared';
import type { Config } from '../config.ts';
import { money } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import type { Db, Queryable } from '@aurum/db';
import { fixtureById } from './football-data.ts';
import { detailsByIds, factsOf, liveOdds, matchDetail, prematchMarkets } from './football-markets.ts';
import type { LiveOdds, MatchDetail } from './football-markets.ts';
import { ownerRulesOf } from './game-rules.ts';
import { payoutOf, totalOdds } from './bet-math.ts';
import { getSettings } from './settings.ts';

export interface BetRules {
  enabled: boolean;
  minMinor: bigint;
  maxStakeMinor: bigint;
  maxWinMinor: bigint;
  maxSelections: number;
  liveEnabled: boolean;
  /** Highest stake of a bet that has a live selection. */
  liveMaxStakeMinor: bigint;
  liveDelaySeconds: number;
}

/** Site-wide sports rules; the admin who owns the player can only make them stricter. */
export async function betRules(db: Queryable, decimals: number, userId: string): Promise<BetRules> {
  const s = await getSettings(db);
  const owner = await ownerRulesOf(db, userId);
  const unit = 10n ** BigInt(decimals);
  const stakeUnits = Math.min(s.sports_max_stake, owner.maxStake ?? Number.MAX_SAFE_INTEGER);
  const winUnits = Math.min(s.sports_max_win, owner.maxWin ?? Number.MAX_SAFE_INTEGER);
  const { min } = wheelLimits(decimals);
  let maxStake = BigInt(stakeUnits) * unit;
  if (maxStake < min) maxStake = min;
  let liveMax = BigInt(Math.min(stakeUnits, s.sports_live_max_stake)) * unit;
  if (liveMax < min) liveMax = min;
  return {
    enabled: s.sports_enabled,
    minMinor: min,
    maxStakeMinor: maxStake,
    maxWinMinor: BigInt(winUnits) * unit,
    maxSelections: s.sports_max_selections,
    liveEnabled: s.sports_live_enabled,
    liveMaxStakeMinor: liveMax,
    liveDelaySeconds: s.sports_live_delay_seconds,
  };
}

export interface PlaceInput {
  stake: string;
  idempotencyKey: string;
  selections: { fixtureId: number; market?: SportMarket; pick: string; lineX10?: number | null; oddsX100: number }[];
}

export interface SelectionDTO {
  fixtureId: string;
  market: SportMarket;
  pick: string;
  lineX10: number | null;
  live: boolean;
  /** Score and minute when a live selection was accepted. */
  scoreAtBet: string | null;
  minuteAtBet: number | null;
  /** Corners or cards total used to settle an over/under selection. */
  statTotal: number | null;
  oddsX100: number;
  league: string;
  home: string;
  away: string;
  kickoff: string;
  result: 'pending' | 'won' | 'lost' | 'void';
  homeGoals: number | null;
  awayGoals: number | null;
}
export interface BetDTO {
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
  selections: SelectionDTO[];
}

interface BetRow {
  id: string;
  kind: 'single' | 'accumulator';
  status: 'open' | 'won' | 'lost' | 'void';
  currency: string;
  stake_minor: string;
  total_odds: string;
  potential_payout_minor: string;
  payout_minor: string;
  created_at: Date;
  settled_at: Date | null;
}
interface SelRow {
  bet_id: string;
  fixture_id: string;
  market: SportMarket;
  pick: string;
  line_x10: number | null;
  is_live: boolean;
  bet_home_goals: number | null;
  bet_away_goals: number | null;
  bet_minute: number | null;
  stat_total: number | null;
  odds_x100: number;
  league: string;
  home_name: string;
  away_name: string;
  kickoff: Date;
  result: 'pending' | 'won' | 'lost' | 'void';
  home_goals: number | null;
  away_goals: number | null;
}

const BET_COLUMNS = 'id::text, kind, status, currency, stake_minor::text, total_odds::text, potential_payout_minor::text, payout_minor::text, created_at, settled_at';

async function withSelections(db: Queryable, rows: BetRow[]): Promise<BetDTO[]> {
  if (rows.length === 0) return [];
  const sels = await db.query<SelRow>(
    `select bet_id::text, fixture_id::text, market, pick, line_x10, is_live, bet_home_goals, bet_away_goals, bet_minute, stat_total,
            odds_x100, league, home_name, away_name, kickoff, result, home_goals, away_goals
       from bet_selections where bet_id = any($1::bigint[]) order by id`,
    [rows.map((r) => r.id)],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    currency: r.currency,
    stakeMinor: r.stake_minor,
    totalOdds: r.total_odds,
    potentialPayoutMinor: r.potential_payout_minor,
    payoutMinor: r.payout_minor,
    createdAt: r.created_at.toISOString(),
    settledAt: r.settled_at ? r.settled_at.toISOString() : null,
    selections: sels.rows
      .filter((s) => s.bet_id === r.id)
      .map((s) => ({
        fixtureId: s.fixture_id,
        market: s.market,
        pick: s.pick,
        lineX10: s.line_x10,
        live: s.is_live,
        scoreAtBet: s.is_live && s.bet_home_goals !== null && s.bet_away_goals !== null ? `${s.bet_home_goals}-${s.bet_away_goals}` : null,
        minuteAtBet: s.bet_minute,
        statTotal: s.stat_total,
        oddsX100: s.odds_x100,
        league: s.league,
        home: s.home_name,
        away: s.away_name,
        kickoff: s.kickoff.toISOString(),
        result: s.result,
        homeGoals: s.home_goals,
        awayGoals: s.away_goals,
      })),
  }));
}

export async function myBets(db: Queryable, userId: string, limit = 50): Promise<BetDTO[]> {
  const { rows } = await db.query<BetRow>(`select ${BET_COLUMNS} from bets where user_id = $1::uuid order by id desc limit $2`, [userId, limit]);
  return withSelections(db, rows);
}

export async function walletDecimals(db: Queryable, currency: string): Promise<number> {
  const cur = await db.query<{ decimals: number }>('select decimals::int from currencies where code = $1', [currency]);
  const decimals = cur.rows[0]?.decimals;
  if (decimals === undefined) throw new AppError('internal_error', { message: 'wallet currency is missing' });
  return decimals;
}

/** A match closes for pre-match betting two minutes before kick-off. */
const CLOSE_BEFORE_KICKOFF_MS = 2 * 60_000;
/** Live betting is open in the two halves and at half time, until the 88th minute. */
const LIVE_BETTING = new Set(['1H', 'HT', '2H']);
const LIVE_LAST_MINUTE = 88;

const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

interface Leg {
  fixtureId: number;
  market: SportMarket;
  pick: string;
  lineX10: number | null;
  oddsX100: number;
  league: string;
  home: string;
  away: string;
  kickoff: string;
  live: { home: number; away: number; minute: number } | null;
}

/** A "closed" error names its match, so the bet slip can mark that selection instead of a vague message. */
function closedFor(error: unknown, fixtureId: number): unknown {
  return isAppError(error) && error.code === 'bet_unavailable' && !error.fields ? new AppError('bet_unavailable', { fields: { fixtureId: String(fixtureId) } }) : error;
}

/** Checks one live selection against fresh live odds; returns the score it was taken at. */
function checkLive(sel: { fixtureId: number; market: SportMarket; pick: string; lineX10: number | null; oddsX100: number }, odds: LiveOdds | null, detail: MatchDetail | null) {
  if (!odds || odds.closed || !odds.goals) throw new AppError('bet_unavailable');
  const minute = Math.max(odds.elapsed ?? 0, detail?.elapsed ?? 0);
  if (minute >= LIVE_LAST_MINUTE) throw new AppError('bet_unavailable');
  const offer = odds.offers.find((o) => selectionKey(o.market, o.pick, o.lineX10) === selectionKey(sel.market, sel.pick, sel.lineX10));
  if (!offer || offer.suspended) throw new AppError('bet_unavailable');
  if (sel.oddsX100 > offer.oddsX100) throw new AppError('odds_changed', { fields: { fixtureId: String(sel.fixtureId), pick: sel.pick, oddsX100: String(offer.oddsX100) } });
  return { home: odds.goals.home, away: odds.goals.away, minute };
}

/**
 * Places a single (one match) or accumulator (several matches, all must win) bet.
 * The price is the provider's current price, never what the browser claims: the browser sends the price it saw and the
 * bet is refused ("odds_changed") when the real price is lower. A bet with a live selection is accepted only after a
 * short delay, when the match is still open, the score has not changed and the price is still there. The stake leaves
 * the wallet through the ledger in the same transaction that creates the bet.
 */
export async function placeBet(ctx: Ctx, input: PlaceInput): Promise<BetDTO> {
  const user = ctx.principal();
  const config = ctx.config;
  if (!config.footballApiKey) throw new AppError('game_unavailable');
  const limit = ctx.services.limiter.hit(`bet:${user.id}`, 30, 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });

  const wallet = await getWalletByUser(ctx.db, user.id);
  if (!wallet) throw new AppError('wallet_not_found');
  const decimals = await walletDecimals(ctx.db, wallet.currency);
  const rules = await betRules(ctx.db, decimals, user.id);
  if (!rules.enabled) throw new AppError('game_unavailable');

  const sels = input.selections.map((s) => ({ fixtureId: s.fixtureId, market: s.market ?? 'match_winner', pick: s.pick, lineX10: s.lineX10 ?? null, oddsX100: s.oddsX100 }));
  const ids = sels.map((s) => s.fixtureId);
  if (new Set(ids).size !== ids.length || ids.length < 1 || ids.length > rules.maxSelections) throw new AppError('validation', { fields: { selections: 'invalid' } });
  for (const s of sels) if (!isValidPick(s.market, s.pick, s.lineX10)) throw new AppError('validation', { fields: { selections: 'invalid' } });

  // A retry of the same request returns the bet that was already created.
  const existing = await ctx.db.query<BetRow>(`select ${BET_COLUMNS} from bets where user_id = $1::uuid and idempotency_key = $2`, [user.id, input.idempotencyKey]);
  if (existing.rows.length > 0) return (await withSelections(ctx.db, existing.rows))[0]!;

  const stake = money(() => parseAmountInput(input.stake, decimals, { allowNegative: false }));
  if (stake < rules.minMinor || stake > rules.maxStakeMinor) throw new AppError('invalid_amount', { fields: { stake: 'invalidAmount' } });

  const legs: Leg[] = [];
  for (const sel of sels) {
    try {
      let fixture;
      try {
        fixture = await fixtureById(config, sel.fixtureId);
      } catch {
        throw new AppError('bet_unavailable');
      }
      if (!fixture) throw new AppError('bet_unavailable');
      const base = { ...sel, league: fixture.league, home: fixture.home.name, away: fixture.away.name, kickoff: fixture.kickoff };
      if (fixture.status === 'NS') {
        // pre-match
        if (LIVE_ONLY_MARKETS.includes(sel.market)) throw new AppError('bet_unavailable');
        const kickoff = Date.parse(fixture.kickoff);
        if (!Number.isFinite(kickoff) || kickoff - Date.now() < CLOSE_BEFORE_KICKOFF_MS) throw new AppError('bet_unavailable');
        let offers;
        try {
          offers = await prematchMarkets(config, sel.fixtureId);
        } catch {
          throw new AppError('bet_unavailable');
        }
        const offer = offers.find((o) => selectionKey(o.market, o.pick, o.lineX10) === selectionKey(sel.market, sel.pick, sel.lineX10));
        if (!offer) throw new AppError('bet_unavailable');
        if (sel.oddsX100 > offer.oddsX100) throw new AppError('odds_changed', { fields: { fixtureId: String(sel.fixtureId), pick: sel.pick, oddsX100: String(offer.oddsX100) } });
        legs.push({ ...base, live: null });
      } else {
        // live (in-play)
        if (!rules.liveEnabled) throw new AppError('bet_unavailable');
        let odds: LiveOdds | null;
        let detail: MatchDetail | null;
        try {
          [odds, detail] = await Promise.all([liveOdds(config, sel.fixtureId, true), matchDetail(config, sel.fixtureId)]);
        } catch {
          throw new AppError('bet_unavailable');
        }
        if (!detail || !LIVE_BETTING.has(detail.status)) throw new AppError('bet_unavailable');
        legs.push({ ...base, live: checkLive(sel, odds, detail) });
      }
    } catch (error) {
      throw closedFor(error, sel.fixtureId);
    }
  }

  if (legs.some((l) => l.live)) {
    if (stake > rules.liveMaxStakeMinor) throw new AppError('invalid_amount', { fields: { stake: 'invalidAmount' } });
    // Wait, then check every live selection again with fresh prices: a goal, a card or a closed market cancels the bet.
    await wait(rules.liveDelaySeconds * 1000);
    for (const leg of legs) {
      if (!leg.live) continue;
      let odds: LiveOdds | null;
      try {
        odds = await liveOdds(config, leg.fixtureId, true);
      } catch {
        throw closedFor(new AppError('bet_unavailable'), leg.fixtureId);
      }
      let now;
      try {
        now = checkLive(leg, odds, null);
      } catch (error) {
        throw closedFor(error, leg.fixtureId);
      }
      if (now.home !== leg.live.home || now.away !== leg.live.away) throw closedFor(new AppError('bet_unavailable'), leg.fixtureId);
    }
  }

  const odds = legs.map((l) => l.oddsX100);
  const potential = payoutOf(stake, odds);
  if (potential > rules.maxWinMinor) throw new AppError('invalid_amount', { fields: { stake: 'invalidAmount' } });
  const kind = legs.length === 1 ? 'single' : 'accumulator';

  const betId = await ctx.db.transaction(async (tx) => {
    const created = await tx.query<{ id: string }>(
      `insert into bets (user_id, wallet_id, currency, kind, stake_minor, potential_payout_minor, total_odds, idempotency_key)
       values ($1::uuid, $2::bigint, $3, $4, $5::bigint, $6::bigint, $7::numeric, $8)
       on conflict (user_id, idempotency_key) do nothing returning id::text`,
      [user.id, wallet.id, wallet.currency, kind, stake.toString(), potential.toString(), totalOdds(odds), input.idempotencyKey],
    );
    const id = created.rows[0]?.id;
    if (!id) throw new AppError('idempotency_key_reuse');
    for (const l of legs) {
      await tx.query(
        `insert into bet_selections (bet_id, fixture_id, market, pick, line_x10, odds_x100, league, home_name, away_name, kickoff,
                                     is_live, bet_home_goals, bet_away_goals, bet_minute)
         values ($1::bigint, $2::bigint, $3, $4, $5::int, $6, $7, $8, $9, $10::timestamptz, $11, $12::int, $13::int, $14::int)`,
        [id, l.fixtureId, l.market, l.pick, l.lineX10, l.oddsX100, l.league, l.home, l.away, l.kickoff, l.live !== null, l.live?.home ?? null, l.live?.away ?? null, l.live?.minute ?? null],
      );
    }
    await postEntry(tx, {
      walletId: wallet.id,
      entryType: 'bet_stake',
      amountMinor: stake,
      scope: `bet:${user.id}`,
      idempotencyKey: `${input.idempotencyKey}:stake`,
      reference: `bet:${id}`,
      reason: 'sports',
      metadata: { game: 'sports', betId: id, kind, selections: legs.length, live: legs.some((l) => l.live) },
    });
    return id;
  });

  const placed = await ctx.db.query<BetRow>(`select ${BET_COLUMNS} from bets where id = $1::bigint`, [betId]);
  return (await withSelections(ctx.db, placed.rows))[0]!;
}

// --- settlement --------------------------------------------------------------------------------------------

/** Settles one bet when its legs allow it: any lost leg loses the bet at once; all legs known pays or refunds. */
export async function resolveBet(db: Db, betId: string): Promise<'open' | 'won' | 'lost' | 'void'> {
  return db.transaction(async (tx) => {
    const bet = await tx.query<{ id: string; status: string; user_id: string; wallet_id: string; stake_minor: string }>(
      'select id::text, status, user_id::text, wallet_id::text, stake_minor::text from bets where id = $1::bigint for update',
      [betId],
    );
    const b = bet.rows[0];
    if (!b || b.status !== 'open') return (b?.status ?? 'open') as 'open' | 'won' | 'lost' | 'void';
    const sels = await tx.query<{ result: string; odds_x100: number }>('select result, odds_x100 from bet_selections where bet_id = $1::bigint', [betId]);
    const results = sels.rows;
    const stake = BigInt(b.stake_minor);
    const scope = `bet:${b.user_id}`;

    if (results.some((s) => s.result === 'lost')) {
      await tx.query("update bets set status = 'lost', payout_minor = 0, settled_at = now() where id = $1::bigint", [betId]);
      return 'lost';
    }
    if (results.some((s) => s.result === 'pending')) return 'open';

    const live = results.filter((s) => s.result === 'won').map((s) => s.odds_x100);
    if (live.length === 0) {
      await postEntry(tx, { walletId: b.wallet_id, entryType: 'bet_refund', amountMinor: stake, scope, idempotencyKey: `bet:${betId}:settle`, reference: `bet:${betId}`, reason: 'sports void', metadata: { game: 'sports', betId } });
      await tx.query("update bets set status = 'void', payout_minor = $2::bigint, settled_at = now() where id = $1::bigint", [betId, stake.toString()]);
      return 'void';
    }
    const payout = payoutOf(stake, live);
    await postEntry(tx, { walletId: b.wallet_id, entryType: 'bet_win', amountMinor: payout, scope, idempotencyKey: `bet:${betId}:settle`, reference: `bet:${betId}`, reason: 'sports win', metadata: { game: 'sports', betId } });
    await tx.query("update bets set status = 'won', payout_minor = $2::bigint, settled_at = now() where id = $1::bigint", [betId, payout.toString()]);
    return 'won';
  });
}

const lastChecked = new Map<number, number>();
const RECHECK_MS = 8 * 60_000;
/** A match is checked only when it has certainly been played for a while: about two hours after kick-off. */
const CHECK_AFTER_KICKOFF = "interval '115 minutes'";
/** A postponed match waits three days for a new date, then its bets are void. */
const POSTPONED_VOID_AFTER_MS = 72 * 3600_000;

interface PendingRow {
  id: string;
  market: SportMarket;
  pick: string;
  line_x10: number | null;
  bet_home_goals: number | null;
  bet_away_goals: number | null;
}

/**
 * Settles the pending selections of one match from its match centre data (score, half-time score, corners, cards and
 * the goal timeline). Returns the bets that were touched.
 */
async function settleMatch(db: Db, d: MatchDetail, now: number): Promise<string[]> {
  const facts = factsOf(d);
  const postponedTooLong = d.status === 'PST' && d.kickoff !== '' && now - Date.parse(d.kickoff) > POSTPONED_VOID_AFTER_MS;
  return db.transaction(async (tx) => {
    const pending = await tx.query<PendingRow>(
      "select id::text, market, pick, line_x10, bet_home_goals, bet_away_goals from bet_selections where fixture_id = $1::bigint and result = 'pending' for update",
      [d.id],
    );
    for (const p of pending.rows) {
      const goalsAtBet = p.bet_home_goals !== null && p.bet_away_goals !== null ? { home: p.bet_home_goals, away: p.bet_away_goals } : null;
      const outcome = postponedTooLong ? 'void' : settleSelection({ market: p.market, pick: p.pick, lineX10: p.line_x10, goalsAtBet }, facts);
      if (outcome === 'wait') continue;
      const stat = p.market === 'corners_ou' ? facts.cornersTotal : p.market === 'cards_ou' ? facts.cardsTotal : null;
      await tx.query(
        `update bet_selections set result = $2, home_goals = $3::int, away_goals = $4::int, stat_total = $5::int, settled_at = now()
          where id = $1::bigint and result = 'pending'`,
        [p.id, outcome, facts.fulltime?.home ?? null, facts.fulltime?.away ?? null, stat],
      );
    }
    const rows = await tx.query<{ bet_id: string }>('select distinct bet_id::text from bet_selections where fixture_id = $1::bigint', [d.id]);
    return rows.rows.map((x) => x.bet_id);
  });
}

/**
 * Looks at every match that has open bets on it and is old enough to be finished, asks the provider for the result and
 * settles the bets. Safe to run on several servers at once: each bet is locked, settled once and paid by an idempotent ledger entry.
 */
export async function settleDueBets(db: Db, config: Config): Promise<{ matches: number; settled: number }> {
  if (!config.footballApiKey) return { matches: 0, settled: 0 };
  let settled = 0;
  // Recovery: bets whose every match is already settled but which were not closed (for example after a restart).
  const stuck = await db.query<{ id: string }>(
    "select b.id::text from bets b where b.status = 'open' and not exists (select 1 from bet_selections s where s.bet_id = b.id and s.result = 'pending') limit 200",
  );
  for (const row of stuck.rows) if ((await resolveBet(db, row.id)) !== 'open') settled += 1;
  const due = await db.query<{ fixture_id: string; needs: boolean }>(
    `select s.fixture_id::text, bool_or(s.market in ('corners_ou', 'cards_ou', 'next_goal')) as needs
       from bet_selections s join bets b on b.id = s.bet_id
      where s.result = 'pending' and b.status = 'open' and s.kickoff < now() - ${CHECK_AFTER_KICKOFF}
      group by s.fixture_id limit 100`,
  );
  const now = Date.now();
  const needs = new Map(due.rows.map((r) => [Number(r.fixture_id), r.needs]));
  const ids = [...needs.keys()].filter((id) => now - (lastChecked.get(id) ?? 0) > RECHECK_MS);
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    let details: MatchDetail[];
    try {
      details = await detailsByIds(config, chunk);
    } catch {
      continue;
    }
    for (const id of chunk) lastChecked.set(id, now);
    for (let d of details) {
      // corners, cards and next goal need the statistics and the timeline: read the match alone when they were not sent
      if (needs.get(d.id) && (!d.hasStats || !d.hasEvents)) {
        try {
          d = (await matchDetail(config, d.id, true)) ?? d;
        } catch {
          continue;
        }
      }
      const affected = await settleMatch(db, d, now);
      for (const betId of affected) {
        const status = await resolveBet(db, betId);
        if (status !== 'open') settled += 1;
      }
    }
  }
  if (lastChecked.size > 5000) lastChecked.clear();
  return { matches: ids.length, settled };
}

export interface AdminBetDTO extends BetDTO {
  player: string;
}

/** Bets for the back office: a Super Admin sees all of them, an admin only those of the players he owns. */
export async function adminBets(db: Queryable, viewer: { id: string; role: string }, status: string | null, limit: number): Promise<{ items: AdminBetDTO[]; totals: { currency: string; bets: number; staked: string; paid: string }[] }> {
  const scope = viewer.role === 'super_admin' ? '' : 'and u.owner_id = $3::uuid';
  const params: unknown[] = [status, limit];
  if (scope) params.push(viewer.id);
  const { rows } = await db.query<BetRow & { username: string }>(
    `select b.id::text, b.kind, b.status, b.currency, b.stake_minor::text, b.total_odds::text, b.potential_payout_minor::text, b.payout_minor::text, b.created_at, b.settled_at, u.username
       from bets b join users u on u.id = b.user_id
      where ($1::text is null or b.status = $1) ${scope}
      order by b.id desc limit $2`,
    params,
  );
  const items = (await withSelections(db, rows)).map((b, i) => ({ ...b, player: rows[i]!.username }));
  const totals = await db.query<{ currency: string; bets: string; staked: string; paid: string }>(
    `select b.currency, count(*)::text as bets, sum(b.stake_minor)::text as staked, sum(b.payout_minor)::text as paid
       from bets b join users u on u.id = b.user_id where true ${scope.replace('$3', '$1')} group by b.currency order by b.currency`,
    scope ? [viewer.id] : [],
  );
  return { items, totals: totals.rows.map((t) => ({ currency: t.currency, bets: Number(t.bets), staked: t.staked, paid: t.paid })) };
}
