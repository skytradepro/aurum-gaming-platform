/**
 * Withdrawals paid online: by bank transfer (IBAN) or crypto (network + address).
 *
 *   1. The player asks for a payout: the amount is reserved at once (wallet debit "withdrawal_online").
 *      The player must have made at least one real deposit (staff deposit or crypto deposit).
 *   2. Head office sends the money by hand, then marks the request paid with the bank or blockchain reference.
 *   3. Otherwise the reservation goes back to the wallet: cancelled by the player or rejected by head office.
 *
 * All state changes run in the database functions online_withdrawal_create / _close / _pay (migration 0012).
 */
import type { Queryable } from '@aurum/db';
import { parseAmountInput } from '@aurum/money';
import type { MoneyDTO } from '@aurum/money';
import { AppError } from '@aurum/shared';
import { ibanValid } from '../config.ts';
import { money } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import { getSettings } from './settings.ts';

export type OnlineMethod = 'bank' | 'crypto';
export type OnlineStatus = 'pending' | 'paid' | 'cancelled' | 'rejected';

export interface OnlineWithdrawalDTO {
  id: string;
  method: OnlineMethod;
  status: OnlineStatus;
  amount: MoneyDTO;
  details: Record<string, string>;
  createdAt: string;
  paidAt: string | null;
  payoutReference: string | null;
  closedAt: string | null;
  /** Shown to the player for a rejection. */
  closeReason: string | null;
}
export interface StaffOnlineWithdrawalDTO extends OnlineWithdrawalDTO {
  player: { id: string; accountNo: string; username: string; firstName: string; lastName: string; email: string };
  paidBy: string | null;
  closedBy: string | null;
}

interface Row {
  id: string;
  method: OnlineMethod;
  status: OnlineStatus;
  currency: string;
  amount_minor: string;
  details: Record<string, string>;
  created_at: Date;
  paid_at: Date | null;
  payout_reference: string | null;
  closed_at: Date | null;
  close_reason: string | null;
  user_id: string;
  account_no: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  paid_by_username: string | null;
  closed_by_username: string | null;
}

const SELECT = `select o.id::text, o.method, o.status, o.currency, o.amount_minor::text, o.details, o.created_at, o.paid_at,
       o.payout_reference, o.closed_at, o.close_reason,
       u.id::text as user_id, u.account_no::text, u.username, u.first_name, u.last_name, u.email,
       pb.username as paid_by_username, cb.username as closed_by_username
  from online_withdrawals o
  join users u on u.id = o.user_id
  left join users pb on pb.id = o.paid_by
  left join users cb on cb.id = o.closed_by`;

function toPlayer(r: Row): OnlineWithdrawalDTO {
  return {
    id: r.id,
    method: r.method,
    status: r.status,
    amount: { amountMinor: r.amount_minor, currency: r.currency },
    details: r.details,
    createdAt: r.created_at.toISOString(),
    paidAt: r.paid_at ? r.paid_at.toISOString() : null,
    payoutReference: r.payout_reference,
    closedAt: r.closed_at ? r.closed_at.toISOString() : null,
    closeReason: r.status === 'rejected' ? r.close_reason : null,
  };
}
function toStaff(r: Row): StaffOnlineWithdrawalDTO {
  return {
    ...toPlayer(r),
    closeReason: r.close_reason,
    player: { id: r.user_id, accountNo: r.account_no, username: r.username, firstName: r.first_name, lastName: r.last_name, email: r.email },
    paidBy: r.paid_by_username,
    closedBy: r.closed_by_username,
  };
}

