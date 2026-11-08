/**
 * Shops (head-office side): the shop list, shop details and limits, the shop cash ledger,
 * cash movements recorded by head office (float, collection, corrections), cash counts,
 * reports, and the shop workers (users with role 'cashier').
 *
 * A shop's expected cash only changes through the database function shop_cash_post(); this
 * module never updates a balance itself. Money is always reported per currency.
 */
import type { Queryable } from '@aurum/db';
import { parseAmountInput } from '@aurum/money';
import type { MoneyDTO } from '@aurum/money';
import { AppError, normalizeEmail, toE164 } from '@aurum/shared';
import type { ShopCashEntryType, ShopCreditEntryType, ShopRole, ShopStatus, StaffShopCashEntryType, StaffShopCreditEntryType, UserStatus } from '@aurum/shared';
import { isPgError } from '@aurum/db';
import { money } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import { hashPassword } from '../security/password.ts';
import { revokeUserSessions } from '../security/session.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import type { Page } from './balances.ts';
import { generateTemporaryPassword } from './users.ts';

const dto = (amountMinor: string | bigint, currency: string): MoneyDTO => ({ amountMinor: amountMinor.toString(), currency });

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------
export interface ShopDTO {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  openingHours: string;
  currency: string;
  status: ShopStatus;
  isListed: boolean;
  maxDeposit: MoneyDTO | null;
  maxPayout: MoneyDTO | null;
  allowNegativeCash: boolean;
  cashBalance: MoneyDTO;
  /** Prepaid balance the shop can still give to players (recharged by head office). */
  creditBalance: MoneyDTO;
  activeWorkers: number;
  createdAt: string;
  updatedAt: string;
}

interface ShopRow {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  opening_hours: string;
  currency: string;
  status: ShopStatus;
  is_listed: boolean;
  max_deposit_minor: string | null;
  max_payout_minor: string | null;
  allow_negative_cash: boolean;
  cash_balance_minor: string;
  credit_balance_minor: string;
  active_workers: string;
  created_at: Date;
  updated_at: Date;
}

const SHOP_SELECT = `select s.id::text, s.code, s.name, s.city, s.address, s.phone, s.opening_hours, s.currency, s.status,
       s.is_listed, s.max_deposit_minor::text, s.max_payout_minor::text, s.allow_negative_cash,
       s.cash_balance_minor::text, s.credit_balance_minor::text, s.created_at, s.updated_at,
       (select count(*) from users w where w.shop_id = s.id and w.status = 'active')::text as active_workers
  from shops s`;

