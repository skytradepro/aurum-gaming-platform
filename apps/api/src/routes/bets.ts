import { footballMatches, providerGet } from '../services/football.ts';
import { matchesWithOdds } from '../services/football-data.ts';
import { liveAll, prematchNames } from '../services/football-markets.ts';
import { AppError, SPORT_MARKETS, v } from '@aurum/shared';
import { getWalletByUser } from '@aurum/ledger';
import { readQuery } from '../http/query.ts';
import { access, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { adminBets, betRules, myBets, placeBet, walletDecimals } from '../services/bets.ts';

const placeSchema = v.object({
  stake: v.string({ max: 40 }),
  idempotencyKey: v.string({ min: 8, max: 100, pattern: /^[A-Za-z0-9_.:-]+$/ }),
  selections: v.array(
    v.object({
      fixtureId: v.integer({ min: 1, max: 2_000_000_000 }),
      // old pages send only a pick: that is the match winner market
      market: v.optional(v.choice(SPORT_MARKETS)),
      pick: v.string({ min: 1, max: 8, pattern: /^[A-Za-z0-9-]+$/ }),
      lineX10: v.optional(v.integer({ min: 5, max: 305 })),
      oddsX100: v.integer({ min: 101, max: 100_000 }),
    }),
    { min: 1, max: 20 },
  ),
});

const adminQuery = v.object({ status: v.optional(v.choice(['open', 'won', 'lost', 'void'] as const)), limit: v.withDefault(v.integer({ min: 1, max: 200, coerce: true }), 100) });

const mineQuery = v.object({ limit: v.withDefault(v.integer({ min: 1, max: 100, coerce: true }), 50) });

export const betRoutes: Route[] = [
  {
    method: 'GET',
    path: '/v1/bets/rules',
    access: access.player,
    async handler(ctx) {
      const user = ctx.principal();
      const wallet = await getWalletByUser(ctx.db, user.id);
      if (!wallet) throw new AppError('wallet_not_found');
      const rules = await betRules(ctx.db, await walletDecimals(ctx.db, wallet.currency), user.id);
      return ok({
        enabled: rules.enabled && ctx.config.footballApiKey !== '',
        currency: wallet.currency,
        min: rules.minMinor.toString(),
        max: rules.maxStakeMinor.toString(),
        maxWin: rules.maxWinMinor.toString(),
        maxSelections: rules.maxSelections,
        live: { enabled: rules.liveEnabled, max: rules.liveMaxStakeMinor.toString(), delaySeconds: rules.liveDelaySeconds },
      });
    },
  },
  {
    method: 'POST',
    path: '/v1/bets/place',
    access: access.player,
    async handler(ctx) {
      return ok({ bet: await placeBet(ctx, await ctx.json(placeSchema)) });
    },
  },
  {
    method: 'GET',
    path: '/v1/bets/mine',
    access: access.player,
    async handler(ctx) {
      const q = readQuery(ctx, mineQuery);
      return ok({ items: await myBets(ctx.db, ctx.principal().id, q.limit) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/bets',
    access: access.staff('reports.view'),
    async handler(ctx) {
      const q = readQuery(ctx, adminQuery);
      const me = ctx.principal();
      return ok(await adminBets(ctx.db, { id: me.id, role: me.role }, q.status ?? null, q.limit));
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/football/status',
    access: access.super,
    async handler(ctx) {
      // The API-Football plan of the configured key and today's usage (never the key itself).
      if (!ctx.config.footballApiKey) return ok({ configured: false });
      const body = (await providerGet(ctx.config, '/status')) as { response?: { subscription?: unknown; requests?: unknown } };
      return ok({ configured: true, subscription: body.response?.subscription ?? null, requests: body.response?.requests ?? null });
    },
  },
  {
    // Football check for the Super Admin: plan and usage, the bet names the provider really sends (live and pre-match)
    // and which market each one is read as, and whether live matches come with their cards.
    method: 'GET',
    path: '/v1/admin/football/check',
    access: access.super,
    async handler(ctx) {
      if (!ctx.config.footballApiKey) return ok({ configured: false });
      const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
        try {
          return await fn();
        } catch {
          return null;
        }
      };
      const status = (await safe(() => providerGet(ctx.config, '/status'))) as { response?: { subscription?: unknown; requests?: unknown } } | null;
      const all = await safe(() => liveAll(ctx.config));
      const liveList = await safe(() => footballMatches(ctx.config, 'live', ''));
      const today = new Date().toISOString().slice(0, 10);
      const day = await safe(() => matchesWithOdds(ctx.config, today));
      const pre = day?.matches.find((m) => m.status === 'NS' && m.odds) ?? null;
      const preNames = pre ? await safe(() => prematchNames(ctx.config, pre.id)) : null;
      return ok({
        configured: true,
        subscription: status?.response?.subscription ?? null,
        requests: status?.response?.requests ?? null,
        settings: {
          oddsMaxPages: ctx.config.footballOddsMaxPages,
          liveListSeconds: ctx.config.footballLiveCacheSeconds,
          liveOddsSeconds: ctx.config.footballLiveOddsSeconds,
          detailLiveSeconds: ctx.config.footballDetailLiveSeconds,
        },
        today: day ? { matches: day.matches.length, withOdds: day.matches.filter((m) => m.status === 'NS' && m.odds).length } : null,
        live: all ? { at: all.at, matches: liveList?.matches.length ?? null, withOdds: all.list.length, withCards: liveList ? liveList.matches.filter((m) => m.cards).length : null, names: all.names } : null,
        prematch: pre && preNames ? { fixtureId: pre.id, match: `${pre.home.name} - ${pre.away.name}`, names: preNames } : null,
      });
    },
  },
];
