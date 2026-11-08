import { AppError, v } from '@aurum/shared';
import { readQuery } from '../http/query.ts';
import { access, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { syncApilxCatalog } from '../services/apilx-catalog.ts';
import { apilxWalletCallback } from '../services/apilx-wallet.ts';

const syncQuery = v.object({
  provider: v.optional(v.string({ max: 40 })),
});

/** API LX callbacks — separate from legacy /v1/aggregator/wallet/*. */
export const apilxRoutes: Route[] = [
  { method: 'POST', path: '/v1/apilx/wallet/GetBalance', access: access.public, handler: (ctx) => apilxWalletCallback(ctx, 'GetBalance') },
  { method: 'POST', path: '/v1/apilx/wallet/Withdraw', access: access.public, handler: (ctx) => apilxWalletCallback(ctx, 'Withdraw') },
  { method: 'POST', path: '/v1/apilx/wallet/Deposit', access: access.public, handler: (ctx) => apilxWalletCallback(ctx, 'Deposit') },
  { method: 'POST', path: '/v1/apilx/wallet/BetWin', access: access.public, handler: (ctx) => apilxWalletCallback(ctx, 'BetWin') },
  {
    method: 'POST',
    path: '/v1/apilx/wallet/RollbackTransaction',
    access: access.public,
    handler: (ctx) => apilxWalletCallback(ctx, 'RollbackTransaction'),
  },
  {
    method: 'POST',
    path: '/v1/admin/apilx/sync',
    access: access.super,
    async handler(ctx) {
      if (!ctx.config.apilx) throw new AppError('provider_unavailable', { message: 'APILX_* is not configured' });
      const q = readQuery(ctx, syncQuery);
      return ok(await syncApilxCatalog(ctx, { provider: q.provider }));
    },
  },
];
