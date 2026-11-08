/**
 * Prepaid admin balance (migration 0017). Only the Super Admin creates money: he gives each admin a
 * balance, the admin credits players from it (and cash-outs come back to it). Every change goes through
 * the database function staff_credit_post(); nothing here updates a balance directly.
 */
import type { Queryable } from '@aurum/db';
import { parseAmountInput } from '@aurum/money';
import type { MoneyDTO } from '@aurum/money';
import { AppError } from '@aurum/shared';
import type { HeadOfficeStaffCreditEntryType, StaffCreditEntryType } from '@aurum/shared';
import { money } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import { revokeUserSessions } from '../security/session.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';

const dto = (amountMinor: string | bigint, currency: string): MoneyDTO => ({ amountMinor: amountMinor.toString(), currency });

/** Balances of the given admins (all admins when no id is given), per currency. */
export async function staffCreditBalances(q: Queryable, staffIds?: readonly string[]): Promise<Map<string, MoneyDTO[]>> {
  const { rows } = await q.query<{ user_id: string; currency: string; balance_minor: string }>(
    `select user_id::text, currency, balance_minor::text
       from staff_credit_balances
      where ($1::uuid[] is null or user_id = any($1::uuid[]))
      order by user_id, currency`,
    [staffIds ? [...staffIds] : null],
  );
  const out = new Map<string, MoneyDTO[]>();
  for (const r of rows) {
    const list = out.get(r.user_id) ?? [];
    list.push(dto(r.balance_minor, r.currency));
    out.set(r.user_id, list);
  }
  return out;
}

export interface StaffCreditEntryDTO {
  id: string;
  createdAt: string;
  entryType: StaffCreditEntryType;
  direction: 1 | -1;
  amount: MoneyDTO;
  balanceAfter: MoneyDTO;
  operator: { id: string; username: string };
  /** the player concerned, for the admin's own deposits and cash-outs */
  player: { id: string; username: string } | null;
  reason: string | null;
}

export async function listStaffCredit(q: Queryable, staffId: string, limit = 50): Promise<StaffCreditEntryDTO[]> {
  const { rows } = await q.query<{
    id: string;
    created_at: Date;
    currency: string;
    entry_type: StaffCreditEntryType;
    direction: number;
    amount_minor: string;
    balance_after_minor: string;
    operator_id: string;
    operator_username: string;
    player_id: string | null;
    player_username: string | null;
    reason: string | null;
  }>(
    `select e.id::text, e.created_at, e.currency, e.entry_type, e.direction, e.amount_minor::text,
            e.balance_after_minor::text, e.operator_id::text, o.username as operator_username,
            p.id::text as player_id, p.username as player_username, e.reason
       from staff_credit_entries e
       join users o on o.id = e.operator_id
       left join ledger_entries l on l.id = e.ledger_entry_id
       left join users p on p.id = l.user_id
      where e.staff_id = $1::uuid
      order by e.id desc
      limit $2`,
    [staffId, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at.toISOString(),
    entryType: r.entry_type,
    direction: r.direction === 1 ? 1 : -1,
    amount: dto(r.amount_minor, r.currency),
    balanceAfter: dto(r.balance_after_minor, r.currency),
    operator: { id: r.operator_id, username: r.operator_username },
    player: r.player_id && r.player_username ? { id: r.player_id, username: r.player_username } : null,
    reason: r.reason,
  }));
}

async function assertAdmin(q: Queryable, staffId: string): Promise<{ status: string; username: string }> {
  const { rows } = await q.query<{ role: string; status: string; username: string }>('select role::text, status::text, username from users where id = $1::uuid', [staffId]);
  const row = rows[0];
  if (!row || row.role !== 'admin') throw new AppError('user_not_found');
  return { status: row.status, username: row.username };
}

async function decimalsOf(q: Queryable, code: string): Promise<number> {
  const { rows } = await q.query<{ decimals: number; is_enabled: boolean }>('select decimals::int as decimals, is_enabled from currencies where code = $1', [code]);
  const row = rows[0];
  if (!row || !row.is_enabled) throw new AppError('currency_unavailable', { fields: { currency: 'invalidChoice' } });
  return row.decimals;
}

export interface StaffCreditInput {
  entryType: HeadOfficeStaffCreditEntryType;
  currency: string;
  amount: string;
  reason?: string | undefined;
  idempotencyKey: string;
}

