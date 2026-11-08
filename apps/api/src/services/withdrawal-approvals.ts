/**
 * Withdrawals started at a shop counter and approved by the player with a one-time code.
 *
 *   1. The cashier finds the player (account number, username, email or phone) and sees the balance.
 *   2. The cashier asks for an amount: a 6-digit code is created (10 minutes, 5 tries) and shown only in
 *      the player's own account. Nothing moves yet.
 *   3. The player, at the counter, gives the code. With the right code the withdrawal is created and paid
 *      in one transaction (withdrawal_create + withdrawal_pay): wallet debit and shop cash payout.
 *   The player can refuse a request from their account at any time.
 */
import { randomInt, timingSafeEqual } from 'node:crypto';
import type { Queryable } from '@aurum/db';
import { parseAmountInput } from '@aurum/money';
import type { MoneyDTO } from '@aurum/money';
import { AppError } from '@aurum/shared';
import { money } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import { getSettings } from './settings.ts';
import { approvalCodeMail, sendMail } from './mailer.ts';
import { generateWithdrawalCode } from './withdrawals.ts';

const APPROVAL_MINUTES = 10;
const MAX_TRIES = 5;

export interface CounterPlayerDTO {
  id: string;
  accountNo: string;
  username: string;
  firstName: string;
  lastName: string;
  balance: MoneyDTO;
  hasDeposit: boolean;
}
export interface ApprovalDTO {
  id: string;
  status: string;
  amount: MoneyDTO;
  expiresAt: string;
  triesLeft: number;
}

interface PlayerRow {
  id: string;
  account_no: string;
  username: string;
  first_name: string;
  last_name: string;
  status: string;
  currency: string;
  decimals: number;
  balance_minor: string;
  has_deposit: boolean;
  email: string;
  preferred_locale: string | null;
}

/** Finds one active player by account number, username, email or phone. */
async function findPlayer(q: Queryable, account: string): Promise<PlayerRow | null> {
  const a = account.trim();
  if (!a) return null;
  const phone = /^\+?[\d\s.()-]{6,24}$/.test(a) ? `+${a.replace(/\D/g, '')}` : null;
  const { rows } = await q.query<PlayerRow>(
    `select u.id::text, u.account_no::text, u.username, u.first_name, u.last_name, u.status, u.email, u.preferred_locale, w.currency, c.decimals::int as decimals,
            w.balance_minor::text,
            exists (select 1 from ledger_entries e where e.wallet_id = w.id and e.entry_type in ('deposit', 'deposit_crypto')) as has_deposit
       from users u
       join wallets w on w.user_id = u.id and w.kind = 'main'
       join currencies c on c.code = w.currency
      where u.role = 'user'
        and (u.account_no::text = $1 or lower(u.username) = lower($1) or lower(u.email) = lower($1) or u.phone = $2)
      limit 2`,
    [a, phone],
  );
  return rows.length === 1 ? (rows[0] as PlayerRow) : null;
}

const toPlayer = (p: PlayerRow): CounterPlayerDTO => ({
  id: p.id,
  accountNo: p.account_no,
  username: p.username,
  firstName: p.first_name,
  lastName: p.last_name,
  balance: { amountMinor: p.balance_minor, currency: p.currency },
  hasDeposit: p.has_deposit,
});

async function cashierShop(ctx: Ctx): Promise<{ id: string; name: string; currency: string; max_payout_minor: string | null }> {
  const cashier = ctx.principal();
  if (!cashier.shopId) throw new AppError('forbidden');
  const { rows } = await ctx.db.query<{ id: string; name: string; currency: string; status: string; max_payout_minor: string | null }>(
    'select id::text, name, currency, status, max_payout_minor::text from shops where id = $1::bigint',
    [cashier.shopId],
  );
  const shop = rows[0];
  if (!shop || shop.status !== 'active') throw new AppError('shop_not_active');
  return shop;
}

/** Cashier: who is this player and what is their balance. */
export async function counterPlayer(ctx: Ctx, account: string): Promise<CounterPlayerDTO> {
  const cashier = ctx.principal();
  const limit = ctx.services.limiter.hit(`counter-player:${cashier.id}`, 60, 15 * 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });
  const player = await findPlayer(ctx.db, account);
  if (!player) throw new AppError('user_not_found');
  await audit(ctx.db, auditActor(ctx), { action: 'counter.player_viewed', targetType: 'user', targetId: player.id, details: { shopId: cashier.shopId } });
  return toPlayer(player);
}

