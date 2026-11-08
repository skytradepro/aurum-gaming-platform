import { createHmac } from 'node:crypto';
import { getWalletByUser, postEntry } from '@aurum/ledger';
import { parseAmountInput } from '@aurum/money';
import { AppError, WHEEL_SEGMENTS } from '@aurum/shared';
import { money } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import { requireRules } from './game-rules.ts';

export interface WheelResult {
  roundId: string;
  segment: number;
  multiplier: string;
  stake: { amountMinor: string; currency: string };
  payout: { amountMinor: string; currency: string };
  balance: { amountMinor: string; currency: string };
  replayed: boolean;
}

/**
 * The segment comes from HMAC(server secret, player + request key), so it is unpredictable for the player,
 * fixed for a given request (a retry can never re-roll) and cannot be steered from the browser.
 */
function pickSegment(secret: string, userId: string, key: string): number {
  const digest = createHmac('sha256', secret).update(`wheel:${userId}:${key}`).digest();
  return Number(BigInt(`0x${digest.subarray(0, 6).toString('hex')}`) % BigInt(WHEEL_SEGMENTS.length));
}

export async function spinWheel(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<WheelResult> {
  if (!ctx.config.inhouseGames) throw new AppError('not_found');
  const user = ctx.principal();
  const limit = ctx.services.limiter.hit(`wheel:${user.id}`, 90, 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });

  const wallet = await getWalletByUser(ctx.db, user.id);
  if (!wallet) throw new AppError('wallet_not_found');
  const cur = await ctx.db.query<{ decimals: number }>('select decimals::int from currencies where code = $1', [wallet.currency]);
  const decimals = cur.rows[0]?.decimals;
  if (decimals === undefined) throw new AppError('internal_error', { message: 'wallet currency is missing' });

  const stake = money(() => parseAmountInput(input.stake, decimals, { allowNegative: false }));
  const { minMinor: min, maxMinor: max } = await requireRules(ctx.db, 'wheel', decimals, user.id);
  if (stake < min || stake > max) throw new AppError('invalid_amount', { fields: { stake: 'invalidAmount' } });

  const segment = pickSegment(ctx.config.gameSecret, user.id, input.idempotencyKey);
  const seg = WHEEL_SEGMENTS[segment];
  if (!seg) throw new AppError('internal_error');
  const payout = (stake * BigInt(seg.num)) / BigInt(seg.den);
  const scope = `game:wheel:${user.id}`;
  const reference = `wheel:${input.idempotencyKey}`;

  return ctx.db.transaction(async (tx) => {
    const staked = await postEntry(tx, {
      walletId: wallet.id,
      entryType: 'bet_stake',
      amountMinor: stake,
      scope,
      idempotencyKey: `${input.idempotencyKey}:stake`,
      reference,
      reason: 'Hannibal Wheel',
      metadata: { game: 'wheel', segment, multiplier: seg.label },
    });
    let balanceAfter = staked.balanceAfterMinor;
    if (payout > 0n) {
      const won = await postEntry(tx, {
        walletId: wallet.id,
        entryType: 'bet_win',
        amountMinor: payout,
        scope,
        idempotencyKey: `${input.idempotencyKey}:win`,
        reference,
        reason: 'Hannibal Wheel',
        metadata: { game: 'wheel', segment, multiplier: seg.label },
      });
      balanceAfter = won.balanceAfterMinor;
    }
    return {
      roundId: staked.id,
      segment,
      multiplier: seg.label,
      stake: { amountMinor: stake.toString(), currency: wallet.currency },
      payout: { amountMinor: payout.toString(), currency: wallet.currency },
      balance: { amountMinor: balanceAfter.toString(), currency: wallet.currency },
      replayed: staked.replayed,
    };
  });
}