/** The Super Admin gives balance to an admin, takes it back, or corrects a mistake. Safe to retry with the same key. */
export async function postStaffCredit(ctx: Ctx, staffId: string, input: StaffCreditInput): Promise<{ balances: MoneyDTO[]; replayed: boolean }> {
  const operator = ctx.principal();
  await assertAdmin(ctx.db, staffId);
  const decimals = await decimalsOf(ctx.db, input.currency);
  const amountMinor = money(() => parseAmountInput(input.amount, decimals, { allowNegative: false }));
  if (amountMinor < 1n) throw new AppError('invalid_amount', { fields: { amount: 'invalidAmount' } });
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ o_replayed: boolean; o_id: string; o_balance_after_minor: string }>(
      `select o_replayed, o_id::text, o_balance_after_minor::text
         from staff_credit_post($1::uuid, $2::text, $3::text, $4::bigint, $5::text, $6::text, $7::uuid, $8::text, null)`,
      [staffId, input.currency, input.entryType, amountMinor.toString(), `head-office:${operator.id}`, input.idempotencyKey, operator.id, input.reason ?? null],
    );
    const row = rows[0];
    if (!row) throw new AppError('internal_error', { message: 'staff_credit_post returned no row' });
    if (!row.o_replayed) {
      await audit(tx, auditActor(ctx), {
        action: 'staff.credit_posted',
        targetType: 'user',
        targetId: staffId,
        details: { entryId: row.o_id, entryType: input.entryType, amountMinor: amountMinor.toString(), currency: input.currency, balanceAfterMinor: row.o_balance_after_minor },
      });
    }
    const balances = (await staffCreditBalances(tx, [staffId])).get(staffId) ?? [];
    return { balances, replayed: row.o_replayed };
  });
}

/**
 * Called inside the transaction of an admin's player deposit / cash-out / correction: the same amount
 * leaves (or comes back to) the admin's balance. The Super Admin is not limited.
 */
export async function useStaffCredit(
  tx: Queryable,
  operator: { id: string; role: string },
  entry: { id: string; currency: string; amountMinor: bigint; direction: 1 | -1; replayed: boolean },
): Promise<void> {
  if (operator.role !== 'admin') return;
  // a retry of an earlier posting: its balance movement was committed together with it
  if (entry.replayed) return;
  await tx.query(
    `select o_id from staff_credit_post($1::uuid, $2::text, $3::text, $4::bigint, $5::text, $6::text, $1::uuid, null, $7::bigint)`,
    [operator.id, entry.currency, entry.direction === 1 ? 'player_deposit' : 'player_withdrawal', entry.amountMinor.toString(), 'admin-player', entry.id, entry.id],
  );
}

/** What the signed-in admin can still give to players. The Super Admin has no limit. */
export async function myStaffCredit(ctx: Ctx): Promise<{ limited: boolean; balances: MoneyDTO[] }> {
  const me = ctx.principal();
  if (me.role !== 'admin') return { limited: false, balances: [] };
  return { limited: true, balances: (await staffCreditBalances(ctx.db, [me.id])).get(me.id) ?? [] };
}

/**
 * Deletes an admin account: what is left on his balance comes back to the Super Admin (recorded),
 * the account is closed for good and signed out everywhere. His history stays in the ledger.
 */
export async function closeAdmin(ctx: Ctx, staffId: string): Promise<{ returned: MoneyDTO[] }> {
  const operator = ctx.principal();
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ role: string; status: string; username: string }>(
      'select role::text, status::text, username from users where id = $1::uuid for update',
      [staffId],
    );
    const row = rows[0];
    if (!row || row.role !== 'admin' || row.status === 'closed') throw new AppError('user_not_found');
    const balances = (await staffCreditBalances(tx, [staffId])).get(staffId) ?? [];
    const returned: MoneyDTO[] = [];
    for (const b of balances) {
      if (BigInt(b.amountMinor) <= 0n) continue;
      await tx.query(
        `select o_id from staff_credit_post($1::uuid, $2::text, 'withdraw', $3::bigint, $4::text, $5::text, $6::uuid, $7::text, null)`,
        [staffId, b.currency, b.amountMinor, 'admin-closed', `${staffId}:${b.currency}`, operator.id, 'Account deleted'],
      );
      returned.push(b);
    }
    await tx.query(`update users set status = 'closed' where id = $1::uuid`, [staffId]);
    await revokeUserSessions(tx, staffId, ctx.now);
    await audit(tx, auditActor(ctx), { action: 'staff.closed', targetType: 'user', targetId: staffId, details: { username: row.username, returned } });
    return { returned };
  });
}