const ADDRESS: Record<string, RegExp> = {
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  bsc: /^0x[0-9a-fA-F]{40}$/,
  ethereum: /^0x[0-9a-fA-F]{40}$/,
  bitcoin: /^(bc1[02-9ac-hj-np-z]{25,62}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
};

/** Checks and cleans what the player typed. Throws a validation error with the field that is wrong. */
async function payoutDetails(q: Queryable, method: OnlineMethod, input: NewOnlineWithdrawal): Promise<Record<string, string>> {
  if (method === 'bank') {
    const accountName = (input.accountName ?? '').trim().replace(/\s+/g, ' ');
    const iban = (input.iban ?? '').replace(/\s+/g, '').toUpperCase();
    if (accountName.length < 3 || accountName.length > 100) throw new AppError('validation', { fields: { accountName: 'invalidFormat' } });
    if (!ibanValid(iban)) throw new AppError('validation', { fields: { iban: 'invalidIban' } });
    return { accountName, iban };
  }
  const network = (input.network ?? '').trim();
  const address = (input.address ?? '').trim();
  const { rows } = await q.query<{ chain: string; coin: string }>('select chain, coin from crypto_networks where code = $1 and is_enabled', [network]);
  const net = rows[0];
  if (!net) throw new AppError('validation', { fields: { network: 'invalidChoice' } });
  if (!ADDRESS[net.chain]?.test(address)) throw new AppError('validation', { fields: { address: 'invalidAddress' } });
  return { network, coin: net.coin, chain: net.chain, address };
}

export interface NewOnlineWithdrawal {
  method: OnlineMethod;
  amount: string;
  idempotencyKey: string;
  accountName?: string | undefined;
  iban?: string | undefined;
  network?: string | undefined;
  address?: string | undefined;
}

export async function listMyOnlineWithdrawals(q: Queryable, userId: string): Promise<OnlineWithdrawalDTO[]> {
  const { rows } = await q.query<Row>(`${SELECT} where o.user_id = $1::uuid order by o.id desc limit 50`, [userId]);
  return rows.map(toPlayer);
}

/** Whether the player may ask for a withdrawal: withdrawals are open and the player has made a real deposit. */
export async function withdrawalEligibility(q: Queryable, userId: string): Promise<{ open: boolean; hasDeposit: boolean }> {
  const settings = await getSettings(q);
  const { rows } = await q.query<{ ok: boolean }>(
    `select exists (select 1 from ledger_entries e join wallets w on w.id = e.wallet_id
                     where w.user_id = $1::uuid and w.kind = 'main' and e.entry_type in ('deposit', 'deposit_crypto')) as ok`,
    [userId],
  );
  return { open: settings.withdrawals_open, hasDeposit: rows[0]?.ok === true };
}

export async function requestOnlineWithdrawal(ctx: Ctx, input: NewOnlineWithdrawal): Promise<{ withdrawal: OnlineWithdrawalDTO; replayed: boolean }> {
  const user = ctx.principal();
  const settings = await getSettings(ctx.db);
  if (!settings.withdrawals_open) throw new AppError('withdrawals_closed');
  const { rows: walletRows } = await ctx.db.query<{ currency: string; decimals: number }>(
    `select w.currency, c.decimals::int as decimals from wallets w join currencies c on c.code = w.currency
      where w.user_id = $1::uuid and w.kind = 'main'`,
    [user.id],
  );
  const wallet = walletRows[0];
  if (!wallet) throw new AppError('wallet_not_found');
  const amountMinor = money(() => parseAmountInput(input.amount, wallet.decimals, { allowNegative: false }));
  if (amountMinor < 1n) throw new AppError('invalid_amount', { fields: { amount: 'invalidAmount' } });
  const details = await payoutDetails(ctx.db, input.method, input);

  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ o_replayed: boolean; o_id: string }>(
      'select o_replayed, o_id::text from online_withdrawal_create($1::uuid, $2::bigint, $3, $4::jsonb, $5)',
      [user.id, amountMinor.toString(), input.method, JSON.stringify(details), input.idempotencyKey],
    );
    const row = rows[0] as { o_replayed: boolean; o_id: string };
    if (!row.o_replayed) {
      await audit(tx, auditActor(ctx), {
        action: 'online_withdrawal.requested',
        targetType: 'online_withdrawal',
        targetId: row.o_id,
        details: { method: input.method, amountMinor: amountMinor.toString(), currency: wallet.currency },
      });
    }
    const fresh = await tx.query<Row>(`${SELECT} where o.id = $1::bigint`, [row.o_id]);
    return { withdrawal: toPlayer(fresh.rows[0] as Row), replayed: row.o_replayed };
  });
}

export async function cancelOwnOnlineWithdrawal(ctx: Ctx, id: string): Promise<OnlineWithdrawalDTO> {
  const user = ctx.principal();
  return ctx.db.transaction(async (tx) => {
    const owned = await tx.query<{ id: string }>('select id::text from online_withdrawals where id = $1::bigint and user_id = $2::uuid', [id, user.id]);
    if (!owned.rows[0]) throw new AppError('withdrawal_not_found');
    await tx.query("select * from online_withdrawal_close($1::bigint, 'cancelled', $2::uuid, null)", [id, user.id]);
    await audit(tx, auditActor(ctx), { action: 'online_withdrawal.cancelled', targetType: 'online_withdrawal', targetId: id });
    const fresh = await tx.query<Row>(`${SELECT} where o.id = $1::bigint`, [id]);
    return toPlayer(fresh.rows[0] as Row);
  });
}

// --- head office ---------------------------------------------------------------------------------
export async function listOnlineWithdrawals(q: Queryable, status: OnlineStatus | undefined, limit = 100): Promise<StaffOnlineWithdrawalDTO[]> {
  const { rows } = await q.query<Row>(
    `${SELECT} where ($1::text is null or o.status = $1) order by (o.status = 'pending') desc, o.id desc limit $2`,
    [status ?? null, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map(toStaff);
}

export async function payOnlineWithdrawal(ctx: Ctx, id: string, reference: string): Promise<StaffOnlineWithdrawalDTO> {
  const staff = ctx.principal();
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ o_replayed: boolean }>('select o_replayed from online_withdrawal_pay($1::bigint, $2::uuid, $3)', [id, staff.id, reference]);
    if (!rows[0]?.o_replayed) {
      await audit(tx, auditActor(ctx), { action: 'online_withdrawal.paid', targetType: 'online_withdrawal', targetId: id, details: { reference } });
    }
    const fresh = await tx.query<Row>(`${SELECT} where o.id = $1::bigint`, [id]);
    return toStaff(fresh.rows[0] as Row);
  });
}

export async function rejectOnlineWithdrawal(ctx: Ctx, id: string, reason: string): Promise<StaffOnlineWithdrawalDTO> {
  const staff = ctx.principal();
  return ctx.db.transaction(async (tx) => {
    await tx.query("select * from online_withdrawal_close($1::bigint, 'rejected', $2::uuid, $3)", [id, staff.id, reason]);
    await audit(tx, auditActor(ctx), { action: 'online_withdrawal.rejected', targetType: 'online_withdrawal', targetId: id, details: { reason } });
    const fresh = await tx.query<Row>(`${SELECT} where o.id = $1::bigint`, [id]);
    return toStaff(fresh.rows[0] as Row);
  });
}
