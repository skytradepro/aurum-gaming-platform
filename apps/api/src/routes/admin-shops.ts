/** Head-office API for shops, shop workers, shop cash and withdrawals. */
import { AppError, SHOP_CASH_ENTRY_TYPES, SHOP_ROLES, SHOP_STATUSES, STAFF_SHOP_CASH_ENTRY_TYPES, STAFF_SHOP_CREDIT_ENTRY_TYPES, WITHDRAWAL_STATUSES, v } from '@aurum/shared';
import { readQuery } from '../http/query.ts';
import { access, created, ok } from '../http/types.ts';
import type { Ctx, Route } from '../http/types.ts';
import {
  createWorker,
  getShop,
  getWorker,
  listCashCounts,
  listShopCash,
  listShopCredit,
  listShops,
  listWorkers,
  postShopCredit,
  postStaffShopCash,
  recordCashCount,
  saveShop,
  setShopStatus,
  shopCashHealth,
  shopReport,
  updateWorker,
} from '../services/shops.ts';
import { resetPassword } from '../services/users.ts';
import { getWithdrawal, listWithdrawals, rejectWithdrawal } from '../services/withdrawals.ts';
import { listOnlineWithdrawals, payOnlineWithdrawal, rejectOnlineWithdrawal } from '../services/online-withdrawals.ts';
import { CURRENCY_CODE, NUMERIC_ID } from './shared.ts';

const canSeeShops = access.staff('shops.view', 'shops.manage', 'shops.cash');
const canSeeWithdrawals = access.staff('withdrawals.view', 'withdrawals.manage', 'shops.view', 'shops.manage');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;
const IDEMPOTENCY_KEY = v.string({ min: 8, max: 100, pattern: /^[A-Za-z0-9_.:-]+$/ });

function numericId(ctx: Ctx): string {
  const id = ctx.params.id ?? '';
  if (!NUMERIC_ID.test(id)) throw new AppError('not_found');
  return id;
}

function uuidParam(ctx: Ctx): string {
  const id = ctx.params.id ?? '';
  if (!UUID_PATTERN.test(id)) throw new AppError('user_not_found');
  return id.toLowerCase();
}

const shopSchema = v.object({
  code: v.string({ min: 2, max: 20, transform: (s) => s.toUpperCase(), pattern: /^[A-Z0-9][A-Z0-9-]{1,19}$/ }),
  name: v.string({ min: 1, max: 120 }),
  city: v.withDefault(v.string({ min: 0, max: 80 }), ''),
  address: v.withDefault(v.string({ min: 0, max: 300 }), ''),
  callingCode: v.optional(v.string({ min: 0, max: 8 })),
  mobile: v.optional(v.string({ min: 0, max: 30 })),
  openingHours: v.withDefault(v.string({ min: 0, max: 200 }), ''),
  currency: v.string({ min: 3, max: 10, transform: (s) => s.toUpperCase(), pattern: CURRENCY_CODE }),
  status: v.withDefault(v.choice(SHOP_STATUSES), 'active'),
  isListed: v.withDefault(v.boolean(), true),
  maxDeposit: v.optional(v.string({ min: 0, max: 40 })),
  maxPayout: v.optional(v.string({ min: 0, max: 40 })),
  // prepaid shops pay players from their own cash (migration 0016): the drawer may go below zero
  allowNegativeCash: v.withDefault(v.boolean(), true),
});

const shopsQuery = v.object({
  status: v.optional(v.choice(SHOP_STATUSES)),
  q: v.optional(v.string({ min: 0, max: 60 })),
});

const cashQuery = v.object({
  type: v.optional(v.choice(SHOP_CASH_ENTRY_TYPES)),
  operatorId: v.optional(v.uuid()),
  from: v.optional(v.isoInstant()),
  to: v.optional(v.isoInstant()),
  before: v.optional(v.string({ max: 20, pattern: NUMERIC_ID })),
  limit: v.optional(v.integer({ min: 1, max: 200, coerce: true })),
});

const staffCashSchema = v.object({
  entryType: v.choice(STAFF_SHOP_CASH_ENTRY_TYPES),
  amount: v.string({ max: 40 }),
  reason: v.optional(v.string({ min: 0, max: 500 })),
  reference: v.optional(v.string({ min: 0, max: 200 })),
  idempotencyKey: IDEMPOTENCY_KEY,
});

// prepaid shop balance: head office recharges a shop (or corrects a mistake)
const creditSchema = v.object({
  entryType: v.withDefault(v.choice(STAFF_SHOP_CREDIT_ENTRY_TYPES), 'recharge'),
  amount: v.string({ max: 40 }),
  reason: v.optional(v.string({ min: 0, max: 500 })),
  idempotencyKey: IDEMPOTENCY_KEY,
});

