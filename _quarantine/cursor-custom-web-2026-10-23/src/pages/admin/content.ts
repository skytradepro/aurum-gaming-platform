/** Content managed from the dashboard: banners, promotions, information pages and the image library. */
import { ApiError } from '../../api.ts';
import { date, href, redirect } from '../../context.ts';
import type { PageCtx, PageResult } from '../../context.ts';
import { html } from '../../html.ts';
import type { SafeHtml } from '../../html.ts';
import { LOCALES, LOCALE_META } from '../../i18n.ts';
import {
  alert,
  badge,
  button,
  card,
  checkbox,
  csrfField,
  emptyForm,
  field,
  formError,
  formFromError,
  linkButton,
  pageHeader,
  select,
  table,
  textarea,
} from '../../layout/components.ts';
import type { FormState } from '../../layout/components.ts';
import { clearPublicCache } from '../../public-data.ts';
import type { BannerDTO, MediaDTO, PageDTO, PromotionDTO } from '../../types.ts';
import { adminPage, dayStart, guard, ID_RE, isResult } from './common.ts';

const PLACEMENTS = ['home_hero', 'casino_hero', 'live_casino_hero', 'sports_hero'] as const;

async function mediaList(ctx: PageCtx): Promise<MediaDTO[]> {
  return (await ctx.api.get<{ items: MediaDTO[] }>('/v1/admin/media', { limit: 200 })).items;
}

/** Uploads the file of a form field (when one was chosen) and returns its media id. */
async function uploadIfAny(ctx: PageCtx, name: string): Promise<string | null> {
  const file = ctx.files.get(name);
  if (!file) return null;
  const form = new FormData();
  form.set('file', file, file.name);
  const result = await ctx.api.upload<{ media: MediaDTO }>('/v1/admin/media', form);
  return result.media.id;
}

function imagePicker(ctx: PageCtx, o: { label: string; name: string; value: string | undefined; media: readonly MediaDTO[]; error?: string | undefined; hint?: string }): SafeHtml {
  const current = o.media.find((m) => m.id === o.value);
  return html`<div class="field image-picker${o.error ? ' has-error' : ''}">
<label>${o.label}</label>
${current ? html`<img class="thumb" src="${current.url}" alt="" width="160" height="${Math.round((160 * current.height) / current.width)}">` : ''}
<select name="${o.name}"><option value="">${ctx.t('admin.content.noImage')}</option>${o.media.map((m) => html`<option value="${m.id}"${m.id === o.value ? html` selected` : ''}>${m.originalName ?? m.id} (${m.width}×${m.height})</option>`)}</select>
<input type="file" name="${o.name}_file" accept="image/png,image/jpeg,image/webp" aria-label="${ctx.t('admin.content.uploadNew')}">
<p class="hint">${o.hint ?? ctx.t('admin.content.imageHint')}</p>
${o.error ? html`<p class="field-error">${o.error}</p>` : ''}
</div>`;
}

const toDay = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

function scheduleFields(ctx: PageCtx, state: FormState): SafeHtml {
  return html`${field({ label: ctx.t('admin.content.startsAt'), name: 'startsAt', type: 'date', value: state.values.startsAt, error: state.errors.startsAt })}
${field({ label: ctx.t('admin.content.endsAt'), name: 'endsAt', type: 'date', value: state.values.endsAt, error: state.errors.endsAt || state.errors.$, hint: ctx.t('admin.content.scheduleHint') })}`;
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------
export async function bannersPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'banners.manage');
  if (isResult(me)) return me;
  const { items } = await ctx.api.get<{ items: BannerDTO[] }>('/v1/admin/banners');
  const body = html`${pageHeader(ctx.t('admin.nav.banners'), { subtitle: ctx.t('admin.banners.subtitle'), actions: linkButton(ctx.t('admin.banners.new'), href(ctx, '/admin/banners/new'), { iconName: 'plus' }) })}
${PLACEMENTS.map((p) => {
    const list = items.filter((b) => b.placement === p);
    return card(
      table<BannerDTO>(
        [
          { label: ctx.t('admin.content.image'), cell: (b) => { const img = b.translations[ctx.locale]?.imageDesktop ?? Object.values(b.translations).find((tr) => tr.imageDesktop)?.imageDesktop; return img ? html`<img class="thumb-sm" src="${img.url}" alt="" width="96" height="${Math.round((96 * img.height) / img.width)}">` : '—'; } },
          { label: ctx.t('admin.content.name'), cell: (b) => html`<a href="${href(ctx, `/admin/banners/${b.id}`)}">${b.name}</a>` },
          { label: ctx.t('admin.content.languages'), cell: (b) => Object.keys(b.translations).join(', ') },
          { label: ctx.t('admin.content.order'), cell: (b) => String(b.sortOrder), className: 'num' },
          { label: ctx.t('admin.content.period'), cell: (b) => html`${b.startsAt ? date(ctx, b.startsAt, false) : '…'} → ${b.endsAt ? date(ctx, b.endsAt, false) : '…'}` },
          { label: ctx.t('common.status'), cell: (b) => (b.isActive ? badge(ctx.t('common.active'), 'green') : badge(ctx.t('common.inactive'), 'grey')) },
        ],
        list,
        ctx.t('admin.banners.none'),
      ),
      { title: ctx.t(`admin.banners.placements.${p}`) },
    );
  })}`;
  return adminPage(ctx, ctx.t('admin.nav.banners'), body);
}

