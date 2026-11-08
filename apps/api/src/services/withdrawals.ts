/**
 * Withdrawals collected in cash at a shop.
 *
 *   1. The player asks for a withdrawal online: the amount is reserved at once (wallet debit,
 *      entry type withdrawal_request) and a one-time pickup code is shown in their account.
 *   2. At any active shop that handles the same currency, a cashier finds the request with the
 *      code AND the player's account number, phone or username, checks the player's identity
 *      document, and pays the cash (shop cash -amount, request -> paid). It can be paid once.
 *   3. Otherwise the reservation is released back to the wallet: cancelled by the player,
 *      rejected by head office (with a reason), or expired after the configured time.
 *
 * All state changes run in the database functions withdrawal_create / _pay / _close.
 */
import { randomInt } from 'node:crypto';
import type { Db, Queryable } from '@aurum/db';
import { isPgError } from '@aurum/db';
import { parseAmountInput } from '@aurum/money';
import type { MoneyDTO } from '@aurum/money';
import {
  AppError,
  WITHDRAWAL_CODE_ALPHABET,
  WITHDRAWAL_CODE_LENGTH,
  formatWithdrawalCode,
  normalizeWithdrawalCode,
} from '@aurum/shared';
import type { WithdrawalStatus } from '@aurum/shared';
import { money } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import type { Page } from './balances.ts';
import { getShopCashEntry } from './shops.ts';
import type { ShopCashEntryDTO } from './shops.ts';
import { getSettings } from './settings.ts';

const dto = (amountMinor: string | bigint, currency: string): MoneyDTO => ({ amountMinor: amountMinor.toString(), currency });

export function generateWithdrawalCode(): string {
  let out = '';
  for (let i = 0; i < WITHDRAWAL_CODE_LENGTH; i++) out += WITHDRAWAL_CODE_ALPHABET[randomInt(WITHDRAWAL_CODE_ALPHABET.length)];
  return out;
}

export interface WithdrawalDTO {
  id: string;
  /** Formatted pickup code, e.g. "K7Q2M-9XPAB". */
  code: string;
  status: WithdrawalStatus;
  amount: MoneyDTO;
  createdAt: string;
  expiresAt: string;
  preferredShop: { id: string; code: string; name: string; city: string } | null;
  paidAt: string | null;
  paidShop: { id: string; code: string; name: string; city: string } | null;
  closedAt: string | null;
  /** Shown to the player for a rejection; internal otherwise. */
  closeReason: string | null;
}

/** What head office sees in addition. */
export interface StaffWithdrawalDTO extends WithdrawalDTO {
  player: { id: string; accountNo: string; username: string; firstName: string; lastName: string };
  paidBy: { id: string; username: string } | null;
  closedBy: { id: string; username: string } | null;
  idCheckNote: string | null;
  payoutCashEntryId: string | null;
}

interface WithdrawalRow {
  id: string;
  code: string;
  status: WithdrawalStatus;
  currency: string;
  amount_minor: string;
  created_at: Date;
  expires_at: Date;
  pref_id: string | null;
  pref_code: string | null;
  pref_name: string | null;
  pref_city: string | null;
  paid_at: Date | null;
  paid_shop_id: string | null;
  paid_shop_code: string | null;
  paid_shop_name: string | null;
  paid_shop_city: string | null;
  closed_at: Date | null;
  close_reason: string | null;
  user_id: string;
  account_no: string;
  username: string;
  first_name: string;
  last_name: string;
  paid_by: string | null;
  paid_by_username: string | null;
  closed_by: string | null;
  closed_by_username: string | null;
  id_check_note: string | null;
  payout_cash_entry_id: string | null;
}

const SELECT = `select r.id::text, r.code, r.status, r.currency, r.amount_minor::text, r.created_at, r.expires_at,
       ps.id::text as pref_id, ps.code as pref_code, ps.name as pref_name, ps.city as pref_city,
       r.paid_at, r.paid_shop_id::text, s.code as paid_shop_code, s.name as paid_shop_name, s.city as paid_shop_city,
       r.closed_at, r.close_reason,
       u.id::text as user_id, u.account_no::text, u.username, u.first_name, u.last_name,
       r.paid_by::text, pb.username as paid_by_username, r.closed_by::text, cb.username as closed_by_username,
       r.id_check_note, r.payout_cash_entry_id::text
  from withdrawal_requests r
  join users u on u.id = r.user_id
  left join shops ps on ps.id = r.preferred_shop_id
  left join shops s on s.id = r.paid_shop_id
  left join users pb on pb.id = r.paid_by
  left join users cb on cb.id = r.closed_by`;