const countSchema = v.object({
  counted: v.string({ max: 40 }),
  note: v.optional(v.string({ min: 0, max: 500 })),
});

const reportQuery = v.object({
  from: v.isoInstant(),
  to: v.isoInstant(),
  shopId: v.optional(v.string({ max: 20, pattern: NUMERIC_ID })),
  operatorId: v.optional(v.uuid()),
});

const newWorkerSchema = v.object({
  shopId: v.string({ max: 20, pattern: NUMERIC_ID }),
  username: v.username(),
  email: v.email(),
  firstName: v.string({ max: 80, pattern: NAME }),
  lastName: v.string({ max: 80, pattern: NAME }),
  shopRole: v.choice(SHOP_ROLES),
});

const workerPatchSchema = v.object({
  shopId: v.optional(v.string({ max: 20, pattern: NUMERIC_ID })),
  shopRole: v.optional(v.choice(SHOP_ROLES)),
  status: v.optional(v.choice(['active', 'suspended'] as const)),
  firstName: v.optional(v.string({ max: 80, pattern: NAME })),
  lastName: v.optional(v.string({ max: 80, pattern: NAME })),
  email: v.optional(v.email()),
});

const workersQuery = v.object({ shopId: v.optional(v.string({ max: 20, pattern: NUMERIC_ID })) });

const withdrawalsQuery = v.object({
  status: v.optional(v.choice(WITHDRAWAL_STATUSES)),
  userId: v.optional(v.uuid()),
  shopId: v.optional(v.string({ max: 20, pattern: NUMERIC_ID })),
  currency: v.optional(v.string({ min: 3, max: 10, transform: (s) => s.toUpperCase(), pattern: CURRENCY_CODE })),
  from: v.optional(v.isoInstant()),
  to: v.optional(v.isoInstant()),
  before: v.optional(v.string({ max: 20, pattern: NUMERIC_ID })),
  limit: v.optional(v.integer({ min: 1, max: 200, coerce: true })),
});

const rejectSchema = v.object({ reason: v.string({ min: 3, max: 500 }) });
const paySchema = v.object({ reference: v.string({ min: 3, max: 200 }) });
const onlineQuery = v.object({ status: v.optional(v.choice(['pending', 'paid', 'cancelled', 'rejected'] as const)) });