/** Cashier: asks the player for a code to pay `amount` in cash. */
export async function requestApproval(ctx: Ctx, input: { account: string; amount: string }): Promise<{ approval: ApprovalDTO; player: CounterPlayerDTO; emailed: boolean }> {
  const cashier = ctx.principal();
  const limit = ctx.services.limiter.hit(`approval-request:${cashier.id}`, 30, 15 * 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });
  const settings = await getSettings(ctx.db);
  if (!settings.withdrawals_open) throw new AppError('withdrawals_closed');
  const shop = await cashierShop(ctx);
  const player = await findPlayer(ctx.db, input.account);
  if (!player) throw new AppError('user_not_found');
  if (player.status !== 'active') throw new AppError('account_not_postable');
  if (player.currency !== shop.currency) throw new AppError('shop_currency_mismatch');
  if (!player.has_deposit) throw new AppError('withdrawal_needs_deposit');
  const amountMinor = money(() => parseAmountInput(input.amount, player.decimals, { allowNegative: false }));
  if (amountMinor < 1n) throw new AppError('invalid_amount', { fields: { amount: 'invalidAmount' } });
  if (amountMinor > BigInt(player.balance_minor)) throw new AppError('insufficient_funds');
  if (shop.max_payout_minor && amountMinor > BigInt(shop.max_payout_minor)) throw new AppError('shop_limit_exceeded');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const result = await ctx.db.transaction(async (tx) => {
    // Only one open request per player: an older one is closed.
    await tx.query("update withdrawal_approvals set status = 'expired', closed_at = now() where user_id = $1::uuid and status = 'pending'", [player.id]);
    const { rows } = await tx.query<{ id: string; expires_at: Date }>(
      `insert into withdrawal_approvals (user_id, shop_id, requested_by, currency, amount_minor, code, expires_at)
       values ($1::uuid, $2::bigint, $3::uuid, $4, $5::bigint, $6, now() + make_interval(mins => $7))
       returning id::text, expires_at`,
      [player.id, shop.id, cashier.id, player.currency, amountMinor.toString(), code, APPROVAL_MINUTES],
    );
    const row = rows[0] as { id: string; expires_at: Date };
    await audit(tx, auditActor(ctx), { action: 'counter.approval_requested', targetType: 'user', targetId: player.id, details: { approvalId: row.id, shopId: shop.id, amountMinor: amountMinor.toString(), currency: player.currency } });
    return {
      approval: { id: row.id, status: 'pending', amount: { amountMinor: amountMinor.toString(), currency: player.currency }, expiresAt: row.expires_at.toISOString(), triesLeft: MAX_TRIES },
      player: toPlayer(player),
    };
  });
  // Also send the code by e-mail when e-mail is set up (the code is always shown in the player's account).
  const unit = 10n ** BigInt(player.decimals);
  const shown = player.decimals > 0 ? `${amountMinor / unit}.${(amountMinor % unit).toString().padStart(player.decimals, '0')}` : `${amountMinor}`;
  const mail = approvalCodeMail(player.preferred_locale, shop.name, `${shown} ${player.currency}`, code);
  const emailed = await sendMail(ctx.config, { to: player.email, toName: `${player.first_name} ${player.last_name}`, subject: mail.subject, html: mail.html });
  return { ...result, emailed };
}