function toPlayerDTO(r: WithdrawalRow): WithdrawalDTO {
  return {
    id: r.id,
    code: formatWithdrawalCode(r.code),
    status: r.status,
    amount: dto(r.amount_minor, r.currency),
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    preferredShop: r.pref_id && r.pref_code && r.pref_name ? { id: r.pref_id, code: r.pref_code, name: r.pref_name, city: r.pref_city ?? '' } : null,
    paidAt: r.paid_at ? r.paid_at.toISOString() : null,
    paidShop: r.paid_shop_id && r.paid_shop_code && r.paid_shop_name ? { id: r.paid_shop_id, code: r.paid_shop_code, name: r.paid_shop_name, city: r.paid_shop_city ?? '' } : null,
    closedAt: r.closed_at ? r.closed_at.toISOString() : null,
    closeReason: r.status === 'rejected' ? r.close_reason : null,
  };
}

function toStaffDTO(r: WithdrawalRow): StaffWithdrawalDTO {
  return {
    ...toPlayerDTO(r),
    closeReason: r.close_reason,
    player: { id: r.user_id, accountNo: r.account_no, username: r.username, firstName: r.first_name, lastName: r.last_name },
    paidBy: r.paid_by && r.paid_by_username ? { id: r.paid_by, username: r.paid_by_username } : null,
    closedBy: r.closed_by && r.closed_by_username ? { id: r.closed_by, username: r.closed_by_username } : null,
    idCheckNote: r.id_check_note,
    payoutCashEntryId: r.payout_cash_entry_id,
  };
}

export interface WithdrawalFilter {
  id?: string | undefined;
  userId?: string | undefined;
  status?: WithdrawalStatus | undefined;
  shopId?: string | undefined;
  currency?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  beforeId?: string | undefined;
  limit?: number | undefined;
}

async function queryWithdrawals(q: Queryable, filter: WithdrawalFilter): Promise<{ rows: WithdrawalRow[]; limit: number }> {
  const limit = Math.min(Math.max(filter.limit ?? 25, 1), 200);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace(/\?/g, `$${params.length}`));
  };
  if (filter.id) add('r.id = ?::bigint', filter.id);
  if (filter.userId) add('r.user_id = ?::uuid', filter.userId);
  if (filter.status) add('r.status = ?', filter.status);
  if (filter.shopId) add('(r.paid_shop_id = ?::bigint or r.preferred_shop_id = ?::bigint)', filter.shopId);
  if (filter.currency) add('r.currency = ?', filter.currency);
  if (filter.from) add('r.created_at >= ?::timestamptz', filter.from);
  if (filter.to) add('r.created_at < ?::timestamptz', filter.to);
  if (filter.beforeId) add('r.id < ?::bigint', filter.beforeId);
  params.push(limit + 1);
  const { rows } = await q.query<WithdrawalRow>(`${SELECT} ${where.length ? `where ${where.join(' and ')}` : ''} order by r.id desc limit $${params.length}`, params);
  return { rows, limit };
}

export async function listPlayerWithdrawals(q: Queryable, userId: string, filter: Omit<WithdrawalFilter, 'userId'> = {}): Promise<Page<WithdrawalDTO>> {
  const { rows, limit } = await queryWithdrawals(q, { ...filter, userId });
  const items = rows.slice(0, limit).map(toPlayerDTO);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? last.id : null };
}

export async function listWithdrawals(q: Queryable, filter: WithdrawalFilter): Promise<Page<StaffWithdrawalDTO>> {
  const { rows, limit } = await queryWithdrawals(q, filter);
  const items = rows.slice(0, limit).map(toStaffDTO);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? last.id : null };
}

