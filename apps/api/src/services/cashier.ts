/**
 * The shop counter: what a signed-in shop worker (role 'cashier') can do for walk-in players.
 *
 *   - find a player (exact account number, phone, username or e-mail - never a broad search)
 *   - take a cash deposit (wallet + shop cash in one transaction, shop currency only)
 *   - open a player account at the counter (temporary password, changed at first sign-in)
 *   - pay withdrawals (see withdrawals.ts)
 *   - see their own movements (the shop manager sees the whole shop) and print receipts
 *   - record cash counts (shop manager)
 */
import type { Queryable } from '@aurum/db';
import { parseAmountInput } from '@aurum/money';
import type { MoneyDTO } from '@aurum/money';
import { AppError, MIN_AGE, TERMS_VERSION, ageOn, normalizeEmail, todayUtc, toE164 } from '@aurum/shared';
import type { ShopCashEntryType, UserStatus } from '@aurum/shared';
import { money } from '../errors.ts';
import type { Ctx, SessionUser } from '../http/types.ts';
import { hashPassword } from '../security/password.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import type { Page } from './balances.ts';
import { getShop, getShopCashEntry, listShopCash } from './shops.ts';
import type { ShopCashEntryDTO, ShopDTO } from './shops.ts';
import { generateTemporaryPassword } from './users.ts';

const dto = (amountMinor: string | bigint, currency: string): MoneyDTO => ({ amountMinor: amountMinor.toString(), currency });

function shopIdOf(user: SessionUser): string {
  if (user.role !== 'cashier' || !user.shopId) throw new AppError('forbidden');
  return user.shopId;
}

export interface CounterSummaryDTO {
  shop: ShopDTO;
  shopRole: 'manager' | 'cashier';
  /** Today (UTC) for the signed-in worker. */
  mine: { deposits: { count: number; total: MoneyDTO }; payouts: { count: number; total: MoneyDTO } };
  /** Today (UTC) for the whole shop: shop managers only. */
  shopToday: { deposits: { count: number; total: MoneyDTO }; payouts: { count: number; total: MoneyDTO } } | null;
  pendingWithdrawals: { count: number; total: MoneyDTO };
}

async function todayTotals(q: Queryable, shopId: string, currency: string, operatorId: string | null, now: Date) {
  const since = `${todayUtc(now)}T00:00:00.000Z`;
  const { rows } = await q.query<{ dep_n: string; dep_sum: string; pay_n: string; pay_sum: string }>(
    `select count(*) filter (where entry_type = 'player_deposit')::text as dep_n,
            coalesce(sum(amount_minor) filter (where entry_type = 'player_deposit'), 0)::text as dep_sum,
            count(*) filter (where entry_type = 'withdrawal_payout')::text as pay_n,
            coalesce(sum(amount_minor) filter (where entry_type = 'withdrawal_payout'), 0)::text as pay_sum
       from shop_cash_entries
      where shop_id = $1::bigint and created_at >= $2::timestamptz and ($3::uuid is null or operator_id = $3::uuid)`,
    [shopId, since, operatorId],
  );
  const r = rows[0] ?? { dep_n: '0', dep_sum: '0', pay_n: '0', pay_sum: '0' };
  return {
    deposits: { count: Number(r.dep_n), total: dto(r.dep_sum, currency) },
    payouts: { count: Number(r.pay_n), total: dto(r.pay_sum, currency) },
  };
}

export async function counterSummary(ctx: Ctx): Promise<CounterSummaryDTO> {
  const user = ctx.principal();
  const shopId = shopIdOf(user);
  const shop = await getShop(ctx.db, shopId);
  if (!shop) throw new AppError('shop_not_found');
  const pending = await ctx.db.query<{ n: string; total: string }>(
    "select count(*)::text as n, coalesce(sum(amount_minor), 0)::text as total from withdrawal_requests where status = 'pending' and currency = $1",
    [shop.currency],
  );
  return {
    shop,
    shopRole: user.shopRole ?? 'cashier',
    mine: await todayTotals(ctx.db, shopId, shop.currency, user.id, ctx.now),
    shopToday: user.shopRole === 'manager' ? await todayTotals(ctx.db, shopId, shop.currency, null, ctx.now) : null,
    pendingWithdrawals: { count: Number(pending.rows[0]?.n ?? '0'), total: dto(pending.rows[0]?.total ?? '0', shop.currency) },
  };
}

