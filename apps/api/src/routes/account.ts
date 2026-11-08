import { ENTRY_TYPES, WITHDRAWAL_STATUSES, v } from '@aurum/shared';
import { getWalletByUser } from '@aurum/ledger';
import { AppError } from '@aurum/shared';
import { readQuery } from '../http/query.ts';
import { access, created, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { cancelOwnWithdrawal, listPlayerWithdrawals, requestWithdrawal } from '../services/withdrawals.ts';
import { NUMERIC_ID } from './shared.ts';
import { myApprovals, refuseApproval } from '../services/withdrawal-approvals.ts';
import { cancelOwnOnlineWithdrawal, listMyOnlineWithdrawals, requestOnlineWithdrawal, withdrawalEligibility } from '../services/online-withdrawals.ts';
import { listPlayerTransactions } from '../services/balances.ts';
import { indicativeAmount } from '../services/rates.ts';

const transactionsQuery = v.object({
  before: v.optional(v.string({ max: 20, pattern: /^\d{1,18}$/ })),
  limit: v.optional(v.integer({ min: 1, max: 100, coerce: true })),
  type: v.optional(v.choice(ENTRY_TYPES)),
});

const withdrawalsQuery = v.object({
  status: v.optional(v.choice(WITHDRAWAL_STATUSES)),
  before: v.optional(v.string({ max: 20, pattern: /^\d{1,18}$/ })),
  limit: v.optional(v.integer({ min: 1, max: 100, coerce: true })),
});

const newOnlineWithdrawalSchema = v.object({
  method: v.choice(['bank', 'crypto'] as const),
  amount: v.string({ max: 40 }),
  idempotencyKey: v.string({ min: 8, max: 100, pattern: /^[A-Za-z0-9_.:-]+$/ }),
  accountName: v.optional(v.string({ max: 100 })),
  iban: v.optional(v.string({ max: 50 })),
  network: v.optional(v.string({ max: 30 })),
  address: v.optional(v.string({ max: 100 })),
});

const newWithdrawalSchema = v.object({
  amount: v.string({ max: 40 }),
  preferredShopId: v.optional(v.string({ max: 20, pattern: NUMERIC_ID })),
  idempotencyKey: v.string({ min: 8, max: 100, pattern: /^[A-Za-z0-9_.:-]+$/ }),
});

export const accountRoutes: Route[] = [
  {
    // Bank transfer deposit details. The player's reference lets the team match the transfer to the right account;
    // the balance is credited by staff after the money has arrived (no automatic credit).
    method: 'GET',
    path: '/v1/account/deposit/bank',
    access: access.player,
    async handler(ctx) {
      const bank = ctx.config.bankTransfer;
      if (!bank) return ok({ available: false });
      const user = ctx.principal();
      return ok({ available: true, ...bank, reference: `HNB-${user.username}`.toUpperCase() });
    },
  },
  {
    method: 'GET',
    path: '/v1/account/wallet',
    access: access.player,
    async handler(ctx) {
      const user = ctx.principal();
      const wallet = await getWalletByUser(ctx.db, user.id);
      if (!wallet) throw new AppError('wallet_not_found');
      // Indicative only: the balance is always kept and settled in the account currency.
      const indicative =
        user.displayCurrency && user.displayCurrency !== wallet.currency
          ? await indicativeAmount(ctx.db, { amountMinor: wallet.balanceMinor, from: wallet.currency, to: user.displayCurrency })
          : null;
      return ok({
        wallet: { id: wallet.id, currency: wallet.currency, balance: { amountMinor: wallet.balanceMinor.toString(), currency: wallet.currency } },
        indicative,
      });
    },
  },
  {
    method: 'GET',
    path: '/v1/account/transactions',
    access: access.player,
    async handler(ctx) {
      const q = readQuery(ctx, transactionsQuery);
      const page = await listPlayerTransactions(ctx.db, ctx.principal().id, {
        ...(q.type ? { types: [q.type] } : {}),
        ...(q.before ? { beforeId: q.before } : {}),
        ...(q.limit ? { limit: q.limit } : {}),
      });
      return ok(page);
    },
  },
  {
    method: 'GET',
    path: '/v1/account/withdrawals',
    access: access.player,
    async handler(ctx) {
      const q = readQuery(ctx, withdrawalsQuery);
      return ok(await listPlayerWithdrawals(ctx.db, ctx.principal().id, { status: q.status, beforeId: q.before, limit: q.limit }));
    },
  },
  {
    method: 'POST',
    path: '/v1/account/withdrawals',
    access: access.player,
    limit: { name: 'withdrawal-request', max: 30, windowMs: 60 * 60_000 },
    async handler(ctx) {
      const result = await requestWithdrawal(ctx, await ctx.json(newWithdrawalSchema));
      return result.replayed ? ok(result) : created(result);
    },
  },
  {
    method: 'POST',
    path: '/v1/account/withdrawals/:id/cancel',
    access: access.player,
    async handler(ctx) {
      const id = ctx.params.id ?? '';
      if (!NUMERIC_ID.test(id)) throw new AppError('withdrawal_not_found');
      return ok({ withdrawal: await cancelOwnWithdrawal(ctx, id) });
    },
  },
  {
    // Withdrawals a shop asked for: the player's one-time code (shown only here).
    method: 'GET',
    path: '/v1/account/approvals',
    access: access.player,
    async handler(ctx) {
      return ok({ items: await myApprovals(ctx.db, ctx.principal().id) }, { headers: { 'cache-control': 'no-store' } });
    },
  },
  {
    method: 'POST',
    path: '/v1/account/approvals/:id/refuse',
    access: access.player,
    async handler(ctx) {
      const id = ctx.params.id ?? '';
      if (!NUMERIC_ID.test(id)) throw new AppError('approval_not_found');
      await refuseApproval(ctx, id);
      return ok({ refused: true });
    },
  },
  {
    method: 'GET',
    path: '/v1/account/online-withdrawals',
    access: access.player,
    async handler(ctx) {
      const user = ctx.principal();
      return ok({ items: await listMyOnlineWithdrawals(ctx.db, user.id), ...(await withdrawalEligibility(ctx.db, user.id)) });
    },
  },
  {
    method: 'POST',
    path: '/v1/account/online-withdrawals',
    access: access.player,
    limit: { name: 'online-withdrawal-request', max: 20, windowMs: 60 * 60_000 },
    async handler(ctx) {
      const result = await requestOnlineWithdrawal(ctx, await ctx.json(newOnlineWithdrawalSchema));
      return result.replayed ? ok(result) : created(result);
    },
  },
  {
    method: 'POST',
    path: '/v1/account/online-withdrawals/:id/cancel',
    access: access.player,
    async handler(ctx) {
      const id = ctx.params.id ?? '';
      if (!NUMERIC_ID.test(id)) throw new AppError('withdrawal_not_found');
      return ok({ withdrawal: await cancelOwnOnlineWithdrawal(ctx, id) });
    },
  },
];