export const adminShopRoutes: Route[] = [
  // shops
  {
    method: 'GET',
    path: '/v1/admin/shops',
    access: canSeeShops,
    async handler(ctx) {
      const q = readQuery(ctx, shopsQuery);
      return ok({ items: await listShops(ctx.db, { status: q.status, search: q.q }) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/shops',
    access: access.staff('shops.manage'),
    async handler(ctx) {
      return created({ shop: await saveShop(ctx, null, await ctx.json(shopSchema)) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/shops/:id',
    access: canSeeShops,
    async handler(ctx) {
      const shop = await getShop(ctx.db, numericId(ctx));
      if (!shop) throw new AppError('shop_not_found');
      return ok({ shop });
    },
  },
  {
    method: 'PUT',
    path: '/v1/admin/shops/:id',
    access: access.staff('shops.manage'),
    async handler(ctx) {
      return ok({ shop: await saveShop(ctx, numericId(ctx), await ctx.json(shopSchema)) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/shops/:id/cash',
    access: canSeeShops,
    async handler(ctx) {
      const q = readQuery(ctx, cashQuery);
      return ok(
        await listShopCash(ctx.db, {
          shopId: numericId(ctx),
          operatorId: q.operatorId,
          ...(q.type ? { entryTypes: [q.type] } : {}),
          from: q.from,
          to: q.to,
          beforeId: q.before,
          limit: q.limit,
        }),
      );
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/shops/:id/cash',
    access: access.staff('shops.cash'),
    async handler(ctx) {
      const result = await postStaffShopCash(ctx, numericId(ctx), await ctx.json(staffCashSchema));
      return result.replayed ? ok(result) : created(result);
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/shops/:id/status',
    access: access.staff('shops.manage'),
    async handler(ctx) {
      const body = await ctx.json(v.object({ status: v.choice(['active', 'suspended'] as const) }));
      return ok({ shop: await setShopStatus(ctx, numericId(ctx), body.status) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/shops/:id/credit',
    access: canSeeShops,
    async handler(ctx) {
      return ok({ items: await listShopCredit(ctx.db, numericId(ctx)) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/shops/:id/credit',
    access: access.staff('shops.cash'),
    async handler(ctx) {
      const result = await postShopCredit(ctx, numericId(ctx), await ctx.json(creditSchema));
      return result.replayed ? ok(result) : created(result);
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/shops/:id/cash-counts',
    access: canSeeShops,
    async handler(ctx) {
      return ok({ items: await listCashCounts(ctx.db, numericId(ctx)) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/shops/:id/cash-counts',
    access: access.staff('shops.cash'),
    async handler(ctx) {
      return created({ count: await recordCashCount(ctx, numericId(ctx), await ctx.json(countSchema)) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/shop-cash',
    access: canSeeShops,
    async handler(ctx) {
      const q = readQuery(ctx, cashQuery);
      return ok(await listShopCash(ctx.db, { operatorId: q.operatorId, ...(q.type ? { entryTypes: [q.type] } : {}), from: q.from, to: q.to, beforeId: q.before, limit: q.limit }));
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/reports/shops',
    access: access.staff('shops.view', 'shops.manage', 'shops.cash', 'reports.view'),
    async handler(ctx) {
      const q = readQuery(ctx, reportQuery);
      if (Date.parse(q.to) <= Date.parse(q.from)) throw new AppError('validation', { fields: { to: 'invalidPeriod' } });
      return ok(await shopReport(ctx.db, { from: q.from, to: q.to, shopId: q.shopId, operatorId: q.operatorId }));
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/reports/shop-cash-health',
    access: access.staff('shops.view', 'shops.manage', 'shops.cash', 'reports.view'),
    limit: { name: 'shop-cash-health', max: 20, windowMs: 60_000 },
    async handler(ctx) {
      const problems = await shopCashHealth(ctx.db);
      return ok({ ok: problems.length === 0, checkedAt: ctx.now.toISOString(), problems: problems.slice(0, 200) });
    },
  },

  // shop workers
  {
    method: 'GET',
    path: '/v1/admin/workers',
    access: canSeeShops,
    async handler(ctx) {
      const q = readQuery(ctx, workersQuery);
      return ok({ items: await listWorkers(ctx.db, q.shopId) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/workers',
    access: access.staff('shops.manage'),
    limit: { name: 'admin-worker-create', max: 60, windowMs: 60 * 60_000 },
    async handler(ctx) {
      const result = await createWorker(ctx, await ctx.json(newWorkerSchema));
      return { ...created(result), headers: { 'cache-control': 'no-store' } };
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/workers/:id',
    access: canSeeShops,
    async handler(ctx) {
      const worker = await getWorker(ctx.db, uuidParam(ctx));
      if (!worker) throw new AppError('user_not_found');
      return ok({ worker });
    },
  },
  {
    method: 'PATCH',
    path: '/v1/admin/workers/:id',
    access: access.staff('shops.manage'),
    async handler(ctx) {
      return ok({ worker: await updateWorker(ctx, uuidParam(ctx), await ctx.json(workerPatchSchema)) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/workers/:id/reset-password',
    access: access.staff('shops.manage'),
    limit: { name: 'admin-reset-password', max: 30, windowMs: 60 * 60_000 },
    async handler(ctx) {
      const temporaryPassword = await resetPassword(ctx, uuidParam(ctx), ['cashier']);
      return ok({ temporaryPassword }, { headers: { 'cache-control': 'no-store' } });
    },
  },

  // withdrawals
  {
    method: 'GET',
    path: '/v1/admin/withdrawals',
    access: canSeeWithdrawals,
    async handler(ctx) {
      const q = readQuery(ctx, withdrawalsQuery);
      return ok(await listWithdrawals(ctx.db, { status: q.status, userId: q.userId, shopId: q.shopId, currency: q.currency, from: q.from, to: q.to, beforeId: q.before, limit: q.limit }));
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/withdrawals/:id',
    access: canSeeWithdrawals,
    async handler(ctx) {
      const withdrawal = await getWithdrawal(ctx.db, numericId(ctx));
      if (!withdrawal) throw new AppError('withdrawal_not_found');
      return ok({ withdrawal });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/withdrawals/:id/reject',
    access: access.staff('withdrawals.manage'),
    async handler(ctx) {
      const body = await ctx.json(rejectSchema);
      return ok({ withdrawal: await rejectWithdrawal(ctx, numericId(ctx), body.reason) });
    },
  },

  // online withdrawals (bank transfer / crypto), paid by head office by hand
  {
    method: 'GET',
    path: '/v1/admin/online-withdrawals',
    access: canSeeWithdrawals,
    async handler(ctx) {
      const q = readQuery(ctx, onlineQuery);
      return ok({ items: await listOnlineWithdrawals(ctx.db, q.status) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/online-withdrawals/:id/pay',
    access: access.staff('withdrawals.manage'),
    async handler(ctx) {
      const body = await ctx.json(paySchema);
      return ok({ withdrawal: await payOnlineWithdrawal(ctx, numericId(ctx), body.reference) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/online-withdrawals/:id/reject',
    access: access.staff('withdrawals.manage'),
    async handler(ctx) {
      const body = await ctx.json(rejectSchema);
      return ok({ withdrawal: await rejectOnlineWithdrawal(ctx, numericId(ctx), body.reason) });
    },
  },
];