function bannerValues(b: BannerDTO | null): Record<string, string> {
  const v: Record<string, string> = b
    ? { name: b.name, placement: b.placement, sortOrder: String(b.sortOrder), isActive: b.isActive ? 'on' : '', startsAt: toDay(b.startsAt), endsAt: toDay(b.endsAt) }
    : { placement: 'home_hero', sortOrder: '0', isActive: 'on' };
  for (const l of LOCALES) {
    const tr = b?.translations[l];
    v[`${l}.title`] = tr?.title ?? '';
    v[`${l}.subtitle`] = tr?.subtitle ?? '';
    v[`${l}.ctaLabel`] = tr?.ctaLabel ?? '';
    v[`${l}.linkUrl`] = tr?.linkUrl ?? '';
    v[`${l}.altText`] = tr?.altText ?? '';
    v[`${l}.imageDesktopId`] = tr?.imageDesktop?.id ?? '';
    v[`${l}.imageMobileId`] = tr?.imageMobile?.id ?? '';
  }
  return v;
}

function bannerForm(ctx: PageCtx, state: FormState, media: readonly MediaDTO[], id: string | null): SafeHtml {
  const v = state.values;
  const e = state.errors;
  return html`<form method="post" action="${href(ctx, id ? `/admin/banners/${id}` : '/admin/banners/new')}" class="form" enctype="multipart/form-data">
${csrfField(ctx)}${formError(state)}${e.translations ? alert('error', e.translations) : ''}
<div class="form-grid">
${field({ label: ctx.t('admin.content.name'), name: 'name', value: v.name, error: e.name, required: true, maxlength: 120, hint: ctx.t('admin.content.nameHint') })}
${select({ label: ctx.t('admin.banners.placement'), name: 'placement', value: v.placement, options: PLACEMENTS.map((p) => ({ value: p, label: ctx.t(`admin.banners.placements.${p}`) })) })}
${field({ label: ctx.t('admin.content.order'), name: 'sortOrder', type: 'number', value: v.sortOrder, error: e.sortOrder })}
${scheduleFields(ctx, state)}
</div>
${checkbox({ name: 'isActive', label: ctx.t('admin.content.active'), checked: v.isActive === 'on' })}
<div class="locale-tabs">${LOCALES.map(
    (l) => html`<fieldset class="locale-block" lang="${l}" dir="${LOCALE_META[l].direction}"><legend>${LOCALE_META[l].nativeName}</legend>
<div class="form-grid">
${field({ label: ctx.t('admin.content.title'), name: `${l}.title`, value: v[`${l}.title`], error: e[`translations.${l}.title`], maxlength: 120 })}
${field({ label: ctx.t('admin.content.subtitle'), name: `${l}.subtitle`, value: v[`${l}.subtitle`], error: e[`translations.${l}.subtitle`], maxlength: 240 })}
${field({ label: ctx.t('admin.banners.cta'), name: `${l}.ctaLabel`, value: v[`${l}.ctaLabel`], error: e[`translations.${l}.ctaLabel`], maxlength: 40 })}
${field({ label: ctx.t('admin.banners.link'), name: `${l}.linkUrl`, value: v[`${l}.linkUrl`], error: e[`translations.${l}.linkUrl`], dir: 'ltr', placeholder: '/en/casino', hint: ctx.t('validation.invalidUrl') })}
${field({ label: ctx.t('admin.content.altText'), name: `${l}.altText`, value: v[`${l}.altText`], maxlength: 200 })}
</div>
<div class="form-grid">
${imagePicker(ctx, { label: ctx.t('admin.banners.imageDesktop'), name: `${l}.imageDesktopId`, value: v[`${l}.imageDesktopId`], media, error: e[`translations.${l}.imageDesktopId`], hint: ctx.t('admin.banners.desktopHint') })}
${imagePicker(ctx, { label: ctx.t('admin.banners.imageMobile'), name: `${l}.imageMobileId`, value: v[`${l}.imageMobileId`], media, error: e[`translations.${l}.imageMobileId`], hint: ctx.t('admin.banners.mobileHint') })}
</div>
</fieldset>`,
  )}</div>
<p class="small muted">${ctx.t('admin.banners.fallbackNote')}</p>
<div class="form-actions">${button(ctx.t('common.save'))}</div>
</form>
${id ? html`<form method="post" action="${href(ctx, `/admin/banners/${id}/delete`)}" class="danger-zone">${csrfField(ctx)}${button(ctx.t('common.delete'), { kind: 'danger', confirm: ctx.t('admin.content.deleteConfirm') })}</form>` : ''}`;
}