// ---------------------------------------------------------------------------
// Finding a player at the counter
// ---------------------------------------------------------------------------
export interface CounterPlayerDTO {
  id: string;
  accountNo: string;
  username: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  currency: string | null;
  country: string | null;
}

/**
 * Exact matches only (account number, username, e-mail or phone in international format):
 * a cashier cannot browse the player list.
 */
export async function findPlayers(ctx: Ctx, query: string): Promise<CounterPlayerDTO[]> {
  const user = ctx.principal();
  shopIdOf(user);
  const limit = ctx.services.limiter.hit(`counter-find:${user.id}`, 120, 15 * 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });
  const text = query.trim();
  if (text.length < 3) return [];
  const phone = /^\+[\d\s.()-]{6,24}$/.test(text) ? `+${text.replace(/\D/g, '')}` : null;
  const accountNo = /^\d{1,15}$/.test(text) ? text : null;
  const { rows } = await ctx.db.query<{
    id: string; account_no: string; username: string; first_name: string; last_name: string; status: UserStatus; account_currency: string | null; country_code: string | null;
  }>(
    `select id::text, account_no::text, username, first_name, last_name, status::text, account_currency, country_code
       from users
      where role = 'user'
        and (lower(username) = lower($1) or lower(email) = lower($1) or phone = $2 or account_no = $3::bigint)
      order by account_no limit 5`,
    [text, phone, accountNo],
  );
  return rows.map((r) => ({
    id: r.id,
    accountNo: r.account_no,
    username: r.username,
    firstName: r.first_name,
    lastName: r.last_name,
    status: r.status,
    currency: r.account_currency,
    country: r.country_code,
  }));
}

// ---------------------------------------------------------------------------
// Cash deposit
// ---------------------------------------------------------------------------
export interface CounterDepositResult {
  replayed: boolean;
  cashEntry: ShopCashEntryDTO;
  walletBalanceAfter: MoneyDTO;
}

export async function counterDeposit(ctx: Ctx, input: { playerId: string; amount: string; idempotencyKey: string }): Promise<CounterDepositResult> {
  const user = ctx.principal();
  const shopId = shopIdOf(user);
  const shop = await getShop(ctx.db, shopId);
  if (!shop) throw new AppError('shop_not_found');
  const decimals = await ctx.db.query<{ decimals: number }>('select decimals::int as decimals from currencies where code = $1', [shop.currency]);
  const d = decimals.rows[0]?.decimals;
  if (d === undefined) throw new AppError('internal_error', { message: `currency ${shop.currency} is missing` });
  const amountMinor = money(() => parseAmountInput(input.amount, d, { allowNegative: false }));
  if (amountMinor < 1n) throw new AppError('invalid_amount', { fields: { amount: 'invalidAmount' } });
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ o_replayed: boolean; o_cash_entry_id: string; o_wallet_balance_after_minor: string; o_currency: string }>(
      `select o_replayed, o_cash_entry_id::text, o_wallet_balance_after_minor::text, o_currency
         from shop_player_deposit($1::bigint, $2::uuid, $3::bigint, $4::uuid, $5)`,
      [shopId, input.playerId, amountMinor.toString(), user.id, input.idempotencyKey],
    );
    const row = rows[0];
    if (!row) throw new AppError('internal_error', { message: 'shop_player_deposit returned no row' });
    if (!row.o_replayed) {
      await audit(tx, auditActor(ctx), {
        action: 'shop.deposit',
        targetType: 'user',
        targetId: input.playerId,
        details: { shopId, cashEntryId: row.o_cash_entry_id, amountMinor: amountMinor.toString(), currency: row.o_currency },
      });
    }
    const cashEntry = await getShopCashEntry(tx, row.o_cash_entry_id);
    if (!cashEntry) throw new AppError('internal_error', { message: 'cash entry could not be read back' });
    return { replayed: row.o_replayed, cashEntry, walletBalanceAfter: dto(row.o_wallet_balance_after_minor, row.o_currency) };
  });
}

