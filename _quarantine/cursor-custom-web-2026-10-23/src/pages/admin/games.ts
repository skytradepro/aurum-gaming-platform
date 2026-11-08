/** Game catalogue and providers. Games launch only through a licensed provider integration (not connected yet). */
import { ApiError } from '../../api.ts';
import { href, redirect } from '../../context.ts';
import type { PageCtx, PageResult } from '../../context.ts';
import { html } from '../../html.ts';
import type { SafeHtml } from '../../html.ts';
import { alert, badge, button, card, checkbox, csrfField, emptyForm, field, formError, formFromError, formValues, linkButton, pageHeader, select, table } from '../../layout/components.ts';
import type { FormState } from '../../layout/components.ts';
import { clearPublicCache } from '../../public-data.ts';
import type { GameDTO, MediaDTO, ProviderDTO } from '../../types.ts';
import { gameImageUrl } from '../catalog.ts';
import { adminPage, guard, ID_RE, isResult, q } from './common.ts';

const CATEGORIES = ['slots', 'crash', 'live', 'table', 'other'];

export async function gamesAdminPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'games.manage');
  if (isResult(me)) return me;
  const search = (ctx.url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const category = q(ctx, 'category', /^(slots|crash|live|table|other)$/);
  const page = Math.max(1, Number(q(ctx, 'page', /^\d{1,4}$/) ?? '1'));
  const result = await ctx.api.get<{ items: GameDTO[]; total: number }>('/v1/admin/games', { q: search || undefined, category, offset: (page - 1) * 50, limit: 50 });
  const next = new URL(ctx.url);
  next.searchParams.set('page', String(page + 1));
  const prev = new URL(ctx.url);
  prev.searchParams.set('page', String(page - 1));
  const body = html`${pageHeader(ctx.t('admin.nav.games'), { subtitle: ctx.t('admin.games.subtitle'), actions: linkButton(ctx.t('admin.games.new'), href(ctx, '/admin/games/new'), { iconName: 'plus' }) })}
${alert('info', ctx.t('admin.games.providerNote'))}
<form class="filters" method="get">
<label class="filter grow"><span>${ctx.t('common.search')}</span><input type="search" name="q" value="${search}"></label>
<label class="filter"><span>${ctx.t('admin.games.category')}</span><select name="category"><option value="">${ctx.t('common.all')}</option>${CATEGORIES.map((c) => html`<option value="${c}"${c === category ? html` selected` : ''}>${ctx.t(`admin.games.categories.${c}`)}</option>`)}</select></label>
<button class="btn btn-dark" type="submit">${ctx.t('common.apply')}</button>
</form>
${card(html`${table<GameDTO>(
    [
      { label: '', cell: (g) => html`<img class="thumb-sm" src="${gameImageUrl(g)}" alt="" width="48" height="48" loading="lazy">` },
      { label: ctx.t('admin.content.name'), cell: (g) => html`<a href="${href(ctx, `/admin/games/${g.id}`)}">${g.name}</a>` },
      { label: ctx.t('casino.provider'), cell: (g) => g.provider.name },
      { label: ctx.t('admin.games.category'), cell: (g) => ctx.t(`admin.games.categories.${g.category}`) },
      { label: ctx.t('admin.games.flags'), cell: (g) => html`${g.isFeatured ? badge(ctx.t('casino.featured'), 'gold') : ''} ${g.isNew ? badge(ctx.t('casino.new'), 'blue') : ''} ${g.isDemo ? badge(ctx.t('common.demo'), 'purple') : ''}` },
      { label: ctx.t('common.status'), cell: (g) => (g.isActive ? badge(ctx.t('common.active'), 'green') : badge(ctx.t('common.inactive'), 'grey')) },
    ],
    result.items,
    ctx.t('casino.noGames'),
  )}
<nav class="pager">${page > 1 ? html`<a class="btn btn-ghost" href="${prev.pathname + prev.search}">${ctx.t('common.previous')}</a>` : ''}<span class="muted small">${ctx.t('common.showing', { shown: Math.min(page * 50, result.total), total: result.total })}</span>${page * 50 < result.total ? html`<a class="btn btn-ghost" href="${next.pathname + next.search}">${ctx.t('common.next')}</a>` : ''}</nav>`)}`;
  return adminPage(ctx, ctx.t('admin.nav.games'), body);
}