async function readTranslationsWithUploads(ctx: PageCtx, fields: string[], imageFields: string[]): Promise<{ values: Record<string, string>; translations: Record<string, Record<string, string | null>> }> {
  const values: Record<string, string> = {};
  for (const [k, val] of ctx.form) if (k !== '_csrf') values[k] = val.trim();
  const translations: Record<string, Record<string, string | null>> = {};
  for (const l of LOCALES) {
    const t: Record<string, string | null> = {};
    for (const f of fields) t[f] = values[`${l}.${f}`] ?? '';
    for (const f of imageFields) {
      const uploaded = await uploadIfAny(ctx, `${l}.${f}_file`);
      if (uploaded) values[`${l}.${f}`] = uploaded;
      t[f] = values[`${l}.${f}`] || null;
    }
    translations[l] = t;
  }
  return { values, translations };
}

async function saveBanner(ctx: PageCtx, id: string | null): Promise<PageResult> {
  const me = guard(ctx, 'banners.manage');
  if (isResult(me)) return me;
  let values: Record<string, string> = {};
  try {
    const read = await readTranslationsWithUploads(ctx, ['title', 'subtitle', 'ctaLabel', 'linkUrl', 'altText'], ['imageDesktopId', 'imageMobileId']);
    values = read.values;
    // a language is sent when it has an image or any text
    const translations = Object.fromEntries(Object.entries(read.translations).filter(([, t]) => Object.values(t).some((x) => x)));
    const body = {
      placement: values.placement,
      name: values.name,
      sortOrder: Number(values.sortOrder || '0'),
      isActive: values.isActive === 'on',
      ...(dayStart(values.startsAt) ? { startsAt: dayStart(values.startsAt) } : {}),
      ...(dayStart(values.endsAt, 1) ? { endsAt: dayStart(values.endsAt, 1) } : {}),
      translations,
    };
    const saved = id ? await ctx.api.put<{ banner: BannerDTO }>(`/v1/admin/banners/${id}`, body) : await ctx.api.post<{ banner: BannerDTO }>('/v1/admin/banners', body);
    clearPublicCache();
    return redirect(href(ctx, `/admin/banners/${saved.banner.id}`), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    const media = await mediaList(ctx);
    const state = formFromError(ctx, error, values);
    return adminPage(ctx, ctx.t('admin.nav.banners'), html`${pageHeader(ctx.t('admin.nav.banners'))}${card(bannerForm(ctx, state, media, id))}`, 422);
  }
}

export async function newBannerPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'banners.manage');
  if (isResult(me)) return me;
  const media = await mediaList(ctx);
  return adminPage(ctx, ctx.t('admin.banners.new'), html`${pageHeader(ctx.t('admin.banners.new'), { back: { href: href(ctx, '/admin/banners'), label: ctx.t('admin.nav.banners') } })}${card(bannerForm(ctx, emptyForm(bannerValues(null)), media, null))}`);
}

