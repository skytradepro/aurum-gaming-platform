/**
 * Ledger access layer.
 *
 * All balance changes go through the SQL function ledger_post() (migration 0002). This module
 * is a thin, typed wrapper: it validates the shape of the request, calls the function and maps
 * the result. Amounts are BigInt minor units in code and decimal strings on the wire.
 */
import { MAX_MINOR_UNITS, parseRate } from '@aurum/money';
import { AppError, ENTRY_TYPES } from '@aurum/shared';
import type { EntryType } from '@aurum/shared';
import { mapDbError } from '@aurum/db';
import type { Queryable } from '@aurum/db';

export interface OriginalAmount {
  amountMinor: bigint;
  currency: string;
  /** 1 unit of `currency` = `rate` units of the wallet currency (at most 12 decimals). */
  rate: string;
}

export interface PostEntryInput {
  walletId: string | bigint;
  entryType: EntryType;
  amountMinor: bigint;
  /** Namespace for the idempotency key, e.g. `admin:<operatorId>` or `game:<provider>`. */
  scope: string;
  /** Same scope + key + parameters = same entry (retries are safe). */
  idempotencyKey: string;
  operatorId?: string | null;
  reason?: string | null;
  reference?: string | null;
  original?: OriginalAmount | null;
  metadata?: Record<string, unknown>;
}

export interface PostEntryResult {
  /** true when this call returned an entry created by an earlier identical call. */
  replayed: boolean;
  id: string;
  walletId: string;
  userId: string;
  currency: string;
  entryType: EntryType;
  direction: 1 | -1;
  amountMinor: bigint;
  balanceBeforeMinor: bigint;
  balanceAfterMinor: bigint;
  createdAt: string;
}

interface PostRow {
  o_replayed: boolean;
  o_id: string;
  o_wallet_id: string;
  o_user_id: string;
  o_currency: string;
  o_entry_type: EntryType;
  o_direction: number;
  o_amount_minor: string;
  o_balance_before_minor: string;
  o_balance_after_minor: string;
  o_created_at: Date;
}

export async function postEntry(q: Queryable, input: PostEntryInput): Promise<PostEntryResult> {
  if (!(ENTRY_TYPES as readonly string[]).includes(input.entryType)) {
    throw new AppError('validation', { message: `unknown entry type ${String(input.entryType)}` });
  }
  if (typeof input.amountMinor !== 'bigint' || input.amountMinor < 1n || input.amountMinor > MAX_MINOR_UNITS) {
    throw new AppError('invalid_amount');
  }
  if (input.original) {
    parseRate(input.original.rate); // throws MoneyError on a malformed rate
  }
  let rows: PostRow[];
  try {
    ({ rows } = await q.query<PostRow>(
      `select * from ledger_post(
         $1::bigint, $2::text, $3::bigint, $4::text, $5::text, $6::uuid, $7::text, $8::text,
         $9::bigint, $10::text, $11::numeric, $12::jsonb)`,
      [
        String(input.walletId),
        input.entryType,
        input.amountMinor.toString(),
        input.scope,
        input.idempotencyKey,
        input.operatorId ?? null,
        input.reason ?? null,
        input.reference ?? null,
        input.original ? input.original.amountMinor.toString() : null,
        input.original ? input.original.currency : null,
        input.original ? input.original.rate : null,
        JSON.stringify(input.metadata ?? {}),
      ],
    ));
  } catch (error) {
    // AU001 (insufficient funds), AU002 (idempotency conflict), ... become typed AppErrors
    throw mapDbError(error) ?? error;
  }
  const r = rows[0];
  if (!r) throw new AppError('internal_error', { message: 'ledger_post returned no row' });
  return {
    replayed: r.o_replayed,
    id: r.o_id,
    walletId: r.o_wallet_id,
    userId: r.o_user_id,
    currency: r.o_currency,
    entryType: r.o_entry_type,
    direction: r.o_direction === 1 ? 1 : -1,
    amountMinor: BigInt(r.o_amount_minor),
    balanceBeforeMinor: BigInt(r.o_balance_before_minor),
    balanceAfterMinor: BigInt(r.o_balance_after_minor),
    createdAt: r.o_created_at.toISOString(),
  };
}

