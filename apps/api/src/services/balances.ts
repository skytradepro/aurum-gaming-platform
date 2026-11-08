/**
 * Balance management. Staff can record deposits, withdrawals and manual adjustments; every
 * balance change is a ledger entry created by the database function ledger_post() (through
 * @aurum/ledger). Nothing here updates a balance directly.
 */
import type { Db, Queryable } from '@aurum/db';
import { getEntry, getWallet, getWalletByUser, listEntries, postEntry } from '@aurum/ledger';
import type { EntryPage, LedgerEntry, ListEntriesFilter } from '@aurum/ledger';
import { convertMinor, parseAmountInput, parseRate } from '@aurum/money';
import type { MoneyDTO } from '@aurum/money';
import { AppError } from '@aurum/shared';
import type { EntryType, StaffEntryType } from '@aurum/shared';
import type { Ctx } from '../http/types.ts';
import { money } from '../errors.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import { useStaffCredit } from './staff-credit.ts';

const dto = (amountMinor: bigint, currency: string): MoneyDTO => ({ amountMinor: amountMinor.toString(), currency });

export interface LedgerEntryDTO {
  id: string;
  createdAt: string;
  walletId: string;
  userId: string;
  username: string;
  entryType: EntryType;
  direction: 1 | -1;
  amount: MoneyDTO;
  balanceBefore: MoneyDTO;
  balanceAfter: MoneyDTO;
  original: { amount: MoneyDTO; rate: string } | null;
  reference: string | null;
  reason: string | null;
  operator: { id: string; username: string } | null;
}

export function entryToDTO(e: LedgerEntry): LedgerEntryDTO {
  return {
    id: e.id,
    createdAt: e.createdAt,
    walletId: e.walletId,
    userId: e.userId,
    username: e.username,
    entryType: e.entryType,
    direction: e.direction,
    amount: dto(e.amountMinor, e.currency),
    balanceBefore: dto(e.balanceBeforeMinor, e.currency),
    balanceAfter: dto(e.balanceAfterMinor, e.currency),
    original: e.original ? { amount: dto(e.original.amountMinor, e.original.currency), rate: e.original.rate } : null,
    reference: e.reference,
    reason: e.reason,
    operator: e.operatorId && e.operatorUsername ? { id: e.operatorId, username: e.operatorUsername } : null,
  };
}

/** What a player sees about their own movements: no staff names, no internal reasons. */
export interface PlayerEntryDTO {
  id: string;
  createdAt: string;
  entryType: EntryType;
  direction: 1 | -1;
  amount: MoneyDTO;
  balanceAfter: MoneyDTO;
  reference: string | null;
}