// ---------------------------------------------------------------------------
// Opening an account at the counter
// ---------------------------------------------------------------------------
export interface CounterRegisterInput {
  username: string;
  email: string;
  callingCode: string;
  mobile: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
  /** The cashier confirms the player is present, showed an ID proving 18+, and accepted the terms. */
  termsAcceptedInPerson: boolean;
  preferredLocale?: string | undefined;
}

export async function counterRegisterPlayer(ctx: Ctx, input: CounterRegisterInput): Promise<{ player: CounterPlayerDTO; temporaryPassword: string }> {
  const user = ctx.principal();
  const shopId = shopIdOf(user);
  const shop = await getShop(ctx.db, shopId);
  if (!shop || shop.status !== 'active') throw new AppError('shop_not_active');
  if (!input.termsAcceptedInPerson) throw new AppError('terms_required', { fields: { termsAcceptedInPerson: 'mustAcceptTerms' } });
  if (ageOn(input.dateOfBirth, todayUtc(ctx.now)) < MIN_AGE) throw new AppError('under_age', { fields: { dateOfBirth: 'mustBeAdult' } });
  const phone = toE164(input.callingCode, input.mobile);
  if (!phone) throw new AppError('validation', { fields: { mobile: 'invalidPhone' } });
  const country = await ctx.db.query('select 1 from countries where code = $1 and is_enabled', [input.country]);
  if (country.rowCount === 0) throw new AppError('country_unavailable', { fields: { country: 'invalidChoice' } });
  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword, ctx.config.scryptLog2N);
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into users (username, email, phone, password_hash, first_name, last_name, date_of_birth, country_code,
                          account_currency, preferred_locale, terms_accepted_at, terms_version, must_change_password, created_by)
       values ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11::timestamptz, $12, true, $13::uuid) returning id::text`,
      [input.username, normalizeEmail(input.email), phone, hash, input.firstName, input.lastName, input.dateOfBirth, input.country,
       shop.currency, input.preferredLocale ?? null, ctx.now.toISOString(), TERMS_VERSION, user.id],
    );
    const id = (rows[0] as { id: string }).id;
    await audit(tx, auditActor(ctx), { action: 'shop.player_registered', targetType: 'user', targetId: id, details: { shopId, currency: shop.currency, country: input.country } });
    const created = await tx.query<{ account_no: string }>('select account_no::text from users where id = $1::uuid', [id]);
    return {
      player: {
        id,
        accountNo: (created.rows[0] as { account_no: string }).account_no,
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        status: 'active',
        currency: shop.currency,
        country: input.country,
      },
      temporaryPassword,
    };
  });
}

// ---------------------------------------------------------------------------
// Movements and receipts
// ---------------------------------------------------------------------------
export async function counterTransactions(
  ctx: Ctx,
  filter: { scope: 'mine' | 'shop'; entryType?: ShopCashEntryType | undefined; from?: string | undefined; to?: string | undefined; beforeId?: string | undefined; limit?: number | undefined },
): Promise<Page<ShopCashEntryDTO>> {
  const user = ctx.principal();
  const shopId = shopIdOf(user);
  if (filter.scope === 'shop' && user.shopRole !== 'manager') throw new AppError('forbidden');
  return listShopCash(ctx.db, {
    shopId,
    ...(filter.scope === 'mine' ? { operatorId: user.id } : {}),
    ...(filter.entryType ? { entryTypes: [filter.entryType] } : {}),
    from: filter.from,
    to: filter.to,
    beforeId: filter.beforeId,
    limit: filter.limit,
  });
}

/** A receipt for one movement of this shop (a cashier sees only their own, the manager the whole shop). */
export async function counterReceipt(ctx: Ctx, cashEntryId: string): Promise<{ entry: ShopCashEntryDTO; shop: ShopDTO }> {
  const user = ctx.principal();
  const shopId = shopIdOf(user);
  const entry = await getShopCashEntry(ctx.db, cashEntryId);
  if (!entry || entry.shop.id !== shopId) throw new AppError('not_found');
  if (user.shopRole !== 'manager' && entry.operator.id !== user.id) throw new AppError('not_found');
  const shop = await getShop(ctx.db, shopId);
  if (!shop) throw new AppError('shop_not_found');
  return { entry, shop };
}
