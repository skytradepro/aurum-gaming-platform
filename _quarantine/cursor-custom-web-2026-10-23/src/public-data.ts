/**
 * Public, anonymous API data (banners, games, promotions, shops) with a short in-memory cache,
 * so a busy home page does not hit the API on every view. Never used for signed-in data.
 */
import { withQuery } from './api.ts';
import type { PageCtx } from './context.ts';
import type { DemoJackpotDTO, DemoWinnerDTO, GameDTO, ProviderDTO, PublicBannerDTO, PublicPageDTO, PublicPromotionDTO, PublicShopDTO } from './types.ts';

const cache = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 15_000;
const MAX_ENTRIES = 500;

async function cachedGet<T>(ctx: PageCtx, path: string, query: Record<string, string | number | boolean | undefined>): Promise<T> {
  const key = withQuery(path, query);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await ctx.api.get<T>(path, query);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Drop everything (used by tests and after a dashboard change, so editors see their change at once). */
export function clearPublicCache(): void {
  cache.clear();
}

export type BannerPlacement = 'home_hero' | 'casino_hero' | 'live_casino_hero' | 'sports_hero';

export async function banners(ctx: PageCtx, placement: BannerPlacement): Promise<PublicBannerDTO[]> {
  return (await cachedGet<{ items: PublicBannerDTO[] }>(ctx, '/v1/public/banners', { placement, locale: ctx.locale })).items;
}

export interface GameQuery {
  category?: string | undefined;
  provider?: string | undefined;
  q?: string | undefined;
  featured?: boolean | undefined;
  new?: boolean | undefined;
  sort?: string | undefined;
  offset?: number | undefined;
  limit?: number | undefined;
}

export async function games(ctx: PageCtx, query: GameQuery): Promise<{ items: GameDTO[]; total: number; demo: boolean }> {
  return cachedGet(ctx, '/v1/public/games', { ...query });
}

export async function game(ctx: PageCtx, slug: string): Promise<GameDTO> {
  return (await cachedGet<{ game: GameDTO }>(ctx, `/v1/public/games/${encodeURIComponent(slug)}`, {})).game;
}

export async function providers(ctx: PageCtx): Promise<ProviderDTO[]> {
  return (await cachedGet<{ items: ProviderDTO[] }>(ctx, '/v1/public/providers', {})).items;
}

export async function promotions(ctx: PageCtx): Promise<PublicPromotionDTO[]> {
  return (await cachedGet<{ items: PublicPromotionDTO[] }>(ctx, '/v1/public/promotions', { locale: ctx.locale })).items;
}

export async function promotion(ctx: PageCtx, slug: string): Promise<PublicPromotionDTO> {
  return (await cachedGet<{ item: PublicPromotionDTO }>(ctx, `/v1/public/promotions/${encodeURIComponent(slug)}`, { locale: ctx.locale })).item;
}

export async function infoPage(ctx: PageCtx, slug: string): Promise<PublicPageDTO> {
  return (await cachedGet<{ page: PublicPageDTO }>(ctx, `/v1/public/pages/${encodeURIComponent(slug)}`, { locale: ctx.locale })).page;
}

export async function shops(ctx: PageCtx, currency?: string): Promise<PublicShopDTO[]> {
  return (await cachedGet<{ items: PublicShopDTO[] }>(ctx, '/v1/public/shops', { currency })).items;
}

export async function demoWinners(ctx: PageCtx, currency: string): Promise<DemoWinnerDTO[]> {
  if (!ctx.publicConfig.demo) return [];
  return (await cachedGet<{ items: DemoWinnerDTO[] }>(ctx, '/v1/public/demo/winners', { currency })).items;
}

export async function demoJackpots(ctx: PageCtx, currency: string): Promise<DemoJackpotDTO[]> {
  if (!ctx.publicConfig.demo) return [];
  return (await cachedGet<{ items: DemoJackpotDTO[] }>(ctx, '/v1/public/demo/jackpots', { currency })).items;
}
