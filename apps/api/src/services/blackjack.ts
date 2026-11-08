import { createHmac } from 'node:crypto';
import { getWalletByUser, postEntry } from '@aurum/ledger';
import { parseAmountInput } from '@aurum/money';
import { AppError, isAppError, bjActions, bjApply, bjPoints, bjSettle, bjShoe, bjStart, bjUnits } from '@aurum/shared';
import type { BjAction, BjHandResult, BjState } from '@aurum/shared';
import type { Queryable } from '@aurum/db';
import { money } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import { requireRules } from './game-rules.ts';

/**
 * Blackjack hands: dealt with one request, then played move by move. The shoe of a hand is shuffled from
 * HMAC(game secret, player + deal key), so it is fixed at the deal and the same for every request of that hand.
 * Every move runs in one transaction that locks the hand: two taps at once can never play a move twice.
 */
const GAME = 'blackjack';

interface HandRow {
  id: string;
  user_id: string;
  wallet_id: string;
  currency: string;
  deal_key: string;
  stake_minor: string;
  state: BjState;
  status: 'open' | 'done';
  payout_minor: string | null;
}

export interface BlackjackHandDTO {
  handId: string;
  step: number;
  phase: 'player' | 'done';
  stake: { amountMinor: string; currency: string };
  /** Everything on the table now: the first bet plus doubles and splits. */
  staked: { amountMinor: string; currency: string };
  /** The hole card is null while the player is still deciding. */
  dealer: { cards: (number | null)[]; total: number };
  hands: { cards: number[]; total: number; soft: boolean; units: number; done: boolean; outcome: BjHandResult['outcome'] | null; payoutMinor: string | null }[];
  active: number;
  actions: BjAction[];
  payout: { amountMinor: string; currency: string } | null;
  balance: { amountMinor: string; currency: string };
}

function shoeOf(ctx: Ctx, userId: string, dealKey: string): number[] {
  const blocks: Buffer[] = [];
  const digestOf = (block: number): Buffer => (blocks[block] ??= createHmac('sha256', ctx.config.gameSecret).update(`${GAME}:${userId}:${dealKey}${block === 0 ? '' : `:${block}`}`).digest());
  return bjShoe((n, index) => digestOf(Math.floor(index / 8)).readUInt32BE((index % 8) * 4) % n);
}

const columns = 'id::text, user_id::text, wallet_id::text, currency, deal_key, stake_minor::text, state, status, payout_minor::text';

function toDTO(row: HandRow, balanceMinor: bigint): BlackjackHandDTO {
  const s = row.state;
  const stake = BigInt(row.stake_minor);
  const done = row.status === 'done' || s.phase === 'done';
  const results = done ? bjSettle(s) : null;
  const dealerCards = done ? s.dealer : [s.dealer[0] as number, null];
  return {
    handId: row.id,
    step: s.step,
    phase: done ? 'done' : 'player',
    stake: { amountMinor: stake.toString(), currency: row.currency },
    staked: { amountMinor: (stake * BigInt(bjUnits(s))).toString(), currency: row.currency },
    dealer: { cards: dealerCards, total: bjPoints(done ? s.dealer : [s.dealer[0] as number]).total },
    hands: s.hands.map((h, i) => {
      const p = bjPoints(h.cards);
      const r = results?.[i];
      return { cards: h.cards, total: p.total, soft: p.soft, units: h.units, done: h.done, outcome: r?.outcome ?? null, payoutMinor: r ? ((stake * BigInt(r.halves)) / 2n).toString() : null };
    }),
    active: s.active,
    actions: done ? [] : bjActions(s),
    payout: row.payout_minor === null ? null : { amountMinor: row.payout_minor, currency: row.currency },
    balance: { amountMinor: balanceMinor.toString(), currency: row.currency },
  };
}

