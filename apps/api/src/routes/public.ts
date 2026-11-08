import { LOCALES } from '@aurum/i18n';
import { AppError, BANNER_PLACEMENTS, GAME_CATEGORIES, PAGE_SLUGS, v } from '@aurum/shared';
import { readQuery } from '../http/query.ts';
import { access, cacheable, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { getCurrency } from '../services/currencies.ts';
import { publicBanners, publicPage, publicPromotions } from '../services/content.ts';
import { GAME_SORTS, getPublicGame, listGames, listProviders } from '../services/games.ts';
import { serveMedia } from '../services/media.ts';
import { demoJackpots, demoWinners, publicConfig } from '../services/public.ts';
import { footballMatches, teamStar } from '../services/football.ts';
import { matchesWithOdds } from '../services/football-data.ts';
import { liveOdds, liveWinnerPrices, matchDetail, prematchMarkets } from '../services/football-markets.ts';
import type { MarketOffer } from '../services/football-markets.ts';
import { latestRates } from '../services/rates.ts';
import { getSettings } from '../services/settings.ts';
import { publicShops } from '../services/shops.ts';
import { marketPrices } from '../services/market.ts';

const locale = v.withDefault(v.choice(LOCALES), 'en');

const bannersQuery = v.object({
  placement: v.withDefault(v.choice(BANNER_PLACEMENTS), 'home_hero'),
  locale,
});

const localeQuery = v.object({ locale });

const gamesQuery = v.object({
  category: v.optional(v.choice(GAME_CATEGORIES)),
  provider: v.optional(v.string({ max: 80, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/ })),
  q: v.optional(v.string({ min: 0, max: 60 })),
  featured: v.optional(v.boolean({ coerce: true })),
  new: v.optional(v.boolean({ coerce: true })),
  sort: v.optional(v.choice(GAME_SORTS)),
  offset: v.optional(v.integer({ min: 0, max: 100_000, coerce: true })),
  limit: v.optional(v.integer({ min: 1, max: 200, coerce: true })),
});

const demoQuery = v.object({ currency: v.withDefault(v.string({ min: 3, max: 10, transform: (s) => s.toUpperCase() }), 'TND') });

const footballQuery = v.object({ date: v.optional(v.string({ pattern: /^\d{4}-\d{2}-\d{2}$/ })) });

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const shopsQuery = v.object({ currency: v.optional(v.string({ min: 3, max: 10, transform: (s) => s.toUpperCase(), pattern: /^[A-Z][A-Z0-9]{2,9}$/ })) });

export const publicRoutes: Route[] = [
  {
    method: 'GET',
    path: '/v1/public/football/live',
    access: access.public,
    async handler(ctx) {
      const reply = await footballMatches(ctx.config, 'live', '');
      // live 1X2 prices of the board (one cached provider request); a failing odds feed never hides the matches
      let prices = new Map<number, { home: number; draw: number; away: number; suspended: boolean }>();
      if (reply.enabled && reply.matches.length > 0) {
        try {
          prices = await liveWinnerPrices(ctx.config);
        } catch {
          prices = new Map();
        }
      }
      return cacheable({ ...reply, matches: reply.matches.map((m) => ({ ...m, liveOdds: prices.get(m.id) ?? null })) }, 10);
    },
  },
  {
    // Match centre: score, minute, timeline (goals, cards, changes), statistics and every market with its price.
    method: 'GET',
    path: '/v1/public/football/match/:id',
    access: access.public,
    async handler(ctx) {
      const id = Number(ctx.params.id ?? '');
      if (!Number.isInteger(id) || id < 1 || id > 2_000_000_000) throw new AppError('not_found');
      if (!ctx.config.footballApiKey) throw new AppError('not_found');
      let match;
      try {
        match = await matchDetail(ctx.config, id);
      } catch {
        throw new AppError('provider_unavailable');
      }
      if (!match) throw new AppError('not_found');
      let offers: MarketOffer[] = [];
      let live = false;
      let closed = true;
      if (match.status === 'NS') {
        closed = Date.parse(match.kickoff) - Date.now() < 2 * 60_000;
        try {
          offers = closed ? [] : await prematchMarkets(ctx.config, id);
        } catch {
          offers = [];
        }
      } else if (['1H', 'HT', '2H'].includes(match.status)) {
        live = true;
        try {
          const lo = await liveOdds(ctx.config, id);
          offers = lo?.offers ?? [];
          closed = !lo || lo.closed || Math.max(lo.elapsed ?? 0, match.elapsed ?? 0) >= 88;
        } catch {
          offers = [];
        }
      }
      return cacheable({ match, markets: { live, closed, offers } }, live ? 4 : 20);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/football/fixtures',
    access: access.public,
    async handler(ctx) {
      const q = readQuery(ctx, footballQuery);
      return cacheable(await matchesWithOdds(ctx.config, q.date ?? new Date().toISOString().slice(0, 10)), 15);
    },
  },
  {
    method: 'GET',
    path: '/v1/health',
    access: access.public,
    async handler(ctx) {
      await ctx.db.query('select 1');
      return { type: 'json', status: 200, body: { data: { status: 'ok' } } };
    },
  },
  {
    method: 'GET',
    path: '/v1/public/config',
    access: access.public,
    async handler(ctx) {
      return cacheable(await publicConfig(ctx.db, ctx.config, ctx.services.captcha), 30);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/rates',
    access: access.public,
    async handler(ctx) {
      return cacheable({ items: await latestRates(ctx.db) }, 60);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/banners',
    access: access.public,
    async handler(ctx) {
      const q = readQuery(ctx, bannersQuery);
      return cacheable({ items: await publicBanners(ctx.db, q.placement, q.locale, ctx.now) }, 15);
    },
  },
  {
    // Read by the web server only: is the secret admin link switched on?
    method: 'GET',
    path: '/v1/public/admin-gate',
    access: access.public,
    async handler(ctx) {
      const settings = await getSettings(ctx.db);
      return ok({ enabled: settings.admin_secret_link_enabled });
    },
  },
  {
    method: 'GET',
    path: '/v1/public/promotions',
    access: access.public,
    async handler(ctx) {
      const q = readQuery(ctx, localeQuery);
      return cacheable({ items: await publicPromotions(ctx.db, q.locale, ctx.now) }, 15);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/promotions/:slug',
    access: access.public,
    async handler(ctx) {
      const slug = ctx.params.slug ?? '';
      if (!SLUG.test(slug)) throw new AppError('not_found');
      const q = readQuery(ctx, localeQuery);
      const [item] = await publicPromotions(ctx.db, q.locale, ctx.now, slug);
      if (!item) throw new AppError('not_found');
      return cacheable({ item }, 15);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/pages/:slug',
    access: access.public,
    async handler(ctx) {
      const slug = ctx.params.slug ?? '';
      if (!(PAGE_SLUGS as readonly string[]).includes(slug)) throw new AppError('not_found');
      const q = readQuery(ctx, localeQuery);
      const page = await publicPage(ctx.db, slug, q.locale);
      if (!page) throw new AppError('not_found');
      return cacheable({ page }, 15);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/providers',
    access: access.public,
    async handler(ctx) {
      return cacheable({ items: await listProviders(ctx.db, { activeOnly: true, includeDemo: ctx.config.showDemoData }) }, 30);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/games',
    access: access.public,
    async handler(ctx) {
      const q = readQuery(ctx, gamesQuery);
      const page = await listGames(ctx.db, {
        category: q.category,
        provider: q.provider,
        search: q.q,
        featured: q.featured,
        isNew: q.new,
        sort: q.sort,
        offset: q.offset,
        limit: q.limit,
        activeOnly: true,
        includeDemo: ctx.config.showDemoData,
      });
      return cacheable({ ...page, demo: ctx.config.showDemoData }, 15);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/games/:slug',
    access: access.public,
    async handler(ctx) {
      const slug = ctx.params.slug ?? '';
      if (!SLUG.test(slug)) throw new AppError('not_found');
      const game = await getPublicGame(ctx.db, slug, ctx.config.showDemoData);
      if (!game) throw new AppError('not_found');
      return cacheable({ game, demo: ctx.config.showDemoData }, 15);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/football/stars',
    access: access.public,
    async handler(ctx) {
      const q = readQuery(ctx, v.object({ teams: v.string({ min: 1, max: 120, pattern: /^\d{1,7}(,\d{1,7}){0,11}$/ }) }));
      const out: Record<string, unknown> = {};
      if (!ctx.config.footballApiKey) return cacheable({ stars: out }, 300);
      for (const id of [...new Set(q.teams.split(',').map(Number))]) {
        out[id] = await teamStar(ctx.config, id).catch(() => null);
      }
      return cacheable({ stars: out }, 3600);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/market',
    access: access.public,
    async handler() {
      return cacheable(await marketPrices(), 30);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/popular-games',
    access: access.public,
    async handler(ctx) {
      // Most played in-house games of the last 7 days, counted from real stakes in the ledger.
      const { rows } = await ctx.db.query<{ game: string; rounds: string }>(
        `select e.metadata->>'game' as game, count(*)::text as rounds
           from ledger_entries e
          where e.entry_type = 'bet_stake'
            and e.created_at > now() - interval '7 days'
            and coalesce(e.metadata->>'game', '') not in ('', 'sports')
          group by 1
          order by count(*) desc
          limit 16`,
      );
      return cacheable({ items: rows.map((r) => ({ game: r.game, rounds: Number(r.rounds) })) }, 60);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/winners',
    access: access.public,
    async handler(ctx) {
      // Real wins only: the biggest game and sports wins of the last 7 days, usernames masked.
      const { rows } = await ctx.db.query<{ username: string; game: string; currency: string; amount_minor: string }>(
        `select username, game, currency, amount_minor::text
           from (
             select u.username, coalesce(nullif(e.metadata->>'game', ''), e.reason, 'game') as game, e.currency, e.amount_minor,
                    row_number() over (partition by coalesce(nullif(e.metadata->>'game', ''), e.reason, 'game') order by e.amount_minor desc) as rn
               from ledger_entries e
               join users u on u.id = e.user_id
              where e.entry_type = 'bet_win'
                and u.role = 'user'
                and e.created_at > now() - interval '7 days'
           ) ranked
          where rn <= 2
          order by amount_minor desc
          limit 20`,
      );
      const mask = (name: string): string => (name.length <= 2 ? `${name.slice(0, 1)}****` : `${name.slice(0, 1)}****${name.slice(-1)}`);
      return cacheable(
        { items: rows.map((r) => ({ username: mask(r.username), game: r.game, currency: r.currency, amountMinor: r.amount_minor })) },
        30,
      );
    },
  },
  {
    method: 'GET',
    path: '/v1/public/winners/:game',
    access: access.public,
    async handler(ctx) {
      // Real wins of one game in the last 7 days (biggest first), usernames masked.
      const game = ctx.params.game ?? '';
      if (!/^[a-z0-9]{2,30}$/.test(game)) throw new AppError('not_found');
      const { rows } = await ctx.db.query<{ username: string; currency: string; amount_minor: string; created_at: Date }>(
        `select u.username, e.currency, e.amount_minor::text, e.created_at
           from ledger_entries e
           join users u on u.id = e.user_id
          where e.entry_type = 'bet_win'
            and u.role = 'user'
            and e.created_at > now() - interval '7 days'
            and coalesce(nullif(e.metadata->>'game', ''), e.reason) = $1
          order by e.amount_minor desc, e.created_at desc
          limit 8`,
        [game],
      );
      const mask = (name: string): string => (name.length <= 2 ? `${name.slice(0, 1)}****` : `${name.slice(0, 1)}****${name.slice(-1)}`);
      return cacheable(
        { items: rows.map((r) => ({ username: mask(r.username), currency: r.currency, amountMinor: r.amount_minor, at: r.created_at.toISOString() })) },
        20,
      );
    },
  },
  {
    method: 'GET',
    path: '/v1/public/demo/winners',
    access: access.public,
    async handler(ctx) {
      if (!ctx.config.showDemoData) throw new AppError('not_found');
      const q = readQuery(ctx, demoQuery);
      const currency = await getCurrency(ctx.db, q.currency);
      if (!currency) throw new AppError('currency_unavailable');
      return cacheable(demoWinners(currency), 60);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/demo/jackpots',
    access: access.public,
    async handler(ctx) {
      if (!ctx.config.showDemoData) throw new AppError('not_found');
      const q = readQuery(ctx, demoQuery);
      const currency = await getCurrency(ctx.db, q.currency);
      if (!currency) throw new AppError('currency_unavailable');
      return cacheable(demoJackpots(currency), 60);
    },
  },
  {
    method: 'GET',
    path: '/v1/public/shops',
    access: access.public,
    async handler(ctx) {
      const q = readQuery(ctx, shopsQuery);
      return cacheable({ items: await publicShops(ctx.db, q.currency) }, 60);
    },
  },
  {
    method: 'GET',
    path: '/v1/media/:key',
    access: access.public,
    async handler(ctx) {
      return serveMedia(ctx.config, ctx.params.key ?? '');
    },
  },
];
