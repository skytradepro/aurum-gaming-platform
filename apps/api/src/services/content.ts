/**
 * Site content managed from the dashboards: banners, promotions and information pages.
 * Every visitor-facing text exists once per language. A visitor in a language without a
 * translation sees the default language instead (field by field), never an empty banner.
 */
import type { Queryable } from '@aurum/db';
import { AppError } from '@aurum/shared';
import type { BannerPlacement } from '@aurum/shared';
import { slugConflict } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import { assertMediaExist, getMediaMap } from './media.ts';
import type { MediaDTO } from './media.ts';

export async function defaultLocale(q: Queryable): Promise<string> {
  const { rows } = await q.query<{ code: string }>('select code from languages where is_default limit 1');
  return rows[0]?.code ?? 'en';
}

/** Languages a visitor may pick (enabled in the Super Admin settings). */
export async function enabledLocales(q: Queryable): Promise<string[]> {
  const { rows } = await q.query<{ code: string }>('select code from languages where is_enabled order by sort_order, code');
  return rows.map((r) => r.code);
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------
export interface BannerTranslationInput {
  title: string;
  subtitle: string;
  ctaLabel: string;
  linkUrl: string;
  altText: string;
  imageDesktopId: string | null;
  imageMobileId: string | null;
}

export interface BannerInput {
  placement: BannerPlacement;
  name: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  translations: Record<string, BannerTranslationInput>;
}

export interface BannerTranslationDTO {
  title: string;
  subtitle: string;
  ctaLabel: string;
  linkUrl: string;
  altText: string;
  imageDesktop: MediaDTO | null;
  imageMobile: MediaDTO | null;
}

export interface BannerDTO {
  id: string;
  placement: BannerPlacement;
  name: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  translations: Record<string, BannerTranslationDTO>;
  createdAt: string;
  updatedAt: string;
}

interface BannerRow {
  id: string;
  placement: BannerPlacement;
  name: string;
  sort_order: number;
  is_active: boolean;
  starts_at: Date | null;
  ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface BannerTranslationRow {
  banner_id: string;
  locale: string;
  title: string;
  subtitle: string;
  cta_label: string;
  link_url: string;
  alt_text: string;
  image_desktop_id: string | null;
  image_mobile_id: string | null;
}

const BANNER_COLUMNS = 'id::text, placement, name, sort_order, is_active, starts_at, ends_at, created_at, updated_at';
const BANNER_T_COLUMNS = 'banner_id::text, locale, title, subtitle, cta_label, link_url, alt_text, image_desktop_id::text, image_mobile_id::text';

async function loadBannerTranslations(q: Queryable, bannerIds: string[], locales?: readonly string[]): Promise<{ rows: BannerTranslationRow[]; media: Map<string, MediaDTO> }> {
  if (bannerIds.length === 0) return { rows: [], media: new Map() };
  const { rows } = await q.query<BannerTranslationRow>(
    `select ${BANNER_T_COLUMNS} from banner_translations
      where banner_id = any($1::bigint[]) and ($2::text[] is null or locale = any($2::text[]))`,
    [bannerIds, locales ? [...locales] : null],
  );
  const media = await getMediaMap(q, rows.flatMap((r) => [r.image_desktop_id, r.image_mobile_id]));
  return { rows, media };
}

function toBannerDTO(row: BannerRow, translations: BannerTranslationRow[], media: Map<string, MediaDTO>): BannerDTO {
  const out: Record<string, BannerTranslationDTO> = {};
  for (const t of translations) {
    out[t.locale] = {
      title: t.title,
      subtitle: t.subtitle,
      ctaLabel: t.cta_label,
      linkUrl: t.link_url,
      altText: t.alt_text,
      imageDesktop: t.image_desktop_id ? media.get(t.image_desktop_id) ?? null : null,
      imageMobile: t.image_mobile_id ? media.get(t.image_mobile_id) ?? null : null,
    };
  }
  return {
    id: row.id,
    placement: row.placement,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    translations: out,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listBanners(q: Queryable, placement?: BannerPlacement): Promise<BannerDTO[]> {
  const { rows } = await q.query<BannerRow>(
    `select ${BANNER_COLUMNS} from banners where ($1::text is null or placement = $1) order by placement, sort_order, id`,
    [placement ?? null],
  );
  const { rows: ts, media } = await loadBannerTranslations(q, rows.map((r) => r.id));
  return rows.map((r) => toBannerDTO(r, ts.filter((t) => t.banner_id === r.id), media));
}

export async function getBanner(q: Queryable, id: string): Promise<BannerDTO | null> {
  const { rows } = await q.query<BannerRow>(`select ${BANNER_COLUMNS} from banners where id = $1::bigint`, [id]);
  const row = rows[0];
  if (!row) return null;
  const { rows: ts, media } = await loadBannerTranslations(q, [row.id]);
  return toBannerDTO(row, ts, media);
}

async function assertKnownLocales(q: Queryable, locales: string[], prefix: string): Promise<void> {
  if (locales.length === 0) return;
  const { rows } = await q.query<{ code: string }>('select code from languages where code = any($1::text[])', [locales]);
  const known = new Set(rows.map((r) => r.code));
  for (const locale of locales) {
    if (!known.has(locale)) throw new AppError('validation', { fields: { [`${prefix}.${locale}`]: 'invalidChoice' } });
  }
}

/** Creates (id = null) or replaces a banner together with all its translations. */
export async function saveBanner(ctx: Ctx, id: string | null, input: BannerInput): Promise<BannerDTO> {
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new AppError('validation', { fields: { endsAt: 'invalidPeriod' } });
  }
  const locales = Object.keys(input.translations);
  if (!locales.some((l) => input.translations[l]?.imageDesktopId)) {
    throw new AppError('validation', { fields: { translations: 'imageRequired' } });
  }
  return ctx.db.transaction(async (tx) => {
    await assertKnownLocales(tx, locales, 'translations');
    const refs: Record<string, string | null> = {};
    for (const locale of locales) {
      const t = input.translations[locale] as BannerTranslationInput;
      refs[`translations.${locale}.imageDesktopId`] = t.imageDesktopId;
      refs[`translations.${locale}.imageMobileId`] = t.imageMobileId;
    }
    await assertMediaExist(tx, refs);

    let bannerId: string;
    if (id === null) {
      const { rows } = await tx.query<{ id: string }>(
        `insert into banners (placement, name, sort_order, is_active, starts_at, ends_at, created_by)
         values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::uuid) returning id::text`,
        [input.placement, input.name, input.sortOrder, input.isActive, input.startsAt, input.endsAt, ctx.principal().id],
      );
      bannerId = (rows[0] as { id: string }).id;
    } else {
      const { rows } = await tx.query<{ id: string }>(
        `update banners set placement = $2, name = $3, sort_order = $4, is_active = $5,
                starts_at = $6::timestamptz, ends_at = $7::timestamptz
          where id = $1::bigint returning id::text`,
        [id, input.placement, input.name, input.sortOrder, input.isActive, input.startsAt, input.endsAt],
      );
      if (!rows[0]) throw new AppError('not_found');
      bannerId = id;
    }

    await tx.query('delete from banner_translations where banner_id = $1::bigint and not (locale = any($2::text[]))', [bannerId, locales]);
    for (const locale of locales) {
      const t = input.translations[locale] as BannerTranslationInput;
      await tx.query(
        `insert into banner_translations (banner_id, locale, title, subtitle, cta_label, link_url, alt_text, image_desktop_id, image_mobile_id)
         values ($1::bigint, $2, $3, $4, $5, $6, $7, $8::uuid, $9::uuid)
         on conflict (banner_id, locale) do update
            set title = excluded.title, subtitle = excluded.subtitle, cta_label = excluded.cta_label,
                link_url = excluded.link_url, alt_text = excluded.alt_text,
                image_desktop_id = excluded.image_desktop_id, image_mobile_id = excluded.image_mobile_id`,
        [bannerId, locale, t.title, t.subtitle, t.ctaLabel, t.linkUrl, t.altText, t.imageDesktopId, t.imageMobileId],
      );
    }
    await audit(tx, auditActor(ctx), {
      action: id === null ? 'banner.created' : 'banner.updated',
      targetType: 'banner',
      targetId: bannerId,
      details: { placement: input.placement, name: input.name, isActive: input.isActive, locales },
    });
    const saved = await getBanner(tx, bannerId);
    if (!saved) throw new AppError('internal_error', { message: 'saved banner could not be read back' });
    return saved;
  });
}

export async function deleteBanner(ctx: Ctx, id: string): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ name: string; placement: string }>('delete from banners where id = $1::bigint returning name, placement', [id]);
    if (!rows[0]) throw new AppError('not_found');
    await audit(tx, auditActor(ctx), { action: 'banner.deleted', targetType: 'banner', targetId: id, details: rows[0] });
  });
}