function gameForm(ctx: PageCtx, state: FormState, providers: readonly ProviderDTO[], media: readonly MediaDTO[], id: string | null): SafeHtml {
  const v = state.values;
  const e = state.errors;
  return html`<form method="post" action="${href(ctx, id ? `/admin/games/${id}` : '/admin/games/new')}" class="form" enctype="multipart/form-data">${csrfField(ctx)}${formError(state)}
<div class="form-grid">
${field({ label: ctx.t('admin.content.name'), name: 'name', value: v.name, error: e.name, required: true, maxlength: 120 })}
${field({ label: 'Slug', name: 'slug', value: v.slug, error: e.slug, required: true, dir: 'ltr', hint: ctx.t('admin.promotions.slugHint') })}
${select({ label: ctx.t('casino.provider'), name: 'providerId', value: v.providerId, error: e.providerId, required: true, options: providers.map((p) => ({ value: p.id, label: p.name })) })}
${select({ label: ctx.t('admin.games.category'), name: 'category', value: v.category, options: CATEGORIES.map((c) => ({ value: c, label: ctx.t(`admin.games.categories.${c}`) })) })}
${field({ label: ctx.t('admin.content.order'), name: 'sortOrder', type: 'number', value: v.sortOrder })}
${field({ label: ctx.t('admin.games.externalId'), name: 'externalId', value: v.externalId, dir: 'ltr', hint: ctx.t('admin.games.externalIdHint') })}
<div class="field"><label>${ctx.t('admin.games.thumbnail')}</label>
<select name="thumbnailId"><option value="">${ctx.t('admin.games.generatedArt')}</option>${media.map((m) => html`<option value="${m.id}"${m.id === v.thumbnailId ? html` selected` : ''}>${m.originalName ?? m.id} (${m.width}×${m.height})</option>`)}</select>
<input type="file" name="thumbnail_file" accept="image/png,image/jpeg,image/webp"><p class="hint">${ctx.t('admin.games.thumbnailHint')}</p></div>
</div>
${checkbox({ name: 'isFeatured', label: ctx.t('casino.featured'), checked: v.isFeatured === 'on' })}
${checkbox({ name: 'isNew', label: ctx.t('casino.new'), checked: v.isNew === 'on' })}
${checkbox({ name: 'isActive', label: ctx.t('admin.content.active'), checked: v.isActive === 'on' })}
${button(ctx.t('common.save'))}</form>`;
}

async function formDeps(ctx: PageCtx): Promise<[ProviderDTO[], MediaDTO[]]> {
  const [p, m] = await Promise.all([ctx.api.get<{ items: ProviderDTO[] }>('/v1/admin/game-providers'), ctx.api.get<{ items: MediaDTO[] }>('/v1/admin/media', { limit: 200 })]);
  return [p.items, m.items];
}

export async function newGamePage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'games.manage');
  if (isResult(me)) return me;
  const [providers, media] = await formDeps(ctx);
  const body = html`${pageHeader(ctx.t('admin.games.new'), { back: { href: href(ctx, '/admin/games'), label: ctx.t('admin.nav.games') } })}
${providers.length === 0 ? alert('warning', ctx.t('admin.games.needProvider')) : card(gameForm(ctx, emptyForm({ category: 'slots', sortOrder: '0', isActive: 'on' }), providers, media, null))}`;
  return adminPage(ctx, ctx.t('admin.games.new'), body);
}

async function saveGame(ctx: PageCtx, id: string | null): Promise<PageResult> {
  const me = guard(ctx, 'games.manage');
  if (isResult(me)) return me;
  const values = formValues(ctx, 'name', 'slug', 'providerId', 'category', 'sortOrder', 'externalId', 'thumbnailId', 'isFeatured', 'isNew', 'isActive');
  try {
    const file = ctx.files.get('thumbnail_file');
    if (file) {
      const form = new FormData();
      form.set('file', file, file.name);
      values.thumbnailId = (await ctx.api.upload<{ media: MediaDTO }>('/v1/admin/media', form)).media.id;
    }
    const body = {
      name: values.name, slug: values.slug, providerId: values.providerId, category: values.category, sortOrder: Number(values.sortOrder || '0'),
      isFeatured: values.isFeatured === 'on', isNew: values.isNew === 'on', isActive: values.isActive === 'on',
      ...(values.thumbnailId ? { thumbnailId: values.thumbnailId } : {}), ...(values.externalId ? { externalId: values.externalId } : {}),
    };
    const saved = id ? await ctx.api.put<{ game: GameDTO }>(`/v1/admin/games/${id}`, body) : await ctx.api.post<{ game: GameDTO }>('/v1/admin/games', body);
    clearPublicCache();
    return redirect(href(ctx, `/admin/games/${saved.game.id}`), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    const [providers, media] = await formDeps(ctx);
    return adminPage(ctx, ctx.t('admin.nav.games'), html`${pageHeader(ctx.t('admin.nav.games'))}${card(gameForm(ctx, formFromError(ctx, error, values), providers, media, id))}`, 422);
  }
}

export const createGame = (ctx: PageCtx) => saveGame(ctx, null);

export async function gameAdminPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'games.manage');
  if (isResult(me)) return me;
  if (!ID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'not_found' });
  const { game } = await ctx.api.get<{ game: GameDTO }>(`/v1/admin/games/${params.id}`);
  const [providers, media] = await formDeps(ctx);
  const v = {
    name: game.name, slug: game.slug, providerId: game.provider.id, category: game.category, sortOrder: String(game.sortOrder), externalId: game.externalId ?? '',
    thumbnailId: game.thumbnail?.id ?? '', isFeatured: game.isFeatured ? 'on' : '', isNew: game.isNew ? 'on' : '', isActive: game.isActive ? 'on' : '',
  };
  const body = html`${pageHeader(game.name, { back: { href: href(ctx, '/admin/games'), label: ctx.t('admin.nav.games') } })}
<div class="game-detail"><img class="game-detail-img" src="${gameImageUrl(game)}" alt="" width="200" height="200">${card(gameForm(ctx, emptyForm(v), providers, media, game.id))}</div>`;
  return adminPage(ctx, game.name, body);
}