export const createBanner = (ctx: PageCtx) => saveBanner(ctx, null);

export async function bannerPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'banners.manage');
  if (isResult(me)) return me;
  if (!ID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'not_found' });
  const [{ banner }, media] = await Promise.all([ctx.api.get<{ banner: BannerDTO }>(`/v1/admin/banners/${params.id}`), mediaList(ctx)]);
  return adminPage(ctx, banner.name, html`${pageHeader(banner.name, { back: { href: href(ctx, '/admin/banners'), label: ctx.t('admin.nav.banners') } })}${card(bannerForm(ctx, emptyForm(bannerValues(banner)), media, banner.id))}`);
}

export async function updateBanner(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  if (!ID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'not_found' });
  return saveBanner(ctx, params.id as string);
}

export async function deleteBanner(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'banners.manage');
  if (isResult(me)) return me;
  if (!ID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'not_found' });
  await ctx.api.delete(`/v1/admin/banners/${params.id}`);
  clearPublicCache();
  return redirect(href(ctx, '/admin/banners'), { kind: 'success', key: 'admin.content.deleted' });
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------
export async function promotionsAdminPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'promotions.manage');
  if (isResult(me)) return me;
  const { items } = await ctx.api.get<{ items: PromotionDTO[] }>('/v1/admin/promotions');
  const body = html`${pageHeader(ctx.t('admin.nav.promotions'), { subtitle: ctx.t('admin.promotions.subtitle'), actions: linkButton(ctx.t('admin.promotions.new'), href(ctx, '/admin/promotions/new'), { iconName: 'plus' }) })}
${card(
  table<PromotionDTO>(
    [
      { label: ctx.t('admin.content.title'), cell: (p) => html`<a href="${href(ctx, `/admin/promotions/${p.id}`)}">${p.translations[ctx.locale]?.title ?? Object.values(p.translations)[0]?.title ?? p.slug}</a>` },
      { label: 'Slug', cell: (p) => html`<code>${p.slug}</code>` },
      { label: ctx.t('admin.content.languages'), cell: (p) => Object.keys(p.translations).join(', ') },
      { label: ctx.t('admin.content.period'), cell: (p) => html`${p.startsAt ? date(ctx, p.startsAt, false) : '…'} → ${p.endsAt ? date(ctx, p.endsAt, false) : '…'}` },
      { label: ctx.t('common.status'), cell: (p) => (p.isActive ? badge(ctx.t('common.active'), 'green') : badge(ctx.t('common.inactive'), 'grey')) },
    ],
    items,
    ctx.t('promotions.none'),
  ),
)}`;
  return adminPage(ctx, ctx.t('admin.nav.promotions'), body);
}

function promotionValues(p: PromotionDTO | null): Record<string, string> {
  const v: Record<string, string> = p
    ? { slug: p.slug, sortOrder: String(p.sortOrder), isActive: p.isActive ? 'on' : '', startsAt: toDay(p.startsAt), endsAt: toDay(p.endsAt) }
    : { sortOrder: '0', isActive: 'on' };
  for (const l of LOCALES) {
    const tr = p?.translations[l];
    v[`${l}.title`] = tr?.title ?? '';
    v[`${l}.summary`] = tr?.summary ?? '';
    v[`${l}.body`] = tr?.body ?? '';
    v[`${l}.terms`] = tr?.terms ?? '';
    v[`${l}.imageId`] = tr?.image?.id ?? '';
  }
  return v;
}

