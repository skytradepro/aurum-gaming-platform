import { AppError, v } from '@aurum/shared';
import { readQuery } from '../http/query.ts';
import { access, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { cancelDeposit, adminDeposits, confirmDeposit, createDeposit, myDeposits, publicNetworks } from '../services/crypto.ts';

const createSchema = v.object({ network: v.string({ min: 2, max: 30, pattern: /^[a-z0-9_]+$/ }), amount: v.string({ min: 1, max: 30 }) });
const confirmSchema = v.object({ txHash: v.string({ min: 40, max: 90 }) });
const adminQuery = v.object({ limit: v.withDefault(v.integer({ min: 1, max: 500, coerce: true }), 200) });

export const cryptoRoutes: Route[] = [
  {
    method: 'GET',
    path: '/v1/crypto/networks',
    access: access.player,
    async handler(ctx) {
      return ok({ items: await publicNetworks(ctx.db) });
    },
  },
  {
    method: 'GET',
    path: '/v1/crypto/deposits',
    access: access.player,
    async handler(ctx) {
      return ok({ items: await myDeposits(ctx.db, ctx.principal().id) });
    },
  },
  {
    method: 'POST',
    path: '/v1/crypto/deposits',
    access: access.player,
    async handler(ctx) {
      return ok({ deposit: await createDeposit(ctx, await ctx.json(createSchema)) });
    },
  },
  {
    method: 'POST',
    path: '/v1/crypto/deposits/:id/confirm',
    access: access.player,
    async handler(ctx) {
      const id = ctx.params.id ?? '';
      if (!/^\d{1,18}$/.test(id)) throw new AppError('not_found');
      const body = await ctx.json(confirmSchema);
      return ok({ deposit: await confirmDeposit(ctx, id, body.txHash) });
    },
  },
  {
    method: 'POST',
    path: '/v1/crypto/deposits/:id/cancel',
    access: access.player,
    async handler(ctx) {
      const id = ctx.params.id ?? '';
      if (!/^\d{1,18}$/.test(id)) throw new AppError('not_found');
      return ok({ deposit: await cancelDeposit(ctx, id) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/crypto-deposits',
    access: access.staff('reports.view'),
    async handler(ctx) {
      const q = readQuery(ctx, adminQuery);
      return ok({ items: await adminDeposits(ctx.db, q.limit) });
    },
  },
];
