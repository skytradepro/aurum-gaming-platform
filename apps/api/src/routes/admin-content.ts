import { LOCALES } from '@aurum/i18n';
import { AppError, BANNER_PLACEMENTS, GAME_CATEGORIES, PAGE_SLUGS, v } from '@aurum/shared';
import type { Infer } from '@aurum/shared';
import { NUMERIC_ID, SLUG } from './shared.ts';
import { readQuery } from '../http/query.ts';
import { access, created, noContent, ok } from '../http/types.ts';
import type { Ctx, Route } from '../http/types.ts';
import { deleteBanner, deletePromotion, getBanner, getPromotion, getPage, listBanners, listPages, listPromotions, saveBanner, savePage, savePromotion } from '../services/content.ts';
import type { BannerInput, PageTranslationInput, PromotionInput } from '../services/content.ts';
import { GAME_SORTS, getGameById, listGames, listProviders, saveGame, saveProvider } from '../services/games.ts';
import { listMedia, saveUpload } from '../services/media.ts';

function numericId(ctx: Ctx): string {
  const id = ctx.params.id ?? '';
  if (!NUMERIC_ID.test(id)) throw new AppError('not_found');
  return id;
}

const text = (max: number) => v.withDefault(v.string({ min: 0, max }), '');
const longText = (max: number) => v.withDefault(v.string({ min: 0, max, multiline: true }), '');
const optionalInstant = v.optional(v.isoInstant());

// --- banners ---------------------------------------------------------------
const bannerTranslation = v.object({
  title: text(120),
  subtitle: text(240),
  ctaLabel: text(40),
  linkUrl: v.withDefault(v.linkUrl(), ''),
  altText: text(200),
  imageDesktopId: v.optional(v.uuid()),
  imageMobileId: v.optional(v.uuid()),
});

const bannerSchema = v.object({
  placement: v.choice(BANNER_PLACEMENTS),
  name: v.string({ min: 1, max: 120 }),
  sortOrder: v.withDefault(v.integer({ min: -10_000, max: 10_000 }), 0),
  isActive: v.withDefault(v.boolean(), true),
  startsAt: optionalInstant,
  endsAt: optionalInstant,
  translations: v.recordOf(LOCALES, bannerTranslation),
});

function bannerInput(body: Infer<typeof bannerSchema>): BannerInput {
  const translations: BannerInput['translations'] = {};
  for (const [locale, t] of Object.entries(body.translations)) {
    translations[locale] = { ...t, imageDesktopId: t.imageDesktopId ?? null, imageMobileId: t.imageMobileId ?? null };
  }
  return { ...body, startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null, translations };
}

const bannersQuery = v.object({ placement: v.optional(v.choice(BANNER_PLACEMENTS)) });

// --- promotions ------------------------------------------------------------
const promotionTranslation = v.object({
  title: v.string({ min: 1, max: 160 }),
  summary: text(400),
  body: longText(20_000),
  terms: longText(20_000),
  imageId: v.optional(v.uuid()),
});

const promotionSchema = v.object({
  slug: v.string({ min: 1, max: 80, pattern: SLUG }),
  sortOrder: v.withDefault(v.integer({ min: -10_000, max: 10_000 }), 0),
  isActive: v.withDefault(v.boolean(), true),
  startsAt: optionalInstant,
  endsAt: optionalInstant,
  translations: v.recordOf(LOCALES, promotionTranslation),
});

// --- pages -----------------------------------------------------------------
const pageSchema = v.object({
  translations: v.recordOf(
    LOCALES,
    v.object({
      title: v.string({ min: 1, max: 160 }),
      body: longText(100_000),
      isPublished: v.withDefault(v.boolean(), false),
    }),
  ),
});

// --- games -----------------------------------------------------------------
const providerSchema = v.object({
  slug: v.string({ min: 1, max: 80, pattern: SLUG }),
  name: v.string({ min: 1, max: 80 }),
  isActive: v.withDefault(v.boolean(), true),
  sortOrder: v.withDefault(v.integer({ min: -10_000, max: 10_000 }), 0),
});