function promotionForm(ctx: PageCtx, state: FormState, media: readonly MediaDTO[], id: string | null): SafeHtml {
  const v = state.values;
  const e = state.errors;
  return html`<form method="post" action="${href(ctx, id ? `/admin/promotions/${id}` : '/admin/promotions/new')}" class="form" enctype="multipart/form-data">
${csrfField(ctx)}${formError(state)}${e.translations ? alert('error', e.translations) : ''}
<div class="form-grid">
${field({ label: 'Slug', name: 'slug', value: v.slug, error: e.slug, required: true, dir: 'ltr', hint: ctx.t('admin.promotions.slugHint') })}
${field({ label: ctx.t('admin.content.order'), name: 'sortOrder', type: 'number', value: v.sortOrder })}
${scheduleFields(ctx, state)}
</div>
${checkbox({ name: 'isActive', label: ctx.t('admin.content.active'), checked: v.isActive === 'on' })}
${LOCALES.map(
    (l) => html`<fieldset class="locale-block" lang="${l}" dir="${LOCALE_META[l].direction}"><legend>${LOCALE_META[l].nativeName}</legend>
${field({ label: ctx.t('admin.content.title'), name: `${l}.title`, value: v[`${l}.title`], error: e[`translations.${l}.title`], maxlength: 160, hint: ctx.t('admin.promotions.titleHint') })}
${field({ label: ctx.t('admin.promotions.summary'), name: `${l}.summary`, value: v[`${l}.summary`], maxlength: 400 })}
${textarea({ label: ctx.t('admin.promotions.body'), name: `${l}.body`, value: v[`${l}.body`], rows: 6, maxlength: 20000, hint: ctx.t('admin.content.plainText') })}
${textarea({ label: ctx.t('promotions.terms'), name: `${l}.terms`, value: v[`${l}.terms`], rows: 4, maxlength: 20000 })}
${imagePicker(ctx, { label: ctx.t('admin.content.image'), name: `${l}.imageId`, value: v[`${l}.imageId`], media })}
</fieldset>`,
  )}
<div class="form-actions">${button(ctx.t('common.save'))}</div>
</form>
${id ? html`<form method="post" action="${href(ctx, `/admin/promotions/${id}/delete`)}" class="danger-zone">${csrfField(ctx)}${button(ctx.t('common.delete'), { kind: 'danger', confirm: ctx.t('admin.content.deleteConfirm') })}</form>` : ''}`;
}

async function savePromotion(ctx: PageCtx, id: string | null): Promise<PageResult> {
  const me = guard(ctx, 'promotions.manage');
  if (isResult(me)) return me;
  let values: Record<string, string> = {};
  try {
    const read = await readTranslationsWithUploads(ctx, ['title', 'summary', 'body', 'terms'], ['imageId']);
    values = read.values;
    const translations = Object.fromEntries(Object.entries(read.translations).filter(([, t]) => t.title));
    const body = {
      slug: values.slug,
      sortOrder: Number(values.sortOrder || '0'),
      isActive: values.isActive === 'on',
      ...(dayStart(values.startsAt) ? { startsAt: dayStart(values.startsAt) } : {}),
      ...(dayStart(values.endsAt, 1) ? { endsAt: dayStart(values.endsAt, 1) } : {}),
      translations,
    };
    const saved = id ? await ctx.api.put<{ promotion: PromotionDTO }>(`/v1/admin/promotions/${id}`, body) : await ctx.api.post<{ promotion: PromotionDTO }>('/v1/admin/promotions', body);
    clearPublicCache();
    return redirect(href(ctx, `/admin/promotions/${saved.promotion.id}`), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    const media = await mediaList(ctx);
    return adminPage(ctx, ctx.t('admin.nav.promotions'), html`${pageHeader(ctx.t('admin.nav.promotions'))}${card(promotionForm(ctx, formFromError(ctx, error, values), media, id))}`, 422);
  }
}

export async function newPromotionPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'promotions.manage');
  if (isResult(me)) return me;
  const media = await mediaList(ctx);
  return adminPage(ctx, ctx.t('admin.promotions.new'), html`${pageHeader(ctx.t('admin.promotions.new'), { back: { href: href(ctx, '/admin/promotions'), label: ctx.t('admin.nav.promotions') } })}${card(promotionForm(ctx, emptyForm(promotionValues(null)), media, null))}`);
}

export const createPromotion = (ctx: PageCtx) => savePromotion(ctx, null);