export async function updateGame(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  if (!ID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'not_found' });
  return saveGame(ctx, params.id as string);
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------
async function providersView(ctx: PageCtx, state: FormState = emptyForm({ isActive: 'on', sortOrder: '0' }), editId: string | null = null, status = 200): Promise<PageResult> {
  const { items } = await ctx.api.get<{ items: ProviderDTO[] }>('/v1/admin/game-providers');
  const editing = editId ? items.find((p) => p.id === editId) : undefined;
  const v = editing && !state.message ? { slug: editing.slug, name: editing.name, sortOrder: String(editing.sortOrder), isActive: editing.isActive ? 'on' : '' } : state.values;
  const body = html`${pageHeader(ctx.t('admin.nav.providers'), { subtitle: ctx.t('admin.providers.subtitle') })}
<div class="grid-2 grid-wide-left">
${card(
  table<ProviderDTO>(
    [
      { label: ctx.t('admin.content.name'), cell: (p) => html`<a href="${href(ctx, `/admin/providers?edit=${p.id}`)}">${p.name}</a>` },
      { label: 'Slug', cell: (p) => html`<code>${p.slug}</code>` },
      { label: ctx.t('admin.content.order'), cell: (p) => String(p.sortOrder), className: 'num' },
      { label: ctx.t('common.status'), cell: (p) => html`${p.isActive ? badge(ctx.t('common.active'), 'green') : badge(ctx.t('common.inactive'), 'grey')} ${p.isDemo ? badge(ctx.t('common.demo'), 'purple') : ''}` },
    ],
    items,
    ctx.t('casino.noProviders'),
  ),
)}
${card(html`<form method="post" action="${href(ctx, editing ? `/admin/providers/${editing.id}` : '/admin/providers')}" class="form">${csrfField(ctx)}${formError(state)}
${field({ label: ctx.t('admin.content.name'), name: 'name', value: v.name, error: state.errors.name, required: true, maxlength: 80 })}
${field({ label: 'Slug', name: 'slug', value: v.slug, error: state.errors.slug, required: true, dir: 'ltr' })}
${field({ label: ctx.t('admin.content.order'), name: 'sortOrder', type: 'number', value: v.sortOrder })}
${checkbox({ name: 'isActive', label: ctx.t('admin.content.active'), checked: v.isActive === 'on' })}
${button(ctx.t('common.save'))}</form>`, { title: editing ? `${ctx.t('common.edit')}: ${editing.name}` : ctx.t('admin.providers.new') })}
</div>`;
  return adminPage(ctx, ctx.t('admin.nav.providers'), body, status);
}

export async function providersPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'games.manage');
  if (isResult(me)) return me;
  return providersView(ctx, undefined, q(ctx, 'edit', ID_RE) ?? null);
}

export async function saveProvider(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'games.manage');
  if (isResult(me)) return me;
  const id = params.id && ID_RE.test(params.id) ? params.id : null;
  const values = formValues(ctx, 'name', 'slug', 'sortOrder', 'isActive');
  const body = { name: values.name, slug: values.slug, sortOrder: Number(values.sortOrder || '0'), isActive: values.isActive === 'on' };
  try {
    if (id) await ctx.api.put(`/v1/admin/game-providers/${id}`, body);
    else await ctx.api.post('/v1/admin/game-providers', body);
    clearPublicCache();
    return redirect(href(ctx, '/admin/providers'), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    return providersView(ctx, formFromError(ctx, error, values), id, 422);
  }
}