const gameSchema = v.object({
  slug: v.string({ min: 1, max: 100, pattern: SLUG }),
  name: v.string({ min: 1, max: 120 }),
  providerId: v.string({ max: 20, pattern: NUMERIC_ID }),
  category: v.choice(GAME_CATEGORIES),
  isFeatured: v.withDefault(v.boolean(), false),
  isNew: v.withDefault(v.boolean(), false),
  isActive: v.withDefault(v.boolean(), true),
  sortOrder: v.withDefault(v.integer({ min: -10_000, max: 10_000 }), 0),
  thumbnailId: v.optional(v.uuid()),
  externalId: v.optional(v.string({ min: 0, max: 200 })),
});

const adminGamesQuery = v.object({
  sort: v.optional(v.choice(GAME_SORTS)),
  category: v.optional(v.choice(GAME_CATEGORIES)),
  provider: v.optional(v.string({ max: 80, pattern: SLUG })),
  q: v.optional(v.string({ min: 0, max: 60 })),
  offset: v.optional(v.integer({ min: 0, max: 100_000, coerce: true })),
  limit: v.optional(v.integer({ min: 1, max: 200, coerce: true })),
});

const mediaQuery = v.object({
  before: v.optional(v.isoInstant()),
  limit: v.optional(v.integer({ min: 1, max: 200, coerce: true })),
});

const canUploadMedia = access.staff('banners.manage', 'promotions.manage', 'games.manage');