export async function promotionAdminPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'promotions.manage');
  if (isResult(me)) return me;
  if (!ID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'not_found' });
  const [{ promotion }, media] = await Promise.all([ctx.api.get<{ promotion: PromotionDTO }>(`/v1/admin/promotions/${params.id}`), mediaList(ctx)]);
  return adminPage(ctx, promotion.slug, html`${pageHeader(promotion.slug, { back: { href: href(ctx, '/admin/promotions'), label: ctx.t('admin.nav.promotions') }, actions: promotion.isActive ? linkButton(ctx.t('admin.content.viewOnSite'), href(ctx, `/promotions/${promotion.slug}`), { kind: 'ghost' }) : '' })}${card(promotionForm(ctx, emptyForm(promotionValues(promotion)), media, promotion.id))}`);
}

export async function updatePromotion(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  if (!ID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'not_found' });
  return savePromotion(ctx, params.id as string);
}

export async function deletePromotion(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'promotions.manage');
  if (isResult(me)) return me;
  if (!ID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'not_found' });
  await ctx.api.delete(`/v1/admin/promotions/${params.id}`);
  clearPublicCache();
  return redirect(href(ctx, '/admin/promotions'), { kind: 'success', key: 'admin.content.deleted' });
}

// ---------------------------------------------------------------------------
// Information pages
// ---------------------------------------------------------------------------
const SLUGS = ['about-us', 'privacy-policy', 'terms-and-conditions', 'responsible-gaming', 'sportsbook-rules'];
const SLUG_TITLES: Record<string, string> = { 'about-us': 'footer.aboutUs', 'privacy-policy': 'footer.privacyPolicy', 'terms-and-conditions': 'footer.termsConditions', 'responsible-gaming': 'footer.responsibleGaming', 'sportsbook-rules': 'footer.sportsbookRules' };

export async function pagesAdminPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'pages.manage');
  if (isResult(me)) return me;
  const { items } = await ctx.api.get<{ items: PageDTO[] }>('/v1/admin/pages');
  const body = html`${pageHeader(ctx.t('admin.nav.pages'), { subtitle: ctx.t('admin.pages.subtitle') })}
${alert('warning', ctx.t('admin.pages.legalWarning'))}
${card(
  table<PageDTO>(
    [
      { label: ctx.t('admin.content.title'), cell: (p) => html`<a href="${href(ctx, `/admin/pages/${p.slug}`)}">${ctx.t(SLUG_TITLES[p.slug] ?? p.slug)}</a>` },
      ...LOCALES.map((l) => ({ label: LOCALE_META[l].nativeName, cell: (p: PageDTO) => (p.translations[l]?.isPublished ? badge(ctx.t('admin.pages.published'), 'green') : p.translations[l] ? badge(ctx.t('admin.pages.draft'), 'gold') : badge(ctx.t('admin.pages.missing'), 'grey')) })),
    ],
    items,
    ctx.t('common.noResults'),
  ),
)}`;
  return adminPage(ctx, ctx.t('admin.nav.pages'), body);
}

function pageForm(ctx: PageCtx, slug: string, state: FormState): SafeHtml {
  const v = state.values;
  return html`<form method="post" action="${href(ctx, `/admin/pages/${slug}`)}" class="form">${csrfField(ctx)}${formError(state)}
${LOCALES.map(
    (l) => html`<fieldset class="locale-block" lang="${l}" dir="${LOCALE_META[l].direction}"><legend>${LOCALE_META[l].nativeName}</legend>
${field({ label: ctx.t('admin.content.title'), name: `${l}.title`, value: v[`${l}.title`], error: state.errors[`translations.${l}.title`], maxlength: 160 })}
${textarea({ label: ctx.t('admin.pages.body'), name: `${l}.body`, value: v[`${l}.body`], rows: 14, maxlength: 100000, hint: ctx.t('admin.content.plainText') })}
${checkbox({ name: `${l}.isPublished`, label: ctx.t('admin.pages.publish'), checked: v[`${l}.isPublished`] === 'on' })}
</fieldset>`,
  )}
<div class="form-actions">${button(ctx.t('common.save'))}</div></form>`;
}

