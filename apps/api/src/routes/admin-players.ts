import { ENTRY_TYPES, STAFF_ENTRY_TYPES, USER_STATUSES, AppError, v } from '@aurum/shared';
import { CURRENCY_CODE } from './shared.ts';
import { readQuery } from '../http/query.ts';
import { access, created, ok } from '../http/types.ts';
import type { Ctx, Route } from '../http/types.ts';
import { adminBetsForPlayer } from '../services/bets.ts';
import { listLedger, postStaffEntry } from '../services/balances.ts';
import { dashboardSummary, ledgerHealth, listAudit } from '../services/reports.ts';
import { getPlayer, listPlayers, resetPassword, updatePlayer } from '../services/users.ts';

// Anyone who can look at balances or accounts may find a player.
const canFindPlayers = access.staff('users.view', 'users.manage', 'balances.view', 'balances.manage');
const canSeeLedger = access.staff('balances.view', 'balances.manage');

const UUID = v.uuid();

function playerId(ctx: Ctx): string {
  const id = ctx.params.id ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AppError('user_not_found');
  return id.toLowerCase();
}

/**
 * An admin (not the Super Admin) only sees and manages the players he created (users.owner_id);
 * the Super Admin sees everyone. Returns the owner to filter on, or undefined for no filter.
 */
function ownerScope(ctx: Ctx): string | undefined {
  const me = ctx.principal();
  return me.role === 'super_admin' ? undefined : me.id;
}

/** The player id from the URL, refused (as not found) when this admin did not create the player. */
async function myPlayerId(ctx: Ctx): Promise<string> {
  const id = playerId(ctx);
  const owner = ownerScope(ctx);
  if (owner) {
    const { rows } = await ctx.db.query(`select 1 from users where id = $1::uuid and role = 'user' and owner_id = $2::uuid`, [id, owner]);
    if (rows.length === 0) throw new AppError('user_not_found');
  }
  return id;
}

const playersQuery = v.object({
  q: v.optional(v.string({ min: 0, max: 60 })),
  /** Super Admin: the players of one admin. An admin always sees only his own. */
  ownerId: v.optional(UUID),
  status: v.optional(v.choice(USER_STATUSES)),
  before: v.optional(v.string({ max: 20, pattern: /^\d{1,18}$/ })),
  limit: v.optional(v.integer({ min: 1, max: 100, coerce: true })),
});

const NAME = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;

const playerPatchSchema = v.object({
  status: v.optional(v.choice(USER_STATUSES)),
  reason: v.optional(v.string({ min: 0, max: 500 })),
  firstName: v.optional(v.string({ max: 80, pattern: NAME })),
  lastName: v.optional(v.string({ max: 80, pattern: NAME })),
  email: v.optional(v.email()),
  callingCode: v.optional(v.string({ max: 8 })),
  mobile: v.optional(v.string({ max: 30 })),
});

const IDEMPOTENCY_KEY = v.string({ min: 8, max: 100, pattern: /^[A-Za-z0-9_.:-]+$/ });

const balanceSchema = v.object({
  entryType: v.choice(STAFF_ENTRY_TYPES),
  amount: v.optional(v.string({ max: 40 })),
  original: v.optional(
    v.object({
      amount: v.string({ max: 40 }),
      currency: v.string({ min: 3, max: 10, transform: (s) => s.toUpperCase(), pattern: CURRENCY_CODE }),
      rate: v.string({ max: 40 }),
    }),
  ),
  reason: v.optional(v.string({ min: 0, max: 500 })),
  reference: v.optional(v.string({ min: 0, max: 200 })),
  idempotencyKey: IDEMPOTENCY_KEY,
});

const playerBetsQuery = v.object({ limit: v.withDefault(v.integer({ min: 1, max: 100, coerce: true }), 40) });

const ledgerQuery = v.object({
  userId: v.optional(UUID),
  type: v.optional(v.choice(ENTRY_TYPES)),
  currency: v.optional(v.string({ min: 3, max: 10, transform: (s) => s.toUpperCase(), pattern: CURRENCY_CODE })),
  operatorId: v.optional(UUID),
  from: v.optional(v.isoInstant()),
  to: v.optional(v.isoInstant()),
  before: v.optional(v.string({ max: 20, pattern: /^\d{1,18}$/ })),
  limit: v.optional(v.integer({ min: 1, max: 200, coerce: true })),
});

const auditQuery = v.object({
  actorId: v.optional(UUID),
  action: v.optional(v.string({ max: 60, pattern: /^[a-z_.]+$/ })),
  targetType: v.optional(v.string({ max: 40, pattern: /^[a-z_]+$/ })),
  targetId: v.optional(v.string({ max: 80 })),
  before: v.optional(v.string({ max: 20, pattern: /^\d{1,18}$/ })),
  limit: v.optional(v.integer({ min: 1, max: 200, coerce: true })),
});