export async function getWithdrawal(q: Queryable, id: string): Promise<StaffWithdrawalDTO | null> {
  const { rows } = await queryWithdrawals(q, { id, limit: 1 });
  return rows[0] ? toStaffDTO(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
export interface NewWithdrawalInput {
  amount: string;
  preferredShopId?: string | undefined;
  idempotencyKey: string;
}

export async function requestWithdrawal(ctx: Ctx, input: NewWithdrawalInput): Promise<{ withdrawal: WithdrawalDTO; replayed: boolean }> {
  const user = ctx.principal();
  const settings = await getSettings(ctx.db);
  if (!settings.withdrawals_open) throw new AppError('withdrawals_closed');
  // The welcome gift alone can never be cashed out: a withdrawal needs at least one real deposit.
  const deposited = await ctx.db.query<{ ok: boolean }>(
    `select exists (select 1 from ledger_entries e join wallets w on w.id = e.wallet_id
                     where w.user_id = $1::uuid and w.kind = 'main' and e.entry_type in ('deposit', 'deposit_crypto')) as ok`,
    [user.id],
  );
  if (deposited.rows[0]?.ok !== true) throw new AppError('withdrawal_needs_deposit');
  const { rows: walletRows } = await ctx.db.query<{ currency: string; decimals: number }>(
    `select w.currency, c.decimals::int as decimals from wallets w join currencies c on c.code = w.currency
      where w.user_id = $1::uuid and w.kind = 'main'`,
    [user.id],
  );
  const wallet = walletRows[0];
  if (!wallet) throw new AppError('wallet_not_found');
  const amountMinor = money(() => parseAmountInput(input.amount, wallet.decimals, { allowNegative: false }));
  if (amountMinor < 1n) throw new AppError('invalid_amount', { fields: { amount: 'invalidAmount' } });
  const expiresAt = new Date(ctx.now.getTime() + settings.withdrawal_expiry_hours * 3_600_000);

  for (let attempt = 0; ; attempt++) {
    const code = generateWithdrawalCode();
    try {
      return await ctx.db.transaction(async (tx) => {
        const { rows } = await tx.query<{ o_replayed: boolean; o_id: string }>(
          'select o_replayed, o_id::text from withdrawal_create($1::uuid, $2::bigint, $3, $4::timestamptz, $5::bigint, $6)',
          [user.id, amountMinor.toString(), code, expiresAt.toISOString(), input.preferredShopId ?? null, input.idempotencyKey],
        );
        const row = rows[0] as { o_replayed: boolean; o_id: string };
        if (!row.o_replayed) {
          await audit(tx, auditActor(ctx), {
            action: 'withdrawal.requested',
            targetType: 'withdrawal',
            targetId: row.o_id,
            details: { amountMinor: amountMinor.toString(), currency: wallet.currency, preferredShopId: input.preferredShopId ?? null },
          });
        }
        const page = await listPlayerWithdrawals(tx, user.id, { id: row.o_id, limit: 1 });
        return { withdrawal: page.items[0] as WithdrawalDTO, replayed: row.o_replayed };
      });
    } catch (error) {
      const raw = error instanceof AppError ? error.cause : error;
      // a pickup code collision (one in billions) simply gets a new code
      if (attempt < 4 && isPgError(raw) && raw.code === '23505' && raw.constraint === 'withdrawal_requests_code_key') continue;
      throw error;
    }
  }
}

export async function cancelOwnWithdrawal(ctx: Ctx, id: string): Promise<WithdrawalDTO> {
  const user = ctx.principal();
  return ctx.db.transaction(async (tx) => {
    const owned = await tx.query<{ status: WithdrawalStatus }>('select status from withdrawal_requests where id = $1::bigint and user_id = $2::uuid', [id, user.id]);
    if (!owned.rows[0]) throw new AppError('withdrawal_not_found');
    await tx.query("select * from withdrawal_close($1::bigint, 'cancelled', $2::uuid, null)", [id, user.id]);
    await audit(tx, auditActor(ctx), { action: 'withdrawal.cancelled', targetType: 'withdrawal', targetId: id });
    const page = await listPlayerWithdrawals(tx, user.id, { id, limit: 1 });
    return page.items[0] as WithdrawalDTO;
  });
}

// ---------------------------------------------------------------------------
// Head office
// ---------------------------------------------------------------------------
export async function rejectWithdrawal(ctx: Ctx, id: string, reason: string): Promise<StaffWithdrawalDTO> {
  return ctx.db.transaction(async (tx) => {
    await tx.query("select * from withdrawal_close($1::bigint, 'rejected', $2::uuid, $3)", [id, ctx.principal().id, reason]);
    await audit(tx, auditActor(ctx), { action: 'withdrawal.rejected', targetType: 'withdrawal', targetId: id, details: { reason: reason.trim() } });
    return (await getWithdrawal(tx, id)) as StaffWithdrawalDTO;
  });
}

/** Releases every request whose pickup time is over. Called on a timer by the API process. */
export async function expireDueWithdrawals(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number }>('select withdrawal_expire_due(500) as n');
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Shop cashier
// ---------------------------------------------------------------------------
export interface PayoutLookupDTO {
  withdrawal: WithdrawalDTO;
  /** Identity to compare with the player's ID document before paying. */
  player: { id: string; accountNo: string; username: string; firstName: string; lastName: string; dateOfBirth: string | null; country: string | null };
  /** true when this shop can pay it now (pending, not expired, same currency, within the limit). */
  payable: boolean;
  /** Why it cannot be paid here, as an error code, when payable is false. */
  blockedBy: string | null;
}

/**
 * Finds a request by pickup code, but only together with something the player must also
 * know (account number, phone or username), so a code alone reveals nothing.
 */
export async function lookupForPayout(ctx: Ctx, input: { code: string; account: string }): Promise<PayoutLookupDTO> {
  const cashier = ctx.principal();
  const limit = ctx.services.limiter.hit(`payout-lookup:${cashier.id}`, 30, 15 * 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });
  const code = normalizeWithdrawalCode(input.code);
  const account = input.account.trim();
  // a phone number typed in international format ("+216 20 123 456")
  const phone = /^\+[\d\s.()-]{6,24}$/.test(account) ? `+${account.replace(/\D/g, '')}` : null;
  let row: (WithdrawalRow & { date_of_birth: string | null; country_code: string | null }) | undefined;
  if (code && account) {
    const { rows } = await ctx.db.query<WithdrawalRow & { date_of_birth: string | null; country_code: string | null }>(
      `${SELECT.replace('from withdrawal_requests r', ", to_char(u.date_of_birth, 'YYYY-MM-DD') as date_of_birth, u.country_code from withdrawal_requests r")}
        where r.code = $1 and (u.account_no::text = $2 or lower(u.username) = lower($2) or u.phone = $2 or u.phone = $3)`,
      [code, account, phone],
    );
    row = rows[0];
  }
  if (!row) {
    await audit(ctx.db, auditActor(ctx), { action: 'withdrawal.lookup_failed', targetType: 'shop', targetId: cashier.shopId ?? '' });
    throw new AppError('withdrawal_not_found');
  }
  const shop = await ctx.db.query<{ status: string; currency: string; max_payout_minor: string | null }>(
    'select status, currency, max_payout_minor::text from shops where id = $1::bigint',
    [cashier.shopId],
  );
  const s = shop.rows[0];
  let blockedBy: string | null = null;
  if (row.status !== 'pending') blockedBy = 'withdrawal_not_pending';
  else if (row.expires_at.getTime() <= Date.now()) blockedBy = 'withdrawal_expired';
  else if (!s || s.status !== 'active') blockedBy = 'shop_not_active';
  else if (s.currency !== row.currency) blockedBy = 'shop_currency_mismatch';
  else if (s.max_payout_minor && BigInt(row.amount_minor) > BigInt(s.max_payout_minor)) blockedBy = 'shop_limit_exceeded';
  await audit(ctx.db, auditActor(ctx), { action: 'withdrawal.looked_up', targetType: 'withdrawal', targetId: row.id, details: { shopId: cashier.shopId, payable: blockedBy === null } });
  return {
    withdrawal: toPlayerDTO(row),
    player: {
      id: row.user_id,
      accountNo: row.account_no,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      dateOfBirth: row.date_of_birth,
      country: row.country_code,
    },
    payable: blockedBy === null,
    blockedBy,
  };
}

export interface PayoutResult {
  withdrawal: WithdrawalDTO;
  cashEntry: ShopCashEntryDTO;
  replayed: boolean;
}

/** Pays a pending request in cash at the cashier's shop. The cashier confirms the ID check. */
export async function payWithdrawal(ctx: Ctx, id: string, input: { idChecked: boolean; note?: string | undefined }): Promise<PayoutResult> {
  const cashier = ctx.principal();
  if (!input.idChecked) throw new AppError('validation', { fields: { idChecked: 'required' } });
  if (!cashier.shopId) throw new AppError('forbidden');
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ o_replayed: boolean; o_cash_entry_id: string }>(
      'select o_replayed, o_cash_entry_id::text from withdrawal_pay($1::bigint, $2::bigint, $3::uuid, $4)',
      [id, cashier.shopId, cashier.id, input.note?.trim() || null],
    );
    const row = rows[0] as { o_replayed: boolean; o_cash_entry_id: string };
    const withdrawal = (await getWithdrawal(tx, id)) as StaffWithdrawalDTO;
    if (!row.o_replayed) {
      await audit(tx, auditActor(ctx), {
        action: 'withdrawal.paid',
        targetType: 'withdrawal',
        targetId: id,
        details: { shopId: cashier.shopId, cashEntryId: row.o_cash_entry_id, amountMinor: withdrawal.amount.amountMinor, currency: withdrawal.amount.currency },
      });
    }
    const cashEntry = await getShopCashEntry(tx, row.o_cash_entry_id);
    if (!cashEntry) throw new AppError('internal_error', { message: 'payout cash entry could not be read back' });
    const { player: _player, paidBy: _paidBy, closedBy: _closedBy, idCheckNote: _note, payoutCashEntryId: _entry, ...playerView } = withdrawal;
    return { withdrawal: playerView, cashEntry, replayed: row.o_replayed };
  });
}