export async function pageEditPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'pages.manage');
  if (isResult(me)) return me;
  const slug = params.slug ?? '';
  if (!SLUGS.includes(slug)) throw new ApiError(404, { code: 'not_found' });
  const { page } = await ctx.api.get<{ page: PageDTO }>(`/v1/admin/pages/${slug}`);
  const v: Record<string, string> = {};
  for (const l of LOCALES) {
    const tr = page.translations[l];
    v[`${l}.title`] = tr?.title ?? '';
    v[`${l}.body`] = tr?.body ?? '';
    v[`${l}.isPublished`] = tr?.isPublished ? 'on' : '';
  }
  const title = ctx.t(SLUG_TITLES[slug] ?? slug);
  return adminPage(ctx, title, html`${pageHeader(title, { back: { href: href(ctx, '/admin/pages'), label: ctx.t('admin.nav.pages') }, actions: linkButton(ctx.t('admin.content.viewOnSite'), href(ctx, `/page/${slug}`), { kind: 'ghost' }) })}${alert('warning', ctx.t('admin.pages.legalWarning'))}${card(pageForm(ctx, slug, emptyForm(v)))}`);
}

export async function savePage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'pages.manage');
  if (isResult(me)) return me;
  const slug = params.slug ?? '';
  if (!SLUGS.includes(slug)) throw new ApiError(404, { code: 'not_found' });
  const values: Record<string, string> = {};
  const translations: Record<string, { title: string; body: string; isPublished: boolean }> = {};
  for (const l of LOCALES) {
    values[`${l}.title`] = (ctx.form.get(`${l}.title`) ?? '').trim();
    values[`${l}.body`] = ctx.form.get(`${l}.body`) ?? '';
    values[`${l}.isPublished`] = ctx.form.get(`${l}.isPublished`) ?? '';
    if (values[`${l}.title`]) translations[l] = { title: values[`${l}.title`] as string, body: values[`${l}.body`] as string, isPublished: values[`${l}.isPublished`] === 'on' };
  }
  try {
    await ctx.api.put(`/v1/admin/pages/${slug}`, { translations });
    clearPublicCache();
    return redirect(href(ctx, `/admin/pages/${slug}`), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    return adminPage(ctx, slug, html`${pageHeader(ctx.t(SLUG_TITLES[slug] ?? slug))}${card(pageForm(ctx, slug, formFromError(ctx, error, values)))}`, 422);
  }
}

// ---------------------------------------------------------------------------
// Image library
// ---------------------------------------------------------------------------
export async function mediaPage(ctx: PageCtx, uploadError?: FormState): Promise<PageResult> {
  const me = guard(ctx, 'banners.manage', 'promotions.manage', 'games.manage');
  if (isResult(me)) return me;
  const media = await mediaList(ctx);
  const body = html`${pageHeader(ctx.t('admin.nav.media'), { subtitle: ctx.t('admin.media.subtitle') })}
${card(html`<form method="post" action="${href(ctx, '/admin/media')}" enctype="multipart/form-data" class="form form-inline">${csrfField(ctx)}${uploadError ? formError(uploadError) : ''}
<div class="field"><label for="media-file">${ctx.t('admin.content.uploadNew')}</label><input id="media-file" type="file" name="file" accept="image/png,image/jpeg,image/webp" required></div>
${button(ctx.t('admin.media.upload'), { iconName: 'image' })}</form><p class="hint">${ctx.t('admin.content.imageHint')}</p>`)}
${media.length === 0 ? html`<div class="empty"><p>${ctx.t('admin.media.none')}</p></div>` : html`<ul class="media-grid" role="list">${media.map((m) => html`<li><img src="${m.url}" alt="" loading="lazy" width="200" height="${Math.round((200 * m.height) / m.width)}"><p class="small">${m.originalName ?? ''}</p><p class="small muted">${m.width}×${m.height} · ${Math.round(m.byteSize / 1024)} KB · ${date(ctx, m.createdAt, false)}</p></li>`)}</ul>`}`;
  return adminPage(ctx, ctx.t('admin.nav.media'), body, uploadError ? 422 : 200);
}

export async function uploadMedia(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'banners.manage', 'promotions.manage', 'games.manage');
  if (isResult(me)) return me;
  try {
    const id = await uploadIfAny(ctx, 'file');
    if (!id) return mediaPage(ctx, { values: {}, errors: {}, message: ctx.t('validation.required') });
    return redirect(href(ctx, '/admin/media'), { kind: 'success', key: 'admin.media.uploaded' });
  } catch (error) {
    return mediaPage(ctx, formFromError(ctx, error, {}));
  }
}