export const adminContentRoutes: Route[] = [
  // banners
  {
    method: 'GET',
    path: '/v1/admin/banners',
    access: access.staff('banners.manage'),
    async handler(ctx) {
      const q = readQuery(ctx, bannersQuery);
      return ok({ items: await listBanners(ctx.db, q.placement) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/banners',
    access: access.staff('banners.manage'),
    async handler(ctx) {
      return created({ banner: await saveBanner(ctx, null, bannerInput(await ctx.json(bannerSchema))) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/banners/:id',
    access: access.staff('banners.manage'),
    async handler(ctx) {
      const banner = await getBanner(ctx.db, numericId(ctx));
      if (!banner) throw new AppError('not_found');
      return ok({ banner });
    },
  },
  {
    method: 'PUT',
    path: '/v1/admin/banners/:id',
    access: access.staff('banners.manage'),
    async handler(ctx) {
      return ok({ banner: await saveBanner(ctx, numericId(ctx), bannerInput(await ctx.json(bannerSchema))) });
    },
  },
  {
    method: 'DELETE',
    path: '/v1/admin/banners/:id',
    access: access.staff('banners.manage'),
    async handler(ctx) {
      await deleteBanner(ctx, numericId(ctx));
      return noContent();
    },
  },

  // promotions
  {
    method: 'GET',
    path: '/v1/admin/promotions',
    access: access.staff('promotions.manage'),
    async handler(ctx) {
      return ok({ items: await listPromotions(ctx.db) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/promotions',
    access: access.staff('promotions.manage'),
    async handler(ctx) {
      return created({ promotion: await savePromotion(ctx, null, promotionInput(await ctx.json(promotionSchema))) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/promotions/:id',
    access: access.staff('promotions.manage'),
    async handler(ctx) {
      const promotion = await getPromotion(ctx.db, numericId(ctx));
      if (!promotion) throw new AppError('not_found');
      return ok({ promotion });
    },
  },
  {
    method: 'PUT',
    path: '/v1/admin/promotions/:id',
    access: access.staff('promotions.manage'),
    async handler(ctx) {
      return ok({ promotion: await savePromotion(ctx, numericId(ctx), promotionInput(await ctx.json(promotionSchema))) });
    },
  },
  {
    method: 'DELETE',
    path: '/v1/admin/promotions/:id',
    access: access.staff('promotions.manage'),
    async handler(ctx) {
      await deletePromotion(ctx, numericId(ctx));
      return noContent();
    },
  },

  // information pages
  {
    method: 'GET',
    path: '/v1/admin/pages',
    access: access.staff('pages.manage'),
    async handler(ctx) {
      return ok({ items: await listPages(ctx.db) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/pages/:slug',
    access: access.staff('pages.manage'),
    async handler(ctx) {
      const slug = ctx.params.slug ?? '';
      if (!(PAGE_SLUGS as readonly string[]).includes(slug)) throw new AppError('not_found');
      const page = await getPage(ctx.db, slug);
      if (!page) throw new AppError('not_found');
      return ok({ page });
    },
  },
  {
    method: 'PUT',
    path: '/v1/admin/pages/:slug',
    access: access.staff('pages.manage'),
    async handler(ctx) {
      const slug = ctx.params.slug ?? '';
      if (!(PAGE_SLUGS as readonly string[]).includes(slug)) throw new AppError('not_found');
      const body = await ctx.json(pageSchema);
      return ok({ page: await savePage(ctx, slug, body.translations as Record<string, PageTranslationInput>) });
    },
  },

  // games
  {
    method: 'GET',
    path: '/v1/admin/game-providers',
    access: access.staff('games.manage'),
    async handler(ctx) {
      return ok({ items: await listProviders(ctx.db) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/game-providers',
    access: access.staff('games.manage'),
    async handler(ctx) {
      return created({ provider: await saveProvider(ctx, null, await ctx.json(providerSchema)) });
    },
  },
  {
    method: 'PUT',
    path: '/v1/admin/game-providers/:id',
    access: access.staff('games.manage'),
    async handler(ctx) {
      return ok({ provider: await saveProvider(ctx, numericId(ctx), await ctx.json(providerSchema)) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/games',
    access: access.staff('games.manage'),
    async handler(ctx) {
      const q = readQuery(ctx, adminGamesQuery);
      return ok(await listGames(ctx.db, { category: q.category, provider: q.provider, search: q.q, sort: q.sort, offset: q.offset, limit: q.limit, activeOnly: false, includeDemo: true }));
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/games',
    access: access.staff('games.manage'),
    async handler(ctx) {
      return created({ game: await saveGame(ctx, null, gameInput(await ctx.json(gameSchema))) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/games/:id',
    access: access.staff('games.manage'),
    async handler(ctx) {
      const game = await getGameById(ctx.db, numericId(ctx));
      if (!game) throw new AppError('not_found');
      return ok({ game });
    },
  },
  {
    method: 'PUT',
    path: '/v1/admin/games/:id',
    access: access.staff('games.manage'),
    async handler(ctx) {
      return ok({ game: await saveGame(ctx, numericId(ctx), gameInput(await ctx.json(gameSchema))) });
    },
  },

  // images
  {
    method: 'GET',
    path: '/v1/admin/media',
    access: canUploadMedia,
    async handler(ctx) {
      const q = readQuery(ctx, mediaQuery);
      return ok({ items: await listMedia(ctx.db, { ...(q.before ? { beforeCreatedAt: q.before } : {}), ...(q.limit ? { limit: q.limit } : {}) }) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/media',
    access: canUploadMedia,
    limit: { name: 'media-upload', max: 60, windowMs: 60 * 60_000 },
    async handler(ctx) {
      const result = await saveUpload(ctx, await ctx.formData());
      return result.duplicate ? ok({ media: result.media, duplicate: true }) : created({ media: result.media, duplicate: false });
    },
  },
];

function promotionInput(body: { slug: string; sortOrder: number; isActive: boolean; startsAt?: string | undefined; endsAt?: string | undefined; translations: Record<string, { title: string; summary: string; body: string; terms: string; imageId?: string | undefined }> }): PromotionInput {
  const translations: PromotionInput['translations'] = {};
  for (const [locale, t] of Object.entries(body.translations)) translations[locale] = { ...t, imageId: t.imageId ?? null };
  return { ...body, startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null, translations };
}

function gameInput(body: { slug: string; name: string; providerId: string; category: (typeof GAME_CATEGORIES)[number]; isFeatured: boolean; isNew: boolean; isActive: boolean; sortOrder: number; thumbnailId?: string | undefined; externalId?: string | undefined }) {
  return { ...body, thumbnailId: body.thumbnailId ?? null, externalId: body.externalId ? body.externalId : null };
}
