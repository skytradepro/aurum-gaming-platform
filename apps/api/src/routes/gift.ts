import { access, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { giftStatus, openGift } from '../services/gift.ts';

/** Daily gift of the player (gift page). */
export const giftRoutes: Route[] = [
  {
    method: 'GET',
    path: '/v1/gift',
    access: access.player,
    async handler(ctx) {
      return ok(await giftStatus(ctx));
    },
  },
  {
    method: 'POST',
    path: '/v1/gift/open',
    access: access.player,
    async handler(ctx) {
      return ok(await openGift(ctx));
    },
  },
];