async function balanceOf(q: Queryable, walletId: string): Promise<bigint> {
  const { rows } = await q.query<{ balance_minor: string }>('select balance_minor::text from wallets where id = $1::bigint', [walletId]);
  return BigInt(rows[0]?.balance_minor ?? '0');
}

/** Pays a finished hand (one bet_win entry when something comes back) and closes it. */
async function settle(tx: Queryable, row: HandRow, state: BjState): Promise<{ payout: bigint; balance: bigint | null }> {
  const stake = BigInt(row.stake_minor);
  const halves = bjSettle(state).reduce((a, r) => a + r.halves, 0);
  const payout = (stake * BigInt(halves)) / 2n;
  const units = bjUnits(state);
  let balance: bigint | null = null;
  if (payout > 0n) {
    const multiplier = `${Number((payout * 100n) / (stake * BigInt(units))) / 100}×`;
    const won = await postEntry(tx, {
      walletId: row.wallet_id,
      entryType: 'bet_win',
      amountMinor: payout,
      scope: `game:${GAME}:${row.user_id}`,
      idempotencyKey: `${row.deal_key}:win`,
      reference: `${GAME}:${row.deal_key}`,
      reason: GAME,
      metadata: { game: GAME, multiplier, handId: row.id, dealer: state.dealer, hands: state.hands.map((h) => h.cards) },
    });
    balance = won.balanceAfterMinor;
  }
  await tx.query(`update blackjack_hands set state = $2::jsonb, status = 'done', payout_minor = $3::bigint, updated_at = now() where id = $1::uuid`, [row.id, JSON.stringify(state), payout.toString()]);
  return { payout, balance };
}

/** The player's hand still on the table (after a reload), if any. */
export async function blackjackCurrent(ctx: Ctx): Promise<BlackjackHandDTO | null> {
  const user = ctx.principal();
  const { rows } = await ctx.db.query<HandRow>(`select ${columns} from blackjack_hands where user_id = $1::uuid and status = 'open'`, [user.id]);
  const row = rows[0];
  if (!row) return null;
  return toDTO(row, await balanceOf(ctx.db, row.wallet_id));
}

/** Deals a new hand. A hand still open is returned instead (nothing is charged twice). */
export async function blackjackDeal(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<BlackjackHandDTO> {
  if (!ctx.config.inhouseGames) throw new AppError('not_found');
  const user = ctx.principal();
  const limit = ctx.services.limiter.hit(`round:${user.id}`, 120, 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });

  const open = await ctx.db.query<HandRow>(`select ${columns} from blackjack_hands where user_id = $1::uuid and (status = 'open' or deal_key = $2)`, [user.id, input.idempotencyKey]);
  const existing = open.rows.find((r) => r.deal_key === input.idempotencyKey) ?? open.rows.find((r) => r.status === 'open');
  if (existing) return toDTO(existing, await balanceOf(ctx.db, existing.wallet_id));

  const wallet = await getWalletByUser(ctx.db, user.id);
  if (!wallet) throw new AppError('wallet_not_found');
  const cur = await ctx.db.query<{ decimals: number }>('select decimals::int from currencies where code = $1', [wallet.currency]);
  const decimals = cur.rows[0]?.decimals;
  if (decimals === undefined) throw new AppError('internal_error', { message: 'wallet currency is missing' });
  const stake = money(() => parseAmountInput(input.stake, decimals, { allowNegative: false }));
  const { minMinor: min, maxMinor: max } = await requireRules(ctx.db, GAME, decimals, user.id);
  if (stake < min || stake > max) throw new AppError('invalid_amount', { fields: { stake: 'invalidAmount' } });

  const shoe = shoeOf(ctx, user.id, input.idempotencyKey);
  const state = bjStart(shoe);

  try {
    return await ctx.db.transaction(async (tx) => {
      const ins = await tx.query<HandRow>(
        `insert into blackjack_hands (user_id, wallet_id, currency, deal_key, stake_minor, state) values ($1::uuid, $2::bigint, $3, $4, $5::bigint, $6::jsonb) returning ${columns}`,
        [user.id, wallet.id, wallet.currency, input.idempotencyKey, stake.toString(), JSON.stringify(state)],
      );
      const row = ins.rows[0] as HandRow;
      const staked = await postEntry(tx, {
        walletId: wallet.id,
        entryType: 'bet_stake',
        amountMinor: stake,
        scope: `game:${GAME}:${user.id}`,
        idempotencyKey: `${input.idempotencyKey}:stake`,
        reference: `${GAME}:${input.idempotencyKey}`,
        reason: GAME,
        metadata: { game: GAME, handId: row.id },
      });
      let balance = staked.balanceAfterMinor;
      if (state.phase === 'done') {
        const s = await settle(tx, row, state);
        if (s.balance !== null) balance = s.balance;
        return toDTO({ ...row, status: 'done', payout_minor: s.payout.toString() }, balance);
      }
      return toDTO(row, balance);
    });
  } catch (error) {
    // a second tap while the first deal was being written: show the hand that was dealt
    const cause = isAppError(error) ? (error as { cause?: unknown }).cause : error;
    if (typeof cause === 'object' && cause !== null && (cause as { code?: string }).code === '23505') {
      const again = await ctx.db.query<HandRow>(`select ${columns} from blackjack_hands where user_id = $1::uuid and status = 'open'`, [user.id]);
      const row = again.rows[0];
      if (row) return toDTO(row, await balanceOf(ctx.db, row.wallet_id));
    }
    throw error;
  }
}