export interface Wallet {
  id: string;
  userId: string;
  currency: string;
  kind: 'main' | 'bonus';
  balanceMinor: bigint;
  version: string;
  updatedAt: string;
}

interface WalletRow {
  id: string;
  user_id: string;
  currency: string;
  kind: 'main' | 'bonus';
  balance_minor: string;
  version: string;
  updated_at: Date;
}

const WALLET_COLUMNS = 'id::text, user_id::text, currency, kind, balance_minor::text, version::text, updated_at';

function toWallet(r: WalletRow): Wallet {
  return {
    id: r.id,
    userId: r.user_id,
    currency: r.currency,
    kind: r.kind,
    balanceMinor: BigInt(r.balance_minor),
    version: r.version,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function getWalletByUser(q: Queryable, userId: string, kind: 'main' | 'bonus' = 'main'): Promise<Wallet | null> {
  const { rows } = await q.query<WalletRow>(
    `select ${WALLET_COLUMNS} from wallets where user_id = $1::uuid and kind = $2 limit 1`,
    [userId, kind],
  );
  return rows[0] ? toWallet(rows[0]) : null;
}

export async function getWallet(q: Queryable, walletId: string): Promise<Wallet | null> {
  const { rows } = await q.query<WalletRow>(`select ${WALLET_COLUMNS} from wallets where id = $1::bigint`, [walletId]);
  return rows[0] ? toWallet(rows[0]) : null;
}

export interface LedgerEntry {
  id: string;
  walletId: string;
  userId: string;
  username: string;
  currency: string;
  entryType: EntryType;
  direction: 1 | -1;
  amountMinor: bigint;
  balanceBeforeMinor: bigint;
  balanceAfterMinor: bigint;
  original: { amountMinor: bigint; currency: string; rate: string } | null;
  reference: string | null;
  reason: string | null;
  operatorId: string | null;
  operatorUsername: string | null;
  createdAt: string;
}

interface EntryRow {
  id: string;
  wallet_id: string;
  user_id: string;
  username: string;
  currency: string;
  entry_type: EntryType;
  direction: number;
  amount_minor: string;
  balance_before_minor: string;
  balance_after_minor: string;
  original_amount_minor: string | null;
  original_currency: string | null;
  exchange_rate: string | null;
  reference: string | null;
  reason: string | null;
  operator_id: string | null;
  operator_username: string | null;
  created_at: Date;
}

function toEntry(r: EntryRow): LedgerEntry {
  return {
    id: r.id,
    walletId: r.wallet_id,
    userId: r.user_id,
    username: r.username,
    currency: r.currency,
    entryType: r.entry_type,
    direction: r.direction === 1 ? 1 : -1,
    amountMinor: BigInt(r.amount_minor),
    balanceBeforeMinor: BigInt(r.balance_before_minor),
    balanceAfterMinor: BigInt(r.balance_after_minor),
    original:
      r.original_amount_minor !== null && r.original_currency !== null && r.exchange_rate !== null
        ? { amountMinor: BigInt(r.original_amount_minor), currency: r.original_currency, rate: trimRate(r.exchange_rate) }
        : null,
    reference: r.reference,
    reason: r.reason,
    operatorId: r.operator_id,
    operatorUsername: r.operator_username,
    createdAt: r.created_at.toISOString(),
  };
}

/** "3.350000000000" -> "3.35" */
export function trimRate(rate: string): string {
  return rate.includes('.') ? rate.replace(/0+$/, '').replace(/\.$/, '') : rate;
}

export interface ListEntriesFilter {
  /** Exactly one entry. */
  id?: string;
  walletId?: string;
  userId?: string;
  /** Only the players created by this admin (users.owner_id). */
  ownerId?: string;
  operatorId?: string;
  currency?: string;
  entryTypes?: readonly EntryType[];
  /** ISO instants; `from` inclusive, `to` exclusive. */
  from?: string;
  to?: string;
  /** Keyset cursor: only entries with an id lower than this one (newest first). */
  beforeId?: string;
  limit?: number;
}

export interface EntryPage {
  entries: LedgerEntry[];
  /** Pass as `beforeId` to get the next (older) page; null when there is no more. */
  nextCursor: string | null;
}

export async function listEntries(q: Queryable, filter: ListEntriesFilter = {}): Promise<EntryPage> {
  const limit = Math.min(Math.max(filter.limit ?? 25, 1), 200);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (filter.id) add('e.id = ?::bigint', filter.id);
  if (filter.walletId) add('e.wallet_id = ?::bigint', filter.walletId);
  if (filter.userId) add('e.user_id = ?::uuid', filter.userId);
  if (filter.ownerId) add('u.owner_id = ?::uuid', filter.ownerId);
  if (filter.operatorId) add('e.operator_id = ?::uuid', filter.operatorId);
  if (filter.currency) add('e.currency = ?::text', filter.currency);
  if (filter.entryTypes && filter.entryTypes.length > 0) add('e.entry_type = any(?::text[])', [...filter.entryTypes]);
  if (filter.from) add('e.created_at >= ?::timestamptz', filter.from);
  if (filter.to) add('e.created_at < ?::timestamptz', filter.to);
  if (filter.beforeId) add('e.id < ?::bigint', filter.beforeId);
  params.push(limit + 1);
  const { rows } = await q.query<EntryRow>(
    `select e.id::text, e.wallet_id::text, e.user_id::text, u.username, e.currency, e.entry_type,
            e.direction, e.amount_minor::text, e.balance_before_minor::text, e.balance_after_minor::text,
            e.original_amount_minor::text, e.original_currency, e.exchange_rate::text,
            e.reference, e.reason, e.operator_id::text, o.username as operator_username, e.created_at
       from ledger_entries e
       join users u on u.id = e.user_id
       left join users o on o.id = e.operator_id
      ${where.length > 0 ? `where ${where.join(' and ')}` : ''}
      order by e.id desc
      limit $${params.length}`,
    params,
  );
  const page = rows.slice(0, limit).map(toEntry);
  const last = page[page.length - 1];
  return { entries: page, nextCursor: rows.length > limit && last ? last.id : null };
}

export async function getEntry(q: Queryable, id: string): Promise<LedgerEntry | null> {
  const page = await listEntries(q, { id, limit: 1 });
  return page.entries[0] ?? null;
}

export interface LedgerProblem {
  walletId: string;
  problem: 'chain_break' | 'balance_mismatch';
  entryId: string | null;
  expectedMinor: bigint;
  actualMinor: bigint;
}

/** Recomputes the books. An empty list means every wallet matches its ledger. */
export async function verifyLedger(q: Queryable, walletId?: string): Promise<LedgerProblem[]> {
  const { rows } = await q.query<{
    wallet_id: string;
    problem: 'chain_break' | 'balance_mismatch';
    entry_id: string | null;
    expected_minor: string;
    actual_minor: string;
  }>(
    `select wallet_id::text, problem, entry_id::text, expected_minor::text, actual_minor::text
       from ledger_verify($1::bigint)`,
    [walletId ?? null],
  );
  return rows.map((r) => ({
    walletId: r.wallet_id,
    problem: r.problem,
    entryId: r.entry_id,
    expectedMinor: BigInt(r.expected_minor),
    actualMinor: BigInt(r.actual_minor),
  }));
}

export interface CurrencyTotals {
  currency: string;
  wallets: number;
  totalMinor: bigint;
}

/** Sum of balances PER CURRENCY. Currencies are never added together. */
export async function totalsByCurrency(q: Queryable): Promise<CurrencyTotals[]> {
  const { rows } = await q.query<{ currency: string; wallets: string; total: string }>(
    `select currency, count(*)::text as wallets, coalesce(sum(balance_minor), 0)::text as total
       from wallets where kind = 'main' group by currency order by currency`,
  );
  return rows.map((r) => ({ currency: r.currency, wallets: Number(r.wallets), totalMinor: BigInt(r.total) }));
}
