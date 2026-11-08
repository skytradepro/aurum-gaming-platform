/**
 * Dashboard figures and the audit trail. Money is always reported PER CURRENCY: amounts in
 * different currencies are never added together or converted.
 */
import type { Queryable } from '@aurum/db';
import { totalsByCurrency, verifyLedger } from '@aurum/ledger';
import type { MoneyDTO } from '@aurum/money';
import type { EntryType, Role, UserStatus } from '@aurum/shared';
import type { Page } from './balances.ts';

const money = (amountMinor: string | bigint, currency: string): MoneyDTO => ({ amountMinor: amountMinor.toString(), currency });

export interface DashboardDTO {
  players: { total: number; byStatus: Record<UserStatus, number>; newLast7Days: number };
  balances: { currency: string; wallets: number; total: MoneyDTO }[];
  recentActivity: { currency: string; entryType: EntryType; entries: number; credited: MoneyDTO; debited: MoneyDTO }[];
  /** Withdrawals waiting to be collected at a shop (the money is already reserved). */
  pendingWithdrawals: { currency: string; count: number; total: MoneyDTO }[];
  /** Expected cash held in shops, per currency. */
  shopCash: { currency: string; shops: number; activeShops: number; total: MoneyDTO }[];
  generatedAt: string;
}

export async function dashboardSummary(q: Queryable, now: Date): Promise<DashboardDTO> {
  const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const status = await q.query<{ status: UserStatus; n: string }>("select status::text, count(*)::text as n from users where role = 'user' group by status");
  const fresh = await q.query<{ n: string }>("select count(*)::text as n from users where role = 'user' and created_at >= $1::timestamptz", [since7]);
  const byStatus: Record<UserStatus, number> = { active: 0, suspended: 0, closed: 0 };
  for (const row of status.rows) byStatus[row.status] = Number(row.n);
  const totals = await totalsByCurrency(q);
  const activity = await q.query<{ currency: string; entry_type: EntryType; entries: string; credited: string; debited: string }>(
    `select currency, entry_type, count(*)::text as entries,
            coalesce(sum(amount_minor) filter (where direction = 1), 0)::text as credited,
            coalesce(sum(amount_minor) filter (where direction = -1), 0)::text as debited
       from ledger_entries where created_at >= $1::timestamptz
      group by currency, entry_type order by currency, entry_type`,
    [since30],
  );
  const pending = await q.query<{ currency: string; n: string; total: string }>(
    "select currency, count(*)::text as n, coalesce(sum(amount_minor), 0)::text as total from withdrawal_requests where status = 'pending' group by currency order by currency",
  );
  const shopCash = await q.query<{ currency: string; n: string; active: string; total: string }>(
    `select currency, count(*)::text as n, count(*) filter (where status = 'active')::text as active,
            coalesce(sum(cash_balance_minor), 0)::text as total
       from shops where status <> 'closed' group by currency order by currency`,
  );
  return {
    players: { total: byStatus.active + byStatus.suspended + byStatus.closed, byStatus, newLast7Days: Number(fresh.rows[0]?.n ?? '0') },
    pendingWithdrawals: pending.rows.map((r) => ({ currency: r.currency, count: Number(r.n), total: money(r.total, r.currency) })),
    shopCash: shopCash.rows.map((r) => ({ currency: r.currency, shops: Number(r.n), activeShops: Number(r.active), total: money(r.total, r.currency) })),
    balances: totals.map((t) => ({ currency: t.currency, wallets: t.wallets, total: money(t.totalMinor, t.currency) })),
    recentActivity: activity.rows.map((r) => ({
      currency: r.currency,
      entryType: r.entry_type,
      entries: Number(r.entries),
      credited: money(r.credited, r.currency),
      debited: money(r.debited, r.currency),
    })),
    generatedAt: now.toISOString(),
  };
}

export interface LedgerHealthDTO {
  ok: boolean;
  checkedAt: string;
  problems: { walletId: string; problem: string; entryId: string | null; expectedMinor: string; actualMinor: string }[];
}

/** Recomputes every wallet from its ledger entries. Heavy on large databases: run on demand. */
export async function ledgerHealth(q: Queryable, now: Date): Promise<LedgerHealthDTO> {
  const problems = await verifyLedger(q);
  return {
    ok: problems.length === 0,
    checkedAt: now.toISOString(),
    problems: problems.slice(0, 200).map((p) => ({
      walletId: p.walletId,
      problem: p.problem,
      entryId: p.entryId,
      expectedMinor: p.expectedMinor.toString(),
      actualMinor: p.actualMinor.toString(),
    })),
  };
}

export interface AuditEntryDTO {
  id: string;
  at: string;
  actor: { id: string; username: string } | null;
  actorRole: Role | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  ip: string | null;
}

export interface AuditFilter {
  actorId?: string | undefined;
  action?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  beforeId?: string | undefined;
  limit?: number | undefined;
}

export async function listAudit(q: Queryable, filter: AuditFilter): Promise<Page<AuditEntryDTO>> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace(/\?/g, `$${params.length}`));
  };
  if (filter.actorId) add('a.actor_id = ?::uuid', filter.actorId);
  if (filter.action) add('a.action like ?', `${filter.action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  if (filter.targetType) add('a.target_type = ?', filter.targetType);
  if (filter.targetId) add('a.target_id = ?', filter.targetId);
  if (filter.beforeId) add('a.id < ?::bigint', filter.beforeId);
  params.push(limit + 1);
  const { rows } = await q.query<{
    id: string;
    at: Date;
    actor_id: string | null;
    actor_username: string | null;
    actor_role: Role | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, unknown>;
    ip: string | null;
  }>(
    `select a.id::text, a.at, a.actor_id::text, u.username as actor_username, a.actor_role::text, a.action,
            a.target_type, a.target_id, a.details, host(a.ip) as ip
       from audit_logs a left join users u on u.id = a.actor_id
      ${where.length > 0 ? `where ${where.join(' and ')}` : ''}
      order by a.id desc limit $${params.length}`,
    params,
  );
  const items = rows.slice(0, limit).map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actor: r.actor_id && r.actor_username ? { id: r.actor_id, username: r.actor_username } : null,
    actorRole: r.actor_role,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    details: r.details,
    ip: r.ip,
  }));
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? last.id : null };
}