/** One move on the open hand. `step` is the step the player saw: an older step is a repeated tap and changes nothing. */
export async function blackjackAction(ctx: Ctx, input: { handId: string; step: number; action: BjAction }): Promise<BlackjackHandDTO> {
  if (!ctx.config.inhouseGames) throw new AppError('not_found');
  const user = ctx.principal();
  const limit = ctx.services.limiter.hit(`bj:${user.id}`, 300, 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<HandRow>(`select ${columns} from blackjack_hands where id = $1::uuid and user_id = $2::uuid for update`, [input.handId, user.id]);
    const row = rows[0];
    if (!row) throw new AppError('not_found');
    if (row.status === 'done' || row.state.step !== input.step) return toDTO(row, await balanceOf(tx, row.wallet_id));
    if (!bjActions(row.state).includes(input.action)) throw new AppError('validation', { fields: { action: 'invalid' } });

    const stake = BigInt(row.stake_minor);
    const scope = `game:${GAME}:${user.id}`;
    const reference = `${GAME}:${row.deal_key}`;
    let balance: bigint | null = null;
    // a double or a split puts one more bet on the table
    if (input.action === 'double' || input.action === 'split') {
      const extra = await postEntry(tx, {
        walletId: row.wallet_id,
        entryType: 'bet_stake',
        amountMinor: stake,
        scope,
        idempotencyKey: `${row.deal_key}:${input.action}:${row.state.step}`,
        reference,
        reason: GAME,
        metadata: { game: GAME, handId: row.id, move: input.action },
      });
      balance = extra.balanceAfterMinor;
    }
    const shoe = shoeOf(ctx, user.id, row.deal_key);
    const next = bjApply(row.state, input.action, shoe);
    if (next.phase === 'done') {
      const s = await settle(tx, row, next);
      if (s.balance !== null) balance = s.balance;
      return toDTO({ ...row, state: next, status: 'done', payout_minor: s.payout.toString() }, balance ?? (await balanceOf(tx, row.wallet_id)));
    }
    await tx.query(`update blackjack_hands set state = $2::jsonb, updated_at = now() where id = $1::uuid`, [row.id, JSON.stringify(next)]);
    return toDTO({ ...row, state: next }, balance ?? (await balanceOf(tx, row.wallet_id)));
  });
}