const dashboardQuery = v.object({
  /** Super Admin only: stats for one shop admin’s players. */
  ownerId: v.optional(UUID),
});

export const adminPlayerRoutes: Route[] = [
  {
    method: 'GET',
    path: '/v1/admin/dashboard',
    access: access.staff('reports.view'),
    async handler(ctx) {
      const me = ctx.principal();
      const q = readQuery(ctx, dashboardQuery);
      let ownerId: string | undefined;
      if (me.role === 'super_admin') ownerId = q.ownerId;
      else if (me.role === 'admin') ownerId = me.id;
      return ok(await dashboardSummary(ctx.db, ctx.now, ownerId));
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/reports/ledger-health',
    access: access.staff('reports.view'),
    limit: { name: 'ledger-health', max: 20, windowMs: 60_000 },
    async handler(ctx) {
      return ok(await ledgerHealth(ctx.db, ctx.now));
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/players',
    access: canFindPlayers,
    async handler(ctx) {
      const q = readQuery(ctx, playersQuery);
      return ok(await listPlayers(ctx.db, { search: q.q, status: q.status, before: q.before, limit: q.limit, ownerId: ownerScope(ctx) ?? q.ownerId }));
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/players/:id',
    access: canFindPlayers,
    async handler(ctx) {
      const player = await getPlayer(ctx.db, playerId(ctx), ownerScope(ctx));
      if (!player) throw new AppError('user_not_found');
      return ok({ player });
    },
  },
  {
    method: 'PATCH',
    path: '/v1/admin/players/:id',
    access: access.staff('users.manage'),
    async handler(ctx) {
      const id = await myPlayerId(ctx);
      await updatePlayer(ctx, id, await ctx.json(playerPatchSchema));
      const player = await getPlayer(ctx.db, id);
      if (!player) throw new AppError('user_not_found');
      return ok({ player });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/players/:id/reset-password',
    access: access.staff('users.manage'),
    limit: { name: 'admin-reset-password', max: 30, windowMs: 60 * 60_000 },
    async handler(ctx) {
      const temporaryPassword = await resetPassword(ctx, await myPlayerId(ctx), ['user']);
      return ok({ temporaryPassword }, { headers: { 'cache-control': 'no-store' } });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/players/:id/balance',
    access: access.staff('balances.manage'),
    async handler(ctx) {
      const id = await myPlayerId(ctx);
      const input = await ctx.json(balanceSchema);
      const result = await postStaffEntry(ctx, id, input);
      return result.replayed ? ok(result) : created(result);
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/players/:id/bets',
    access: access.staff('reports.view'),
    async handler(ctx) {
      const q = readQuery(ctx, playerBetsQuery);
      const id = await myPlayerId(ctx);
      const me = ctx.principal();
      return ok(await adminBetsForPlayer(ctx.db, { id: me.id, role: me.role }, id, q.limit));
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/players/:id/ledger',
    access: canSeeLedger,
    async handler(ctx) {
      const q = readQuery(ctx, ledgerQuery);
      const id = await myPlayerId(ctx);
      return ok(
        await listLedger(ctx.db, {
          userId: id,
          ...(q.type ? { entryTypes: [q.type] } : {}),
          ...(q.from ? { from: q.from } : {}),
          ...(q.to ? { to: q.to } : {}),
          ...(q.before ? { beforeId: q.before } : {}),
          ...(q.limit ? { limit: q.limit } : {}),
        }),
      );
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/ledger',
    access: canSeeLedger,
    async handler(ctx) {
      const q = readQuery(ctx, ledgerQuery);
      const owner = ownerScope(ctx);
      return ok(
        await listLedger(ctx.db, {
          ...(owner ? { ownerId: owner } : {}),
          ...(q.userId ? { userId: q.userId } : {}),
          ...(q.operatorId ? { operatorId: q.operatorId } : {}),
          ...(q.currency ? { currency: q.currency } : {}),
          ...(q.type ? { entryTypes: [q.type] } : {}),
          ...(q.from ? { from: q.from } : {}),
          ...(q.to ? { to: q.to } : {}),
          ...(q.before ? { beforeId: q.before } : {}),
          ...(q.limit ? { limit: q.limit } : {}),
        }),
      );
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/audit',
    access: access.staff('audit.view'),
    async handler(ctx) {
      const q = readQuery(ctx, auditQuery);
      return ok(await listAudit(ctx.db, { actorId: q.actorId, action: q.action, targetType: q.targetType, targetId: q.targetId, beforeId: q.before, limit: q.limit }));
    },
  },
];

