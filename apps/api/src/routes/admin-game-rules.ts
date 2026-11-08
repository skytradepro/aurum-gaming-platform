import { AppError, GAME_IDS, v } from '@aurum/shared';
import { CURRENCY_CODE } from './shared.ts';
import { access, created, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { getMyRules, setMyRules } from '../services/game-rules.ts';
import { createPlayerByStaff } from '../services/users.ts';

const NAME = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;

const rulesSchema = v.object({
  maxStake: v.nullable(v.integer({ min: 1, max: 1_000_000 })),
  maxWin: v.nullable(v.integer({ min: 10, max: 1_000_000 })),
  disabled: v.array(v.choice(GAME_IDS), { max: GAME_IDS.length }),
});

const newPlayerSchema = v.object({
  username: v.username(),
  email: v.email(),
  firstName: v.string({ min: 1, max: 80, pattern: NAME }),
  lastName: v.string({ min: 1, max: 80, pattern: NAME }),
  dateOfBirth: v.optional(v.isoDate()),
  country: v.string({ min: 2, max: 2, pattern: /^[A-Z]{2}$/ }),
  currency: v.string({ min: 3, max: 10, pattern: CURRENCY_CODE }),
  callingCode: v.optional(v.string({ min: 0, max: 8 })),
  mobile: v.optional(v.string({ min: 0, max: 30 })),
  confirmed: v.boolean(),
});

export const adminGameRuleRoutes: Route[] = [
  {
    method: 'GET',
    path: '/v1/admin/my-game-rules',
    access: access.anyStaff,
    async handler(ctx) {
      if (ctx.principal().role !== 'admin') throw new AppError('forbidden');
      return ok(await getMyRules(ctx));
    },
  },
  {
    method: 'PUT',
    path: '/v1/admin/my-game-rules',
    access: access.anyStaff,
    async handler(ctx) {
      if (ctx.principal().role !== 'admin') throw new AppError('forbidden');
      await setMyRules(ctx, await ctx.json(rulesSchema));
      return ok(await getMyRules(ctx));
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/players',
    access: access.staff('users.manage'),
    async handler(ctx) {
      return created(await createPlayerByStaff(ctx, await ctx.json(newPlayerSchema)));
    },
  },
];