function toShop(r: ShopRow): ShopDTO {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    city: r.city,
    address: r.address,
    phone: r.phone,
    openingHours: r.opening_hours,
    currency: r.currency,
    status: r.status,
    isListed: r.is_listed,
    maxDeposit: r.max_deposit_minor ? dto(r.max_deposit_minor, r.currency) : null,
    maxPayout: r.max_payout_minor ? dto(r.max_payout_minor, r.currency) : null,
    allowNegativeCash: r.allow_negative_cash,
    cashBalance: dto(r.cash_balance_minor, r.currency),
    creditBalance: dto(r.credit_balance_minor, r.currency),
    activeWorkers: Number(r.active_workers),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface ShopFilter {
  status?: ShopStatus | undefined;
  search?: string | undefined;
}

export async function listShops(q: Queryable, filter: ShopFilter = {}): Promise<ShopDTO[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(filter.status);
    where.push(`s.status = $${params.length}`);
  }
  const search = filter.search?.trim().toLowerCase();
  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(lower(s.code) like $${params.length} or lower(s.name) like $${params.length} or lower(s.city) like $${params.length})`);
  }
  const { rows } = await q.query<ShopRow>(`${SHOP_SELECT} ${where.length ? `where ${where.join(' and ')}` : ''} order by s.status, s.city, s.name, s.id`, params);
  return rows.map(toShop);
}

export async function getShop(q: Queryable, id: string): Promise<ShopDTO | null> {
  const { rows } = await q.query<ShopRow>(`${SHOP_SELECT} where s.id = $1::bigint`, [id]);
  return rows[0] ? toShop(rows[0]) : null;
}

export interface PublicShopDTO {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  openingHours: string;
  currency: string;
}

/** Shops a visitor may go to: active and listed. Never shows cash, limits or workers. */
export async function publicShops(q: Queryable, currency?: string): Promise<PublicShopDTO[]> {
  const { rows } = await q.query<{ id: string; code: string; name: string; city: string; address: string; phone: string | null; opening_hours: string; currency: string }>(
    `select id::text, code, name, city, address, phone, opening_hours, currency from shops
      where status = 'active' and is_listed and ($1::text is null or currency = $1)
      order by city, name, id`,
    [currency ?? null],
  );
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, city: r.city, address: r.address, phone: r.phone, openingHours: r.opening_hours, currency: r.currency }));
}

export interface ShopInput {
  code: string;
  name: string;
  city: string;
  address: string;
  callingCode?: string | undefined;
  mobile?: string | undefined;
  openingHours: string;
  currency: string;
  status: ShopStatus;
  isListed: boolean;
  /** Amounts typed by staff in the shop currency ("5000" or "5000.000"); empty = no limit. */
  maxDeposit?: string | undefined;
  maxPayout?: string | undefined;
  allowNegativeCash: boolean;
}

async function currencyDecimals(q: Queryable, code: string): Promise<{ decimals: number; isEnabled: boolean } | null> {
  const { rows } = await q.query<{ decimals: number; is_enabled: boolean }>('select decimals::int as decimals, is_enabled from currencies where code = $1', [code]);
  return rows[0] ? { decimals: rows[0].decimals, isEnabled: rows[0].is_enabled } : null;
}

function optionalLimit(raw: string | undefined, decimals: number, field: string): bigint | null {
  if (raw === undefined || raw.trim() === '') return null;
  const minor = money(() => parseAmountInput(raw, decimals, { allowNegative: false }));
  if (minor < 1n) throw new AppError('invalid_amount', { fields: { [field]: 'invalidAmount' } });
  return minor;
}

function shopConflict(error: unknown): unknown {
  const raw = error instanceof AppError && error.code === 'conflict' ? error.cause : error;
  if (isPgError(raw) && raw.code === '23505' && raw.constraint === 'shops_code_key') {
    return new AppError('conflict', { fields: { code: 'alreadyExists' }, message: 'duplicate shop code', cause: raw });
  }
  return error;
}

/** Creates (id = null) or updates a shop. The currency of a shop with cash movements cannot change. */
export async function saveShop(ctx: Ctx, id: string | null, input: ShopInput): Promise<ShopDTO> {
  const currency = await currencyDecimals(ctx.db, input.currency);
  if (!currency || (id === null && !currency.isEnabled)) throw new AppError('currency_unavailable', { fields: { currency: 'invalidChoice' } });
  const maxDeposit = optionalLimit(input.maxDeposit, currency.decimals, 'maxDeposit');
  const maxPayout = optionalLimit(input.maxPayout, currency.decimals, 'maxPayout');
  let phone: string | null = null;
  if (input.mobile !== undefined && input.mobile.trim() !== '') {
    phone = toE164(input.callingCode ?? '', input.mobile);
    if (!phone) throw new AppError('validation', { fields: { mobile: 'invalidPhone' } });
  }
  try {
    return await ctx.db.transaction(async (tx) => {
      let shopId: string;
      let changes: Record<string, unknown> = {};
      if (id === null) {
        if (input.status === 'closed') throw new AppError('validation', { fields: { status: 'invalidChoice' } });
        const { rows } = await tx.query<{ id: string }>(
          `insert into shops (code, name, city, address, phone, opening_hours, currency, status, is_listed,
                              max_deposit_minor, max_payout_minor, allow_negative_cash, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::bigint, $11::bigint, $12, $13::uuid) returning id::text`,
          [input.code, input.name, input.city, input.address, phone, input.openingHours, input.currency, input.status, input.isListed,
           maxDeposit?.toString() ?? null, maxPayout?.toString() ?? null, input.allowNegativeCash, ctx.principal().id],
        );
        shopId = (rows[0] as { id: string }).id;
        changes = { code: input.code, currency: input.currency, status: input.status };
      } else {
        const before = await tx.query<{ status: ShopStatus; cash_balance_minor: string; currency: string; code: string }>(
          'select status, cash_balance_minor::text, currency, code from shops where id = $1::bigint for update',
          [id],
        );
        const row = before.rows[0];
        if (!row) throw new AppError('shop_not_found');
        if (input.status === 'closed' && row.status !== 'closed') {
          if (BigInt(row.cash_balance_minor) !== 0n) throw new AppError('conflict', { fields: { status: 'cashNotZero' } });
          const pendingPayouts = await tx.query('select 1 from withdrawal_requests where preferred_shop_id = $1::bigint and status = $2 limit 1', [id, 'pending']);
          if (pendingPayouts.rowCount > 0) throw new AppError('conflict', { fields: { status: 'pendingWithdrawals' } });
        }
        if (row.status === 'closed' && input.status !== 'closed') throw new AppError('shop_not_active', { fields: { status: 'invalidChoice' } });
        await tx.query(
          `update shops set code = $2, name = $3, city = $4, address = $5, phone = $6, opening_hours = $7, currency = $8,
                  status = $9, is_listed = $10, max_deposit_minor = $11::bigint, max_payout_minor = $12::bigint,
                  allow_negative_cash = $13
            where id = $1::bigint`,
          [id, input.code, input.name, input.city, input.address, phone, input.openingHours, input.currency, input.status, input.isListed,
           maxDeposit?.toString() ?? null, maxPayout?.toString() ?? null, input.allowNegativeCash],
        );
        shopId = id;
        changes = { status: { from: row.status, to: input.status }, ...(row.currency !== input.currency ? { currency: { from: row.currency, to: input.currency } } : {}) };
        // workers of a shop that stops trading are signed out at once
        if (input.status !== 'active' && row.status === 'active') {
          const workers = await tx.query<{ id: string }>('select id::text from users where shop_id = $1::bigint', [id]);
          for (const w of workers.rows) await revokeUserSessions(tx, w.id, ctx.now);
        }
      }
      await audit(tx, auditActor(ctx), { action: id === null ? 'shop.created' : 'shop.updated', targetType: 'shop', targetId: shopId, details: changes });
      const saved = await getShop(tx, shopId);
      if (!saved) throw new AppError('internal_error', { message: 'saved shop could not be read back' });
      return saved;
    });
  } catch (error) {
    throw shopConflict(error);
  }
}

/** Opens (active) or stops (suspended) a shop without touching its other details. Stopping signs its workers out. */
export async function setShopStatus(ctx: Ctx, id: string, status: 'active' | 'suspended'): Promise<ShopDTO> {
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ status: ShopStatus }>('select status from shops where id = $1::bigint for update', [id]);
    const row = rows[0];
    if (!row) throw new AppError('shop_not_found');
    if (row.status === 'closed') throw new AppError('shop_not_active', { fields: { status: 'invalidChoice' } });
    if (row.status !== status) {
      await tx.query('update shops set status = $2 where id = $1::bigint', [id, status]);
      if (status !== 'active') {
        const workers = await tx.query<{ id: string }>('select id::text from users where shop_id = $1::bigint', [id]);
        for (const w of workers.rows) await revokeUserSessions(tx, w.id, ctx.now);
      }
      await audit(tx, auditActor(ctx), { action: 'shop.updated', targetType: 'shop', targetId: id, details: { status: { from: row.status, to: status } } });
    }
    const saved = await getShop(tx, id);
    if (!saved) throw new AppError('shop_not_found');
    return saved;
  });
}

// ---------------------------------------------------------------------------
// Shop cash ledger
// ---------------------------------------------------------------------------
export interface ShopCashEntryDTO {
  id: string;
  createdAt: string;
  shop: { id: string; code: string; name: string };
  entryType: ShopCashEntryType;
  direction: 1 | -1;
  amount: MoneyDTO;
  balanceBefore: MoneyDTO;
  balanceAfter: MoneyDTO;
  operator: { id: string; username: string; role: string };
  player: { id: string; accountNo: string; username: string; firstName: string; lastName: string } | null;
  ledgerEntryId: string | null;
  withdrawal: { id: string; code: string } | null;
  reference: string | null;
  reason: string | null;
}

interface CashRow {
  id: string;
  created_at: Date;
  shop_id: string;
  shop_code: string;
  shop_name: string;
  entry_type: ShopCashEntryType;
  direction: number;
  currency: string;
  amount_minor: string;
  balance_before_minor: string;
  balance_after_minor: string;
  operator_id: string;
  operator_username: string;
  operator_role: string;
  player_id: string | null;
  player_account_no: string | null;
  player_username: string | null;
  player_first_name: string | null;
  player_last_name: string | null;
  ledger_entry_id: string | null;
  withdrawal_id: string | null;
  withdrawal_code: string | null;
  reference: string | null;
  reason: string | null;
}

const CASH_SELECT = `select c.id::text, c.created_at, c.shop_id::text, s.code as shop_code, s.name as shop_name, c.entry_type,
       c.direction, c.currency, c.amount_minor::text, c.balance_before_minor::text, c.balance_after_minor::text,
       c.operator_id::text, o.username as operator_username, o.role::text as operator_role,
       p.id::text as player_id, p.account_no::text as player_account_no, p.username as player_username,
       p.first_name as player_first_name, p.last_name as player_last_name,
       c.ledger_entry_id::text, c.withdrawal_id::text, wr.code as withdrawal_code, c.reference, c.reason
  from shop_cash_entries c
  join shops s on s.id = c.shop_id
  join users o on o.id = c.operator_id
  left join ledger_entries le on le.id = c.ledger_entry_id
  left join withdrawal_requests wr on wr.id = c.withdrawal_id
  left join users p on p.id = coalesce(le.user_id, wr.user_id)`;

function toCashEntry(r: CashRow): ShopCashEntryDTO {
  return {
    id: r.id,
    createdAt: r.created_at.toISOString(),
    shop: { id: r.shop_id, code: r.shop_code, name: r.shop_name },
    entryType: r.entry_type,
    direction: r.direction === 1 ? 1 : -1,
    amount: dto(r.amount_minor, r.currency),
    balanceBefore: dto(r.balance_before_minor, r.currency),
    balanceAfter: dto(r.balance_after_minor, r.currency),
    operator: { id: r.operator_id, username: r.operator_username, role: r.operator_role },
    player:
      r.player_id && r.player_account_no && r.player_username
        ? { id: r.player_id, accountNo: r.player_account_no, username: r.player_username, firstName: r.player_first_name ?? '', lastName: r.player_last_name ?? '' }
        : null,
    ledgerEntryId: r.ledger_entry_id,
    withdrawal: r.withdrawal_id && r.withdrawal_code ? { id: r.withdrawal_id, code: r.withdrawal_code } : null,
    reference: r.reference,
    reason: r.reason,
  };
}

export interface CashFilter {
  id?: string | undefined;
  shopId?: string | undefined;
  operatorId?: string | undefined;
  entryTypes?: readonly ShopCashEntryType[] | undefined;
  from?: string | undefined;
  to?: string | undefined;
  beforeId?: string | undefined;
  limit?: number | undefined;
}

export async function listShopCash(q: Queryable, filter: CashFilter): Promise<Page<ShopCashEntryDTO>> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (filter.id) add('c.id = ?::bigint', filter.id);
  if (filter.shopId) add('c.shop_id = ?::bigint', filter.shopId);
  if (filter.operatorId) add('c.operator_id = ?::uuid', filter.operatorId);
  if (filter.entryTypes && filter.entryTypes.length > 0) add('c.entry_type = any(?::text[])', [...filter.entryTypes]);
  if (filter.from) add('c.created_at >= ?::timestamptz', filter.from);
  if (filter.to) add('c.created_at < ?::timestamptz', filter.to);
  if (filter.beforeId) add('c.id < ?::bigint', filter.beforeId);
  params.push(limit + 1);
  const { rows } = await q.query<CashRow>(
    `${CASH_SELECT} ${where.length ? `where ${where.join(' and ')}` : ''} order by c.id desc limit $${params.length}`,
    params,
  );
  const items = rows.slice(0, limit).map(toCashEntry);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? last.id : null };
}

export async function getShopCashEntry(q: Queryable, id: string): Promise<ShopCashEntryDTO | null> {
  const page = await listShopCash(q, { id, limit: 1 });
  return page.items[0] ?? null;
}

export interface StaffCashInput {
  entryType: StaffShopCashEntryType;
  amount: string;
  reason?: string | undefined;
  reference?: string | undefined;
  idempotencyKey: string;
}

/** Head office records cash brought to or collected from a shop, or a correction. Safe to retry. */
export async function postStaffShopCash(ctx: Ctx, shopId: string, input: StaffCashInput): Promise<{ entry: ShopCashEntryDTO; replayed: boolean }> {
  const operator = ctx.principal();
  const shop = await getShop(ctx.db, shopId);
  if (!shop) throw new AppError('shop_not_found');
  const currency = await currencyDecimals(ctx.db, shop.currency);
  if (!currency) throw new AppError('internal_error', { message: `currency ${shop.currency} is missing` });
  const amountMinor = money(() => parseAmountInput(input.amount, currency.decimals, { allowNegative: false }));
  if (amountMinor < 1n) throw new AppError('invalid_amount', { fields: { amount: 'invalidAmount' } });
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ o_replayed: boolean; o_id: string; o_balance_after_minor: string }>(
      `select o_replayed, o_id::text, o_balance_after_minor::text
         from shop_cash_post($1::bigint, $2::text, $3::bigint, $4::text, $5::text, $6::uuid, $7::text, $8::text, null, null)`,
      [shopId, input.entryType, amountMinor.toString(), `staff-cash:${operator.id}`, input.idempotencyKey, operator.id, input.reason ?? null, input.reference ?? null],
    );
    const row = rows[0];
    if (!row) throw new AppError('internal_error', { message: 'shop_cash_post returned no row' });
    if (!row.o_replayed) {
      await audit(tx, auditActor(ctx), {
        action: 'shop.cash_posted',
        targetType: 'shop',
        targetId: shopId,
        details: { entryId: row.o_id, entryType: input.entryType, amountMinor: amountMinor.toString(), currency: shop.currency, balanceAfterMinor: row.o_balance_after_minor },
      });
    }
    const entry = await getShopCashEntry(tx, row.o_id);
    if (!entry) throw new AppError('internal_error', { message: 'posted cash entry could not be read back' });
    return { entry, replayed: row.o_replayed };
  });
}

// ---------------------------------------------------------------------------
// Prepaid shop balance (migration 0016): head office recharges, counter deposits use it
// ---------------------------------------------------------------------------
export interface ShopCreditEntryDTO {
  id: string;
  createdAt: string;
  shopId: string;
  entryType: ShopCreditEntryType;
  direction: 1 | -1;
  amount: MoneyDTO;
  balanceAfter: MoneyDTO;
  operator: { id: string; username: string };
  reason: string | null;
}

export async function listShopCredit(q: Queryable, shopId: string, limit = 50): Promise<ShopCreditEntryDTO[]> {
  const { rows } = await q.query<{
    id: string;
    created_at: Date;
    shop_id: string;
    currency: string;
    entry_type: ShopCreditEntryType;
    direction: number;
    amount_minor: string;
    balance_after_minor: string;
    operator_id: string;
    operator_username: string;
    reason: string | null;
  }>(
    `select e.id::text, e.created_at, e.shop_id::text, e.currency, e.entry_type, e.direction, e.amount_minor::text,
            e.balance_after_minor::text, e.operator_id::text, u.username as operator_username, e.reason
       from shop_credit_entries e join users u on u.id = e.operator_id
      where e.shop_id = $1::bigint
      order by e.id desc
      limit $2`,
    [shopId, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at.toISOString(),
    shopId: r.shop_id,
    entryType: r.entry_type,
    direction: r.direction === 1 ? 1 : -1,
    amount: dto(r.amount_minor, r.currency),
    balanceAfter: dto(r.balance_after_minor, r.currency),
    operator: { id: r.operator_id, username: r.operator_username },
    reason: r.reason,
  }));
}

export interface StaffCreditInput {
  entryType: StaffShopCreditEntryType;
  amount: string;
  reason?: string | undefined;
  idempotencyKey: string;
}

/** Head office recharges a shop's balance, or corrects a mistake. Safe to retry with the same key. */
export async function postShopCredit(ctx: Ctx, shopId: string, input: StaffCreditInput): Promise<{ shop: ShopDTO; replayed: boolean }> {
  const operator = ctx.principal();
  const shop = await getShop(ctx.db, shopId);
  if (!shop) throw new AppError('shop_not_found');
  const currency = await currencyDecimals(ctx.db, shop.currency);
  if (!currency) throw new AppError('internal_error', { message: `currency ${shop.currency} is missing` });
  const amountMinor = money(() => parseAmountInput(input.amount, currency.decimals, { allowNegative: false }));
  if (amountMinor < 1n) throw new AppError('invalid_amount', { fields: { amount: 'invalidAmount' } });
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ o_replayed: boolean; o_id: string; o_balance_after_minor: string }>(
      `select o_replayed, o_id::text, o_balance_after_minor::text
         from shop_credit_post($1::bigint, $2::text, $3::bigint, $4::text, $5::text, $6::uuid, $7::text, null)`,
      [shopId, input.entryType, amountMinor.toString(), `staff-credit:${operator.id}`, input.idempotencyKey, operator.id, input.reason ?? null],
    );
    const row = rows[0];
    if (!row) throw new AppError('internal_error', { message: 'shop_credit_post returned no row' });
    if (!row.o_replayed) {
      await audit(tx, auditActor(ctx), {
        action: 'shop.credit_posted',
        targetType: 'shop',
        targetId: shopId,
        details: { entryId: row.o_id, entryType: input.entryType, amountMinor: amountMinor.toString(), currency: shop.currency, balanceAfterMinor: row.o_balance_after_minor },
      });
    }
    const after = await getShop(tx, shopId);
    if (!after) throw new AppError('shop_not_found');
    return { shop: after, replayed: row.o_replayed };
  });
}

// ---------------------------------------------------------------------------
// Cash counts (reconciliation)
// ---------------------------------------------------------------------------
export interface CashCountDTO {
  id: string;
  createdAt: string;
  shopId: string;
  expected: MoneyDTO;
  counted: MoneyDTO;
  difference: MoneyDTO;
  countedBy: { id: string; username: string };
  note: string | null;
}

export async function listCashCounts(q: Queryable, shopId: string, limit = 50): Promise<CashCountDTO[]> {
  const { rows } = await q.query<{
    id: string; created_at: Date; shop_id: string; currency: string; expected_minor: string; counted_minor: string;
    difference_minor: string; counted_by: string; username: string; note: string | null;
  }>(
    `select c.id::text, c.created_at, c.shop_id::text, c.currency, c.expected_minor::text, c.counted_minor::text,
            c.difference_minor::text, c.counted_by::text, u.username, c.note
       from shop_cash_counts c join users u on u.id = c.counted_by
      where c.shop_id = $1::bigint order by c.id desc limit $2`,
    [shopId, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at.toISOString(),
    shopId: r.shop_id,
    expected: dto(r.expected_minor, r.currency),
    counted: dto(r.counted_minor, r.currency),
    difference: dto(r.difference_minor, r.currency),
    countedBy: { id: r.counted_by, username: r.username },
    note: r.note,
  }));
}

/** Records the cash physically counted in the drawer against the expected cash at this moment. */
export async function recordCashCount(ctx: Ctx, shopId: string, input: { counted: string; note?: string | undefined }): Promise<CashCountDTO> {
  const shop = await getShop(ctx.db, shopId);
  if (!shop) throw new AppError('shop_not_found');
  const currency = await currencyDecimals(ctx.db, shop.currency);
  if (!currency) throw new AppError('internal_error', { message: `currency ${shop.currency} is missing` });
  const counted = money(() => parseAmountInput(input.counted, currency.decimals, { allowNegative: false }));
  return ctx.db.transaction(async (tx) => {
    const locked = await tx.query<{ cash_balance_minor: string; currency: string }>('select cash_balance_minor::text, currency from shops where id = $1::bigint for update', [shopId]);
    const row = locked.rows[0];
    if (!row) throw new AppError('shop_not_found');
    const { rows } = await tx.query<{ id: string }>(
      `insert into shop_cash_counts (shop_id, currency, expected_minor, counted_minor, counted_by, note)
       values ($1::bigint, $2, $3::bigint, $4::bigint, $5::uuid, $6) returning id::text`,
      [shopId, row.currency, row.cash_balance_minor, counted.toString(), ctx.principal().id, input.note?.trim() || null],
    );
    const id = (rows[0] as { id: string }).id;
    const difference = counted - BigInt(row.cash_balance_minor);
    await audit(tx, auditActor(ctx), {
      action: 'shop.cash_counted',
      targetType: 'shop',
      targetId: shopId,
      details: { countId: id, expectedMinor: row.cash_balance_minor, countedMinor: counted.toString(), differenceMinor: difference.toString(), currency: row.currency },
    });
    const list = await listCashCounts(tx, shopId, 1);
    return list[0] as CashCountDTO;
  });
}

// ---------------------------------------------------------------------------
// Reports (per shop, per currency, and per worker)
// ---------------------------------------------------------------------------
export interface ShopTotalsDTO {
  shop: { id: string; code: string; name: string };
  currency: string;
  deposits: { count: number; total: MoneyDTO };
  payouts: { count: number; total: MoneyDTO };
  floatIn: MoneyDTO;
  collections: MoneyDTO;
  adjustments: MoneyDTO;
  /** Cash in minus cash out over the period (deposits - payouts + float - collections +/- corrections). */
  netCash: MoneyDTO;
  cashBalance: MoneyDTO;
}

export interface WorkerTotalsDTO {
  worker: { id: string; username: string; firstName: string; lastName: string; shopRole: ShopRole | null };
  currency: string;
  deposits: { count: number; total: MoneyDTO };
  payouts: { count: number; total: MoneyDTO };
}

export interface ShopReportDTO {
  from: string;
  to: string;
  shops: ShopTotalsDTO[];
  workers: WorkerTotalsDTO[];
}

export async function shopReport(q: Queryable, range: { from: string; to: string; shopId?: string | undefined; operatorId?: string | undefined }): Promise<ShopReportDTO> {
  const params = [range.from, range.to, range.shopId ?? null, range.operatorId ?? null];
  const shops = await q.query<{
    shop_id: string; code: string; name: string; currency: string; cash_balance_minor: string;
    dep_n: string; dep_sum: string; pay_n: string; pay_sum: string; float_sum: string; coll_sum: string; adj_sum: string; net: string;
  }>(
    `select s.id::text as shop_id, s.code, s.name, s.currency, s.cash_balance_minor::text,
            count(c.id) filter (where c.entry_type = 'player_deposit')::text as dep_n,
            coalesce(sum(c.amount_minor) filter (where c.entry_type = 'player_deposit'), 0)::text as dep_sum,
            count(c.id) filter (where c.entry_type = 'withdrawal_payout')::text as pay_n,
            coalesce(sum(c.amount_minor) filter (where c.entry_type = 'withdrawal_payout'), 0)::text as pay_sum,
            coalesce(sum(c.amount_minor) filter (where c.entry_type = 'float_in'), 0)::text as float_sum,
            coalesce(sum(c.amount_minor) filter (where c.entry_type = 'cash_collection'), 0)::text as coll_sum,
            coalesce(sum(c.signed_amount_minor) filter (where c.entry_type in ('adjustment_credit', 'adjustment_debit')), 0)::text as adj_sum,
            coalesce(sum(c.signed_amount_minor), 0)::text as net
       from shops s
       left join shop_cash_entries c on c.shop_id = s.id and c.created_at >= $1::timestamptz and c.created_at < $2::timestamptz
                                     and ($4::uuid is null or c.operator_id = $4::uuid)
      where ($3::bigint is null or s.id = $3::bigint)
      group by s.id order by s.city, s.name, s.id`,
    params,
  );
  const workers = await q.query<{
    id: string; username: string; first_name: string; last_name: string; shop_role: ShopRole | null; currency: string;
    dep_n: string; dep_sum: string; pay_n: string; pay_sum: string;
  }>(
    `select u.id::text, u.username, u.first_name, u.last_name, u.shop_role, c.currency,
            count(*) filter (where c.entry_type = 'player_deposit')::text as dep_n,
            coalesce(sum(c.amount_minor) filter (where c.entry_type = 'player_deposit'), 0)::text as dep_sum,
            count(*) filter (where c.entry_type = 'withdrawal_payout')::text as pay_n,
            coalesce(sum(c.amount_minor) filter (where c.entry_type = 'withdrawal_payout'), 0)::text as pay_sum
       from shop_cash_entries c join users u on u.id = c.operator_id
      where c.created_at >= $1::timestamptz and c.created_at < $2::timestamptz
        and ($3::bigint is null or c.shop_id = $3::bigint)
        and ($4::uuid is null or c.operator_id = $4::uuid)
        and c.entry_type in ('player_deposit', 'withdrawal_payout')
      group by u.id, c.currency order by u.username, c.currency`,
    params,
  );
  return {
    from: range.from,
    to: range.to,
    shops: shops.rows.map((r) => ({
      shop: { id: r.shop_id, code: r.code, name: r.name },
      currency: r.currency,
      deposits: { count: Number(r.dep_n), total: dto(r.dep_sum, r.currency) },
      payouts: { count: Number(r.pay_n), total: dto(r.pay_sum, r.currency) },
      floatIn: dto(r.float_sum, r.currency),
      collections: dto(r.coll_sum, r.currency),
      adjustments: dto(r.adj_sum, r.currency),
      netCash: dto(r.net, r.currency),
      cashBalance: dto(r.cash_balance_minor, r.currency),
    })),
    workers: workers.rows.map((r) => ({
      worker: { id: r.id, username: r.username, firstName: r.first_name, lastName: r.last_name, shopRole: r.shop_role },
      currency: r.currency,
      deposits: { count: Number(r.dep_n), total: dto(r.dep_sum, r.currency) },
      payouts: { count: Number(r.pay_n), total: dto(r.pay_sum, r.currency) },
    })),
  };
}

/** Recomputes every shop's cash chain. An empty list means the books are consistent. */
export async function shopCashHealth(q: Queryable): Promise<{ shopId: string; problem: string; entryId: string | null; expectedMinor: string; actualMinor: string }[]> {
  const { rows } = await q.query<{ shop_id: string; problem: string; entry_id: string | null; expected_minor: string; actual_minor: string }>(
    'select shop_id::text, problem, entry_id::text, expected_minor::text, actual_minor::text from shop_cash_verify(null)',
  );
  return rows.map((r) => ({ shopId: r.shop_id, problem: r.problem, entryId: r.entry_id, expectedMinor: r.expected_minor, actualMinor: r.actual_minor }));
}

// ---------------------------------------------------------------------------
// Shop workers (role 'cashier')
// ---------------------------------------------------------------------------
export interface WorkerDTO {
  id: string;
  accountNo: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  shop: { id: string; code: string; name: string };
  shopRole: ShopRole;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface WorkerRow {
  id: string;
  account_no: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  shop_id: string;
  shop_code: string;
  shop_name: string;
  shop_role: ShopRole;
  status: UserStatus;
  must_change_password: boolean;
  created_at: Date;
  last_login_at: Date | null;
}

const WORKER_SELECT = `select u.id::text, u.account_no::text, u.username, u.email, u.first_name, u.last_name,
       u.shop_id::text, s.code as shop_code, s.name as shop_name, u.shop_role, u.status::text,
       u.must_change_password, u.created_at, u.last_login_at
  from users u join shops s on s.id = u.shop_id`;

function toWorker(r: WorkerRow): WorkerDTO {
  return {
    id: r.id,
    accountNo: r.account_no,
    username: r.username,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    shop: { id: r.shop_id, code: r.shop_code, name: r.shop_name },
    shopRole: r.shop_role,
    status: r.status,
    mustChangePassword: r.must_change_password,
    createdAt: r.created_at.toISOString(),
    lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
  };
}

export async function listWorkers(q: Queryable, shopId?: string): Promise<WorkerDTO[]> {
  const { rows } = await q.query<WorkerRow>(
    `${WORKER_SELECT} where u.role = 'cashier' and ($1::bigint is null or u.shop_id = $1::bigint)
      order by s.code, u.shop_role, u.username`,
    [shopId ?? null],
  );
  return rows.map(toWorker);
}

export async function getWorker(q: Queryable, id: string): Promise<WorkerDTO | null> {
  const { rows } = await q.query<WorkerRow>(`${WORKER_SELECT} where u.role = 'cashier' and u.id = $1::uuid`, [id]);
  return rows[0] ? toWorker(rows[0]) : null;
}

export interface NewWorkerInput {
  shopId: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  shopRole: ShopRole;
}

/** Creates a shop worker with a temporary password, shown ONCE, that must be changed at first sign-in. */
export async function createWorker(ctx: Ctx, input: NewWorkerInput): Promise<{ worker: WorkerDTO; temporaryPassword: string }> {
  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword, ctx.config.scryptLog2N);
  const worker = await ctx.db.transaction(async (tx) => {
    const shop = await tx.query<{ status: ShopStatus }>('select status from shops where id = $1::bigint', [input.shopId]);
    if (!shop.rows[0]) throw new AppError('shop_not_found', { fields: { shopId: 'invalidChoice' } });
    if (shop.rows[0].status === 'closed') throw new AppError('shop_not_active', { fields: { shopId: 'invalidChoice' } });
    const { rows } = await tx.query<{ id: string }>(
      `insert into users (username, email, password_hash, first_name, last_name, role, shop_id, shop_role, must_change_password, created_by)
       values ($1, $2, $3, $4, $5, 'cashier', $6::bigint, $7, true, $8::uuid) returning id::text`,
      [input.username, normalizeEmail(input.email), hash, input.firstName, input.lastName, input.shopId, input.shopRole, ctx.principal().id],
    );
    const id = (rows[0] as { id: string }).id;
    await audit(tx, auditActor(ctx), { action: 'worker.created', targetType: 'user', targetId: id, details: { shopId: input.shopId, shopRole: input.shopRole } });
    return (await getWorker(tx, id)) as WorkerDTO;
  });
  return { worker, temporaryPassword };
}

export interface WorkerPatch {
  shopId?: string | undefined;
  shopRole?: ShopRole | undefined;
  status?: 'active' | 'suspended' | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | undefined;
}

export async function updateWorker(ctx: Ctx, id: string, patch: WorkerPatch): Promise<WorkerDTO> {
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ shop_id: string; shop_role: ShopRole; status: UserStatus; first_name: string; last_name: string; email: string }>(
      "select shop_id::text, shop_role, status::text, first_name, last_name, email from users where id = $1::uuid and role = 'cashier' for update",
      [id],
    );
    const before = rows[0];
    if (!before) throw new AppError('user_not_found');
    if (patch.shopId !== undefined && patch.shopId !== before.shop_id) {
      const shop = await tx.query<{ status: ShopStatus }>('select status from shops where id = $1::bigint', [patch.shopId]);
      if (!shop.rows[0]) throw new AppError('shop_not_found', { fields: { shopId: 'invalidChoice' } });
      if (shop.rows[0].status === 'closed') throw new AppError('shop_not_active', { fields: { shopId: 'invalidChoice' } });
    }
    const sets: string[] = [];
    const params: unknown[] = [id];
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const add = (column: string, key: string, from: unknown, to: unknown, cast = '') => {
      if (to === undefined || to === from) return;
      params.push(to);
      sets.push(`${column} = $${params.length}${cast}`);
      changes[key] = { from, to };
    };
    add('shop_id', 'shopId', before.shop_id, patch.shopId, '::bigint');
    add('shop_role', 'shopRole', before.shop_role, patch.shopRole);
    add('status', 'status', before.status, patch.status, '::user_status');
    add('first_name', 'firstName', before.first_name, patch.firstName);
    add('last_name', 'lastName', before.last_name, patch.lastName);
    add('email', 'email', before.email, patch.email === undefined ? undefined : normalizeEmail(patch.email));
    if (sets.length > 0) {
      await tx.query(`update users set ${sets.join(', ')} where id = $1::uuid`, params);
      if (changes.shopId || changes.shopRole || changes.status) await revokeUserSessions(tx, id, ctx.now);
      await audit(tx, auditActor(ctx), { action: 'worker.updated', targetType: 'user', targetId: id, details: { changes } });
    }
    return (await getWorker(tx, id)) as WorkerDTO;
  });
}
