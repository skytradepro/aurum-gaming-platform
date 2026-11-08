/**
 * Daily gift: once a day (Tunis time) a player opens the gift and receives a small credit chosen at random between the
 * Super Admin's minimum and maximum. The ledger guarantees one gift per player per day (scope "gift:<player>",
 * key "day:<date>"); a site-wide daily limit and a "real deposit first" rule keep the cost under control.
 */
import { randomInt } from 'node:crypto';
import { getWalletByUser, postEntry } from '@aurum/ledger';
import { AppError } from '@aurum/shared';
import type { Queryable } from '@aurum/db';
import type { Ctx } from '../http/types.ts';
import { getSettings } from './settings.ts';

/** Tunisia is UTC+1 all year. */
const TUNIS_OFFSET_MS = 60 * 60_000;

export function giftDay(now: Date): { day: string; nextAt: string } {
  const local = new Date(now.getTime() + TUNIS_OFFSET_MS);
  const day = local.toISOString().slice(0, 10);
  const nextLocalMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return { day, nextAt: new Date(nextLocalMidnight - TUNIS_OFFSET_MS).toISOString() };
}

/** Hundredths of the currency -> minor units of the wallet currency (same rule as the welcome gift). */
function centsToMinor(cents: number, decimals: number): bigint {
  return decimals >= 2 ? BigInt(cents) * 10n ** BigInt(decimals - 2) : BigInt(Math.floor(cents / 10 ** (2 - decimals)));
}

export interface GiftStatus {
  enabled: boolean;
  /** ready: can be opened now; opened: today's gift is taken; deposit: a real deposit is needed first; soldOut: today's gifts are all taken. */
  state: 'ready' | 'opened' | 'deposit' | 'soldOut' | 'off';
  nextAt: string;
  currency: string | null;
  /** Today's gift when it was opened. */
  amountMinor: string | null;
  min: string | null;
  max: string | null;
}

async function todayEntry(q: Queryable, userId: string, day: string): Promise<{ amount_minor: string } | null> {
  const { rows } = await q.query<{ amount_minor: string }>(
    `select amount_minor::text from ledger_entries where idempotency_scope = $1 and idempotency_key = $2 and entry_type = 'daily_gift' limit 1`,
    [`gift:${userId}`, `day:${day}`],
  );
  return rows[0] ?? null;
}

async function hasDeposit(q: Queryable, walletId: string): Promise<boolean> {
  const { rows } = await q.query<{ ok: boolean }>(`select exists (select 1 from ledger_entries where wallet_id = $1::bigint and entry_type in ('deposit', 'deposit_crypto')) as ok`, [walletId]);
  return rows[0]?.ok === true;
}

async function openedToday(q: Queryable, day: string): Promise<number> {
  const { rows } = await q.query<{ n: string }>(`select count(*)::text as n from ledger_entries where entry_type = 'daily_gift' and idempotency_key = $1`, [`day:${day}`]);
  return Number(rows[0]?.n ?? '0');
}

export async function giftStatus(ctx: Ctx, now = new Date()): Promise<GiftStatus> {
  const user = ctx.principal();
  const s = await getSettings(ctx.db);
  const { day, nextAt } = giftDay(now);
  const wallet = await getWalletByUser(ctx.db, user.id);
  const cur = wallet ? await ctx.db.query<{ decimals: number }>('select decimals::int from currencies where code = $1', [wallet.currency]) : null;
  const decimals = cur?.rows[0]?.decimals ?? 2;
  const base = {
    enabled: s.gift_enabled,
    nextAt,
    currency: wallet?.currency ?? null,
    amountMinor: null,
    min: wallet ? centsToMinor(Math.min(s.gift_min_cents, s.gift_max_cents), decimals).toString() : null,
    max: wallet ? centsToMinor(Math.max(s.gift_min_cents, s.gift_max_cents), decimals).toString() : null,
  };
  if (!wallet) return { ...base, state: 'off' };
  const taken = await todayEntry(ctx.db, user.id, day);
  if (taken) return { ...base, state: 'opened', amountMinor: taken.amount_minor };
  if (!s.gift_enabled || s.gift_daily_limit === 0) return { ...base, state: 'off' };
  if (s.gift_need_deposit && !(await hasDeposit(ctx.db, wallet.id))) return { ...base, state: 'deposit' };
  if ((await openedToday(ctx.db, day)) >= s.gift_daily_limit) return { ...base, state: 'soldOut' };
  return { ...base, state: 'ready' };
}

/** Opens today's gift. Opening again the same day returns the same gift (never a second one). */
export async function openGift(ctx: Ctx, now = new Date()): Promise<{ amountMinor: string; currency: string; balanceMinor: string; nextAt: string }> {
  const user = ctx.principal();
  const limit = ctx.services.limiter.hit(`gift:${user.id}`, 10, 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });
  const { day, nextAt } = giftDay(now);
  return ctx.db.transaction(async (tx) => {
    // one opening at a time on the whole site, so the daily limit is never passed
    await tx.query(`select pg_advisory_xact_lock(hashtext('daily_gift'))`);
    const s = await getSettings(tx);
    const wallet = await getWalletByUser(tx, user.id);
    if (!wallet) throw new AppError('wallet_not_found');
    const taken = await todayEntry(tx, user.id, day);
    if (taken) {
      const w = await getWalletByUser(tx, user.id);
      return { amountMinor: taken.amount_minor, currency: wallet.currency, balanceMinor: (w?.balanceMinor ?? wallet.balanceMinor).toString(), nextAt };
    }
    if (!s.gift_enabled || s.gift_daily_limit === 0) throw new AppError('gift_unavailable');
    if (s.gift_need_deposit && !(await hasDeposit(tx, wallet.id))) throw new AppError('gift_needs_deposit');
    if ((await openedToday(tx, day)) >= s.gift_daily_limit) throw new AppError('gift_unavailable');
    const cur = await tx.query<{ decimals: number }>('select decimals::int from currencies where code = $1', [wallet.currency]);
    const decimals = cur.rows[0]?.decimals ?? 2;
    const lo = Math.min(s.gift_min_cents, s.gift_max_cents);
    const hi = Math.max(s.gift_min_cents, s.gift_max_cents);
    const cents = randomInt(lo, hi + 1);
    const amountMinor = centsToMinor(cents, decimals);
    if (amountMinor < 1n) throw new AppError('invalid_amount');
    const posted = await postEntry(tx, {
      walletId: wallet.id,
      entryType: 'daily_gift',
      amountMinor,
      scope: `gift:${user.id}`,
      idempotencyKey: `day:${day}`,
      reason: 'Daily gift',
      metadata: { gift: 'daily', day },
    });
    return { amountMinor: amountMinor.toString(), currency: wallet.currency, balanceMinor: posted.balanceAfterMinor.toString(), nextAt };
  });
}