/** Cashier: the player gave the code. With the right code the cash withdrawal is created and paid at once. */
export async function confirmApproval(ctx: Ctx, id: string, code: string): Promise<{ withdrawalId: string; amount: MoneyDTO; balanceAfter: MoneyDTO }> {
  const cashier = ctx.principal();
  if (!cashier.shopId) throw new AppError('forbidden');
  const outcome = await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; user_id: string; shop_id: string; status: string; code: string; attempts: number; expires_at: Date; amount_minor: string; currency: string }>(
      `select id::text, user_id::text, shop_id::text, status, code, attempts, expires_at, amount_minor::text, currency
         from withdrawal_approvals where id = $1::bigint for update`,
      [id],
    );
    const a = rows[0];
    if (!a || a.shop_id !== cashier.shopId) throw new AppError('approval_not_found');
    if (a.status !== 'pending') throw new AppError(a.status === 'locked' ? 'approval_locked' : 'approval_expired');
    if (a.expires_at.getTime() <= Date.now()) {
      await tx.query("update withdrawal_approvals set status = 'expired', closed_at = now() where id = $1::bigint", [id]);
      return { kind: 'expired' as const };
    }
    const given = Buffer.from(code.trim().padEnd(6, ' ').slice(0, 6));
    const right = timingSafeEqual(given, Buffer.from(a.code));
    if (!right) {
      const tries = a.attempts + 1;
      await tx.query(`update withdrawal_approvals set attempts = $2, status = case when $2 >= ${MAX_TRIES} then 'locked' else status end,
                        closed_at = case when $2 >= ${MAX_TRIES} then now() else closed_at end where id = $1::bigint`, [id, tries]);
      await audit(tx, auditActor(ctx), { action: 'counter.approval_wrong_code', targetType: 'user', targetId: a.user_id, details: { approvalId: id, tries } });
      return { kind: 'wrong' as const, left: MAX_TRIES - tries };
    }
    const pickup = generateWithdrawalCode();
    const created = await tx.query<{ o_id: string }>(
      "select o_id::text from withdrawal_create($1::uuid, $2::bigint, $3, now() + interval '1 hour', $4::bigint, $5)",
      [a.user_id, a.amount_minor, pickup, cashier.shopId, `approval:${id}`],
    );
    const withdrawalId = (created.rows[0] as { o_id: string }).o_id;
    await tx.query("select * from withdrawal_pay($1::bigint, $2::bigint, $3::uuid, 'approved with the player code')", [withdrawalId, cashier.shopId, cashier.id]);
    await tx.query("update withdrawal_approvals set status = 'used', withdrawal_id = $2::bigint, closed_at = now() where id = $1::bigint", [id, withdrawalId]);
    const bal = await tx.query<{ balance_minor: string }>("select balance_minor::text from wallets where user_id = $1::uuid and kind = 'main'", [a.user_id]);
    await audit(tx, auditActor(ctx), { action: 'counter.withdrawal_paid', targetType: 'withdrawal', targetId: withdrawalId, details: { approvalId: id, shopId: cashier.shopId, amountMinor: a.amount_minor, currency: a.currency } });
    return { kind: 'paid' as const, withdrawalId, amount: { amountMinor: a.amount_minor, currency: a.currency }, balanceAfter: { amountMinor: bal.rows[0]?.balance_minor ?? '0', currency: a.currency } };
  });
  if (outcome.kind === 'expired') throw new AppError('approval_expired');
  if (outcome.kind === 'wrong') throw new AppError(outcome.left <= 0 ? 'approval_locked' : 'approval_code_invalid', { details: { triesLeft: outcome.left } });
  return { withdrawalId: outcome.withdrawalId, amount: outcome.amount, balanceAfter: outcome.balanceAfter };
}

// --- player ----------------------------------------------------------------------------------------
export interface PlayerApprovalDTO {
  id: string;
  shop: { name: string; city: string };
  amount: MoneyDTO;
  code: string;
  expiresAt: string;
}

/** The player's open requests with their code (shown only to the player). */
export async function myApprovals(q: Queryable, userId: string): Promise<PlayerApprovalDTO[]> {
  const { rows } = await q.query<{ id: string; name: string; city: string; amount_minor: string; currency: string; code: string; expires_at: Date }>(
    `select a.id::text, s.name, s.city, a.amount_minor::text, a.currency, a.code, a.expires_at
       from withdrawal_approvals a join shops s on s.id = a.shop_id
      where a.user_id = $1::uuid and a.status = 'pending' and a.expires_at > now()
      order by a.id desc limit 3`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, shop: { name: r.name, city: r.city }, amount: { amountMinor: r.amount_minor, currency: r.currency }, code: r.code, expiresAt: r.expires_at.toISOString() }));
}

export async function refuseApproval(ctx: Ctx, id: string): Promise<void> {
  const user = ctx.principal();
  const { rowCount } = await ctx.db.query(
    "update withdrawal_approvals set status = 'refused', closed_at = now() where id = $1::bigint and user_id = $2::uuid and status = 'pending'",
    [id, user.id],
  );
  if (!rowCount) throw new AppError('approval_not_found');
  await audit(ctx.db, auditActor(ctx), { action: 'counter.approval_refused', targetType: 'withdrawal_approval', targetId: id });
}
