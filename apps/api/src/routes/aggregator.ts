import { AppError, v } from '@aurum/shared';
import { access, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { launchGame, syncCatalogue, walletCallback } from '../services/aggregator.ts';

const launchSchema = v.object({
  language: v.withDefault(v.string({ min: 2, max: 5, pattern: /^[a-z]{2}(-[A-Z]{2})?$/ }), 'en'),
  returnUrl: v.string({ min: 8, max: 300, pattern: /^https?:\/\/[^\s]+$/ }),
});

export const aggregatorRoutes: Route[] = [
  {
    method: 'POST',
    path: '/v1/games/:slug/launch',
    access: access.player,
    async handler(ctx) {
      const slug = ctx.params.slug ?? '';
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new AppError('not_found');
      const body = await ctx.json(launchSchema);
      if (!ctx.config.webOrigins.some((o) => body.returnUrl === o || body.returnUrl.startsWith(`${o}/`))) throw new AppError('validation', { fields: { returnUrl: 'invalidFormat' } });
      return ok(await launchGame(ctx, slug, body));
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/aggregator/sync',
    access: access.super,
    async handler(ctx) {
      return ok(await syncCatalogue(ctx));
    },
  },
  // Server-to-server callbacks of the aggregator (signed with AGGREGATOR_SECRET).
  { method: 'POST', path: '/v1/aggregator/wallet/balance', access: access.public, handler: (ctx) => walletCallback(ctx, 'balance') },
  { method: 'POST', path: '/v1/aggregator/wallet/debit', access: access.public, handler: (ctx) => walletCallback(ctx, 'debit') },
  { method: 'POST', path: '/v1/aggregator/wallet/credit', access: access.public, handler: (ctx) => walletCallback(ctx, 'credit') },
  { method: 'POST', path: '/v1/aggregator/wallet/rollback', access: access.public, handler: (ctx) => walletCallback(ctx, 'rollback') },
];