export interface PublicBannerDTO {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  linkUrl: string;
  alt: string;
  imageDesktop: MediaDTO;
  imageMobile: MediaDTO | null;
}

/** The banners a visitor sees right now, in their language (default language fills any gap). */
export async function publicBanners(q: Queryable, placement: BannerPlacement, locale: string, now: Date): Promise<PublicBannerDTO[]> {
  const fallback = await defaultLocale(q);
  const { rows } = await q.query<BannerRow>(
    `select ${BANNER_COLUMNS} from banners
      where placement = $1 and is_active
        and (starts_at is null or starts_at <= $2::timestamptz)
        and (ends_at is null or ends_at > $2::timestamptz)
      order by sort_order, id`,
    [placement, now.toISOString()],
  );
  const { rows: ts, media } = await loadBannerTranslations(q, rows.map((r) => r.id), [locale, fallback]);
  const out: PublicBannerDTO[] = [];
  for (const banner of rows) {
    const own = ts.find((t) => t.banner_id === banner.id && t.locale === locale);
    const base = ts.find((t) => t.banner_id === banner.id && t.locale === fallback);
    const pick = <K extends keyof BannerTranslationRow>(key: K): BannerTranslationRow[K] | undefined => {
      const value = own?.[key];
      return value !== undefined && value !== '' && value !== null ? value : base?.[key];
    };
    const desktopId = pick('image_desktop_id');
    const desktop = desktopId ? media.get(desktopId) : undefined;
    if (!desktop) continue; // a banner without an image is never shown
    const mobileId = pick('image_mobile_id');
    out.push({
      id: banner.id,
      title: pick('title') ?? '',
      subtitle: pick('subtitle') ?? '',
      ctaLabel: pick('cta_label') ?? '',
      linkUrl: pick('link_url') ?? '',
      alt: pick('alt_text') ?? pick('title') ?? '',
      imageDesktop: desktop,
      imageMobile: mobileId ? media.get(mobileId) ?? null : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------
export interface PromotionTranslationInput {
  title: string;
  summary: string;
  body: string;
  terms: string;
  imageId: string | null;
}

export interface PromotionInput {
  slug: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  translations: Record<string, PromotionTranslationInput>;
}

export interface PromotionTranslationDTO {
  title: string;
  summary: string;
  body: string;
  terms: string;
  image: MediaDTO | null;
}

export interface PromotionDTO {
  id: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  translations: Record<string, PromotionTranslationDTO>;
  createdAt: string;
  updatedAt: string;
}

interface PromotionRow {
  id: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  starts_at: Date | null;
  ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface PromotionTranslationRow {
  promotion_id: string;
  locale: string;
  title: string;
  summary: string;
  body: string;
  terms: string;
  image_id: string | null;
}

const PROMO_COLUMNS = 'id::text, slug, sort_order, is_active, starts_at, ends_at, created_at, updated_at';
const PROMO_T_COLUMNS = 'promotion_id::text, locale, title, summary, body, terms, image_id::text';

async function loadPromotionTranslations(q: Queryable, ids: string[], locales?: readonly string[]) {
  if (ids.length === 0) return { rows: [] as PromotionTranslationRow[], media: new Map<string, MediaDTO>() };
  const { rows } = await q.query<PromotionTranslationRow>(
    `select ${PROMO_T_COLUMNS} from promotion_translations
      where promotion_id = any($1::bigint[]) and ($2::text[] is null or locale = any($2::text[]))`,
    [ids, locales ? [...locales] : null],
  );
  const media = await getMediaMap(q, rows.map((r) => r.image_id));
  return { rows, media };
}

function toPromotionDTO(row: PromotionRow, translations: PromotionTranslationRow[], media: Map<string, MediaDTO>): PromotionDTO {
  const out: Record<string, PromotionTranslationDTO> = {};
  for (const t of translations) {
    out[t.locale] = { title: t.title, summary: t.summary, body: t.body, terms: t.terms, image: t.image_id ? media.get(t.image_id) ?? null : null };
  }
  return {
    id: row.id,
    slug: row.slug,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    translations: out,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listPromotions(q: Queryable): Promise<PromotionDTO[]> {
  const { rows } = await q.query<PromotionRow>(`select ${PROMO_COLUMNS} from promotions order by sort_order, id`);
  const { rows: ts, media } = await loadPromotionTranslations(q, rows.map((r) => r.id));
  return rows.map((r) => toPromotionDTO(r, ts.filter((t) => t.promotion_id === r.id), media));
}

export async function getPromotion(q: Queryable, id: string): Promise<PromotionDTO | null> {
  const { rows } = await q.query<PromotionRow>(`select ${PROMO_COLUMNS} from promotions where id = $1::bigint`, [id]);
  const row = rows[0];
  if (!row) return null;
  const { rows: ts, media } = await loadPromotionTranslations(q, [row.id]);
  return toPromotionDTO(row, ts, media);
}

export async function savePromotion(ctx: Ctx, id: string | null, input: PromotionInput): Promise<PromotionDTO> {
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new AppError('validation', { fields: { endsAt: 'invalidPeriod' } });
  }
  const locales = Object.keys(input.translations);
  if (locales.length === 0) throw new AppError('validation', { fields: { translations: 'required' } });
  return savePromotionTx(ctx, id, input, locales).catch((error: unknown) => {
    throw slugConflict(error);
  });
}

function savePromotionTx(ctx: Ctx, id: string | null, input: PromotionInput, locales: string[]): Promise<PromotionDTO> {
  return ctx.db.transaction(async (tx) => {
    await assertKnownLocales(tx, locales, 'translations');
    const refs: Record<string, string | null> = {};
    for (const locale of locales) refs[`translations.${locale}.imageId`] = (input.translations[locale] as PromotionTranslationInput).imageId;
    await assertMediaExist(tx, refs);

    let promotionId: string;
    if (id === null) {
      const { rows } = await tx.query<{ id: string }>(
        `insert into promotions (slug, sort_order, is_active, starts_at, ends_at, created_by)
         values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::uuid) returning id::text`,
        [input.slug, input.sortOrder, input.isActive, input.startsAt, input.endsAt, ctx.principal().id],
      );
      promotionId = (rows[0] as { id: string }).id;
    } else {
      const { rows } = await tx.query<{ id: string }>(
        `update promotions set slug = $2, sort_order = $3, is_active = $4, starts_at = $5::timestamptz, ends_at = $6::timestamptz
          where id = $1::bigint returning id::text`,
        [id, input.slug, input.sortOrder, input.isActive, input.startsAt, input.endsAt],
      );
      if (!rows[0]) throw new AppError('not_found');
      promotionId = id;
    }
    await tx.query('delete from promotion_translations where promotion_id = $1::bigint and not (locale = any($2::text[]))', [promotionId, locales]);
    for (const locale of locales) {
      const t = input.translations[locale] as PromotionTranslationInput;
      await tx.query(
        `insert into promotion_translations (promotion_id, locale, title, summary, body, terms, image_id)
         values ($1::bigint, $2, $3, $4, $5, $6, $7::uuid)
         on conflict (promotion_id, locale) do update
            set title = excluded.title, summary = excluded.summary, body = excluded.body,
                terms = excluded.terms, image_id = excluded.image_id`,
        [promotionId, locale, t.title, t.summary, t.body, t.terms, t.imageId],
      );
    }
    await audit(tx, auditActor(ctx), {
      action: id === null ? 'promotion.created' : 'promotion.updated',
      targetType: 'promotion',
      targetId: promotionId,
      details: { slug: input.slug, isActive: input.isActive, locales },
    });
    const saved = await getPromotion(tx, promotionId);
    if (!saved) throw new AppError('internal_error', { message: 'saved promotion could not be read back' });
    return saved;
  });
}

export async function deletePromotion(ctx: Ctx, id: string): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ slug: string }>('delete from promotions where id = $1::bigint returning slug', [id]);
    if (!rows[0]) throw new AppError('not_found');
    await audit(tx, auditActor(ctx), { action: 'promotion.deleted', targetType: 'promotion', targetId: id, details: rows[0] });
  });
}

export interface PublicPromotionDTO {
  slug: string;
  title: string;
  summary: string;
  image: MediaDTO | null;
  startsAt: string | null;
  endsAt: string | null;
  body?: string;
  terms?: string;
}

export async function publicPromotions(q: Queryable, locale: string, now: Date, slug?: string): Promise<PublicPromotionDTO[]> {
  const fallback = await defaultLocale(q);
  const { rows } = await q.query<PromotionRow>(
    `select ${PROMO_COLUMNS} from promotions
      where is_active and (starts_at is null or starts_at <= $1::timestamptz) and (ends_at is null or ends_at > $1::timestamptz)
        and ($2::text is null or slug = $2)
      order by sort_order, id`,
    [now.toISOString(), slug ?? null],
  );
  const { rows: ts, media } = await loadPromotionTranslations(q, rows.map((r) => r.id), [locale, fallback]);
  const out: PublicPromotionDTO[] = [];
  for (const promotion of rows) {
    const own = ts.find((t) => t.promotion_id === promotion.id && t.locale === locale);
    const base = ts.find((t) => t.promotion_id === promotion.id && t.locale === fallback);
    const pick = <K extends keyof PromotionTranslationRow>(key: K): PromotionTranslationRow[K] | undefined => {
      const value = own?.[key];
      return value !== undefined && value !== '' && value !== null ? value : base?.[key];
    };
    const title = pick('title');
    if (!title) continue;
    const imageId = pick('image_id');
    out.push({
      slug: promotion.slug,
      title,
      summary: pick('summary') ?? '',
      image: imageId ? media.get(imageId) ?? null : null,
      startsAt: iso(promotion.starts_at),
      endsAt: iso(promotion.ends_at),
      ...(slug ? { body: pick('body') ?? '', terms: pick('terms') ?? '' } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Information pages (about us, terms, responsible gaming, ...)
// Plain text only: paragraphs are separated by blank lines. Nothing is rendered as HTML.
// ---------------------------------------------------------------------------
export interface PageTranslationInput {
  title: string;
  body: string;
  isPublished: boolean;
}

export interface PageTranslationDTO extends PageTranslationInput {
  updatedAt: string;
}

export interface PageDTO {
  slug: string;
  translations: Record<string, PageTranslationDTO>;
}

interface PageTranslationRow {
  page_slug: string;
  locale: string;
  title: string;
  body: string;
  is_published: boolean;
  updated_at: Date;
}

export async function listPages(q: Queryable): Promise<PageDTO[]> {
  const pages = await q.query<{ slug: string }>('select slug from pages order by slug');
  const ts = await q.query<PageTranslationRow>('select page_slug, locale, title, body, is_published, updated_at from page_translations');
  return pages.rows.map((p) => ({
    slug: p.slug,
    translations: Object.fromEntries(
      ts.rows.filter((t) => t.page_slug === p.slug).map((t) => [t.locale, { title: t.title, body: t.body, isPublished: t.is_published, updatedAt: t.updated_at.toISOString() }]),
    ),
  }));
}

export async function getPage(q: Queryable, slug: string): Promise<PageDTO | null> {
  const all = await listPages(q);
  return all.find((p) => p.slug === slug) ?? null;
}

export async function savePage(ctx: Ctx, slug: string, translations: Record<string, PageTranslationInput>): Promise<PageDTO> {
  const locales = Object.keys(translations);
  return ctx.db.transaction(async (tx) => {
    const exists = await tx.query('select 1 from pages where slug = $1', [slug]);
    if (exists.rowCount === 0) throw new AppError('not_found');
    await assertKnownLocales(tx, locales, 'translations');
    await tx.query('delete from page_translations where page_slug = $1 and not (locale = any($2::text[]))', [slug, locales]);
    for (const locale of locales) {
      const t = translations[locale] as PageTranslationInput;
      await tx.query(
        `insert into page_translations (page_slug, locale, title, body, is_published, updated_by)
         values ($1, $2, $3, $4, $5, $6::uuid)
         on conflict (page_slug, locale) do update
            set title = excluded.title, body = excluded.body, is_published = excluded.is_published, updated_by = excluded.updated_by`,
        [slug, locale, t.title, t.body, t.isPublished, ctx.principal().id],
      );
    }
    await audit(tx, auditActor(ctx), {
      action: 'page.saved',
      targetType: 'page',
      targetId: slug,
      details: { locales, published: locales.filter((l) => translations[l]?.isPublished) },
    });
    const saved = await getPage(tx, slug);
    if (!saved) throw new AppError('internal_error', { message: 'saved page could not be read back' });
    return saved;
  });
}

export interface PublicPageDTO {
  slug: string;
  published: boolean;
  locale: string | null;
  title: string | null;
  body: string | null;
}

/** Published text in the visitor's language, else the default language; otherwise `published: false`. */
export async function publicPage(q: Queryable, slug: string, locale: string): Promise<PublicPageDTO | null> {
  const known = await q.query('select 1 from pages where slug = $1', [slug]);
  if (known.rowCount === 0) return null;
  const fallback = await defaultLocale(q);
  const { rows } = await q.query<PageTranslationRow>(
    `select page_slug, locale, title, body, is_published, updated_at from page_translations
      where page_slug = $1 and is_published and locale = any($2::text[])`,
    [slug, [locale, fallback]],
  );
  const chosen = rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === fallback);
  if (!chosen) return { slug, published: false, locale: null, title: null, body: null };
  return { slug, published: true, locale: chosen.locale, title: chosen.title, body: chosen.body };
}
