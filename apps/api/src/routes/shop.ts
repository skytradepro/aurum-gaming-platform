/** The shop counter API, for signed-in shop workers (role 'cashier'). */
import { LOCALES } from '@aurum/i18n';
import { AppError, SHOP_CASH_ENTRY_TYPES, v } from '@aurum/shared';
import { readQuery } from '../http/query.ts';
import { access, created, ok } from '../http/types.ts';
import type { Ctx, Route } from '../http/types.ts';
import { counterDeposit, counterReceipt, counterRegisterPlayer, counterSummary, counterTransactions, findPlayers } from '../services/cashier.ts';
import { listCashCounts, recordCashCount } from '../services/shops.ts';
import { lookupForPayout, payWithdrawal } from '../services/withdrawals.ts';
import { confirmApproval, counterPlayer, requestApproval } from '../services/withdrawal-approvals.ts';
import { NUMERIC_ID } from './shared.ts';

const IDEMPOTENCY_KEY = v.string({ min: 8, max: 100, pattern: /^[A-Za-z0-9_.:-]+$/ });
const PERSON_NAME = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;

function numericId(ctx: Ctx): string {
  const id = ctx.params.id ?? '';
  if (!NUMERIC_ID.test(id)) throw new AppError('not_found');
  return id;
}

const findQuery = v.object({ q: v.withDefault(v.string({ min: 0, max: 254 }), '') });

const depositSchema = v.object({
  playerId: v.uuid(),
  amount: v.string({ max: 40 }),
  idempotencyKey: IDEMPOTENCY_KEY,
});

const lookupSchema = v.object({
  code: v.string({ min: 10, max: 20 }),
  account: v.string({ min: 1, max: 254 }),
});

const counterPlayerSchema = v.object({ account: v.string({ min: 1, max: 254 }) });
const approvalSchema = v.object({ account: v.string({ min: 1, max: 254 }), amount: v.string({ max: 40 }) });
const confirmSchema = v.object({ code: v.string({ min: 6, max: 6, pattern: /^[0-9]{6}$/ }) });

const paySchema = v.object({
  idChecked: v.boolean(),
  note: v.optional(v.string({ min: 0, max: 300 })),
});

const registerSchema = v.object({
  username: v.username(),
  email: v.email(),
  callingCode: v.string({ max: 8 }),
  mobile: v.string({ max: 30 }),
  firstName: v.string({ max: 80, pattern: PERSON_NAME }),
  lastName: v.string({ max: 80, pattern: PERSON_NAME }),
  dateOfBirth: v.isoDate(),
  country: v.string({ min: 2, max: 2, transform: (s) => s.toUpperCase(), pattern: /^[A-Z]{2}$/ }),
  termsAcceptedInPerson: v.boolean(),
  preferredLocale: v.optional(v.choice(LOCALES)),
});

const transactionsQuery = v.object({
  scope: v.withDefault(v.choice(['mine', 'shop'] as const), 'mine'),
  type: v.optional(v.choice(SHOP_CASH_ENTRY_TYPES)),
  from: v.optional(v.isoInstant()),
  to: v.optional(v.isoInstant()),
  before: v.optional(v.string({ max: 20, pattern: NUMERIC_ID })),
  limit: v.optional(v.integer({ min: 1, max: 100, coerce: true })),
});

const countSchema = v.object({
  counted: v.string({ max: 40 }),
  note: v.optional(v.string({ min: 0, max: 500 })),
});

export const shopRoutes: Route[] = [
  {
    method: 'GET',
    path: '/v1/shop/summary',
    access: access.cashier,
    async handler(ctx) {
      return ok(await counterSummary(ctx));
    },
  },
  {
    method: 'GET',
    path: '/v1/shop/players',
    access: access.cashier,
    async handler(ctx) {
      const q = readQuery(ctx, findQuery);
      return ok({ items: await findPlayers(ctx, q.q) });
    },
  },
  {
    method: 'POST',
    path: '/v1/shop/players',
    access: access.cashier,
    limit: { name: 'counter-register', max: 60, windowMs: 60 * 60_000 },
    async handler(ctx) {
      const result = await counterRegisterPlayer(ctx, await ctx.json(registerSchema));
      return { ...created(result), headers: { 'cache-control': 'no-store' } };
    },
  },
  {
    method: 'POST',
    path: '/v1/shop/deposits',
    access: access.cashier,
    async handler(ctx) {
      const result = await counterDeposit(ctx, await ctx.json(depositSchema));
      return result.replayed ? ok(result) : created(result);
    },
  },
  {
    // Withdrawal started at the counter: see the player, ask for their one-time code, confirm and pay.
    method: 'POST',
    path: '/v1/shop/counter/player',
    access: access.cashier,
    async handler(ctx) {
      return ok({ player: await counterPlayer(ctx, (await ctx.json(counterPlayerSchema)).account) });
    },
  },
  {
    method: 'POST',
    path: '/v1/shop/counter/approvals',
    access: access.cashier,
    async handler(ctx) {
      return created(await requestApproval(ctx, await ctx.json(approvalSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/shop/counter/approvals/:id/confirm',
    access: access.cashier,
    async handler(ctx) {
      return ok(await confirmApproval(ctx, numericId(ctx), (await ctx.json(confirmSchema)).code));
    },
  },
  {
    method: 'POST',
    path: '/v1/shop/payouts/lookup',
    access: access.cashier,
    async handler(ctx) {
      return ok(await lookupForPayout(ctx, await ctx.json(lookupSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/shop/payouts/:id',
    access: access.cashier,
    async handler(ctx) {
      const result = await payWithdrawal(ctx, numericId(ctx), await ctx.json(paySchema));
      return result.replayed ? ok(result) : created(result);
    },
  },
  {
    method: 'GET',
    path: '/v1/shop/transactions',
    access: access.cashier,
    async handler(ctx) {
      const q = readQuery(ctx, transactionsQuery);
      return ok(await counterTransactions(ctx, { scope: q.scope, entryType: q.type, from: q.from, to: q.to, beforeId: q.before, limit: q.limit }));
    },
  },
  {
    method: 'GET',
    path: '/v1/shop/receipts/:id',
    access: access.cashier,
    async handler(ctx) {
      return ok(await counterReceipt(ctx, numericId(ctx)));
    },
  },
  {
    method: 'GET',
    path: '/v1/shop/cash-counts',
    access: access.shopManager,
    async handler(ctx) {
      return ok({ items: await listCashCounts(ctx.db, ctx.principal().shopId ?? '0') });
    },
  },
  {
    method: 'POST',
    path: '/v1/shop/cash-counts',
    access: access.shopManager,
    async handler(ctx) {
      return created({ count: await recordCashCount(ctx, ctx.principal().shopId ?? '0', await ctx.json(countSchema)) });
    },
  },
];