export function entryToPlayerDTO(e: LedgerEntry): PlayerEntryDTO {
  return {
    id: e.id,
    createdAt: e.createdAt,
    entryType: e.entryType,
    direction: e.direction,
    amount: dto(e.amountMinor, e.currency),
    balanceAfter: dto(e.balanceAfterMinor, e.currency),
    reference: e.reference,
  };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export async function listLedger(q: Queryable, filter: ListEntriesFilter): Promise<Page<LedgerEntryDTO>> {
  const page: EntryPage = await listEntries(q, filter);
  return { items: page.entries.map(entryToDTO), nextCursor: page.nextCursor };
}

export async function listPlayerTransactions(q: Queryable, userId: string, filter: { types?: readonly EntryType[]; beforeId?: string; limit?: number }): Promise<Page<PlayerEntryDTO>> {
  const page = await listEntries(q, {
    userId,
    ...(filter.types ? { entryTypes: filter.types } : {}),
    ...(filter.beforeId ? { beforeId: filter.beforeId } : {}),
    limit: filter.limit ?? 25,
  });
  return { items: page.entries.map(entryToPlayerDTO), nextCursor: page.nextCursor };
}

export interface StaffEntryInput {
  entryType: StaffEntryType;
  /** Amount in the wallet currency, as typed by the operator. Exactly one of `amount` and `original` is given. */
  amount?: string | undefined;
  /** Money received in another currency; the wallet amount is computed from the rate the operator enters. */
  original?: { amount: string; currency: string; rate: string } | undefined;
  reason?: string | undefined;
  reference?: string | undefined;
  idempotencyKey: string;
}

export interface StaffEntryResult {
  entry: LedgerEntryDTO;
  replayed: boolean;
  balance: MoneyDTO;
}

interface CurrencyDecimals {
  code: string;
  decimals: number;
  is_enabled: boolean;
}

async function currencyDecimals(q: Queryable, code: string): Promise<CurrencyDecimals | null> {
  const { rows } = await q.query<CurrencyDecimals>('select code, decimals::int as decimals, is_enabled from currencies where code = $1', [code]);
  return rows[0] ?? null;
}

/** Records a deposit, withdrawal or adjustment for a player. Safe to retry with the same idempotency key. */
export async function postStaffEntry(ctx: Ctx, userId: string, input: StaffEntryInput): Promise<StaffEntryResult> {
  const operator = ctx.principal();
  const limit = ctx.services.limiter.hit(`balance-post:${operator.id}`, 120, 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });

  const hasAmount = input.amount !== undefined;
  const hasOriginal = input.original !== undefined;
  if (hasAmount === hasOriginal) {
    throw new AppError('validation', { fields: { amount: 'required' } });
  }

  const target = await ctx.db.query<{ id: string; role: string }>('select id::text, role::text from users where id = $1::uuid', [userId]);
  if (!target.rows[0] || target.rows[0].role !== 'user') throw new AppError('user_not_found');
  const wallet = await getWalletByUser(ctx.db, userId);
  if (!wallet) throw new AppError('wallet_not_found');
  const walletCurrency = await currencyDecimals(ctx.db, wallet.currency);
  if (!walletCurrency) throw new AppError('internal_error', { message: `wallet currency ${wallet.currency} is missing` });

  let amountMinor: bigint;
  let original: { amountMinor: bigint; currency: string; rate: string } | null = null;
  if (input.original) {
    const originalCurrency = await currencyDecimals(ctx.db, input.original.currency);
    if (!originalCurrency || !originalCurrency.is_enabled) throw new AppError('currency_unavailable', { fields: { 'original.currency': 'invalidChoice' } });
    if (originalCurrency.code === wallet.currency) throw new AppError('validation', { fields: { 'original.currency': 'invalidChoice' } });
    const originalMinor = money(() => parseAmountInput(input.original?.amount ?? '', originalCurrency.decimals, { allowNegative: false }));
    money(() => parseRate(input.original?.rate ?? ''));
    amountMinor = money(() =>
      convertMinor({ amountMinor: originalMinor, fromDecimals: originalCurrency.decimals, toDecimals: walletCurrency.decimals, rate: input.original?.rate ?? '', rounding: 'half-up' }),
    );
    original = { amountMinor: originalMinor, currency: originalCurrency.code, rate: input.original.rate };
  } else {
    amountMinor = money(() => parseAmountInput(input.amount ?? '', walletCurrency.decimals, { allowNegative: false }));
  }
  if (amountMinor < 1n) throw new AppError('invalid_amount', { fields: { amount: 'invalidAmount' } });

  return ctx.db.transaction(async (tx) => {
    const result = await postEntry(tx, {
      walletId: wallet.id,
      entryType: input.entryType,
      amountMinor,
      scope: `staff:${operator.id}`,
      idempotencyKey: input.idempotencyKey,
      operatorId: operator.id,
      reason: input.reason ?? null,
      reference: input.reference ?? null,
      original,
    });
    // an admin (not the Super Admin) gives players only the balance the Super Admin gave him (migration 0017)
    await useStaffCredit(tx, operator, result);
    if (!result.replayed) {
      await audit(tx, auditActor(ctx), {
        action: 'balance.post',
        targetType: 'user',
        targetId: userId,
        details: {
          entryId: result.id,
          entryType: result.entryType,
          amountMinor: result.amountMinor.toString(),
          currency: result.currency,
          balanceBeforeMinor: result.balanceBeforeMinor.toString(),
          balanceAfterMinor: result.balanceAfterMinor.toString(),
          ...(original ? { originalAmountMinor: original.amountMinor.toString(), originalCurrency: original.currency, rate: original.rate } : {}),
        },
      });
    }
    const entry = await getEntry(tx, result.id);
    if (!entry) throw new AppError('internal_error', { message: 'posted entry could not be read back' });
    return { entry: entryToDTO(entry), replayed: result.replayed, balance: dto(result.balanceAfterMinor, result.currency) };
  });
}

export async function walletOverview(q: Queryable, walletId: string): Promise<{ id: string; currency: string; balance: MoneyDTO } | null> {
  const wallet = await getWallet(q, walletId);
  return wallet ? { id: wallet.id, currency: wallet.currency, balance: dto(wallet.balanceMinor, wallet.currency) } : null;
}

export type { Db };
