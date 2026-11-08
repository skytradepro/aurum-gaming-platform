/** Casino: lobby, filtered views (featured, new, slots, crash, table), providers, search, game page, live casino. */
import { href, htmlPage } from '../context.ts';
import type { PageCtx, PageResult } from '../context.ts';
import { cx, html } from '../html.ts';
import type { SafeHtml } from '../html.ts';
import { alert, linkButton, pageHeader } from '../layout/components.ts';
import { icon } from '../layout/icons.ts';
import { layout } from '../layout/shell.ts';
import * as data from '../public-data.ts';
import type { GameQuery } from '../public-data.ts';
import { authDialogs } from './auth.ts';
import { demoNotice, gameGrid, gameImageUrl, gameRow, gameCard } from './catalog.ts';
import { errorPage } from './errors.ts';
import { heroSlider } from './home.ts';

export const PAGE_SIZE = 32;

type View = 'lobby' | 'featured' | 'new' | 'slots' | 'crash' | 'table' | 'providers' | 'search';

const VIEWS: Record<Exclude<View, 'lobby' | 'providers' | 'search'>, { label: string; query: GameQuery }> = {
  featured: { label: 'casino.featured', query: { featured: true } },
  new: { label: 'casino.new', query: { new: true, sort: 'newest' } },
  slots: { label: 'casino.slots', query: { category: 'slots' } },
  crash: { label: 'casino.crash', query: { category: 'crash' } },
  table: { label: 'casino.otherGames', query: { category: 'table' } },
};

function subnav(ctx: PageCtx, active: View): SafeHtml {
  const items: [View | 'live', string, string, string][] = [
    ['lobby', '/casino', 'casino.lobby', 'grid'],
    ['featured', '/casino/featured', 'casino.featured', 'star'],
    ['new', '/casino/new', 'casino.new', 'sparkle'],
    ['slots', '/casino/slots', 'casino.slots', 'slots'],
    ['crash', '/casino/crash', 'casino.crash', 'rocket'],
    ['table', '/casino/table', 'casino.otherGames', 'cards'],
    ['providers', '/casino/providers', 'casino.providers', 'list'],
    ['live', '/live-casino', 'casino.liveCasino', 'dealer'],
  ];
  return html`<div class="subnav">
<ul role="list">${items.map(([key, path, label, ic]) => html`<li><a class="${cx(key === active && 'active')}" href="${href(ctx, path)}"${key === active ? html` aria-current="page"` : ''}>${icon(ic)}<span>${ctx.t(label)}</span></a></li>`)}</ul>
<form class="search" method="get" action="${href(ctx, '/casino/search')}" role="search">
<label class="sr-only" for="casino-q">${ctx.t('common.search')}</label>
<input id="casino-q" type="search" name="q" value="${ctx.url.searchParams.get('q') ?? ''}" placeholder="${ctx.t('casino.searchPlaceholder')}" maxlength="60">
<button type="submit" class="btn btn-gold btn-icon" aria-label="${ctx.t('common.search')}">${icon('search')}</button>
</form>
</div>`;
}

function filters(ctx: PageCtx, providerList: { slug: string; name: string }[], current: { provider: string; sort: string; q?: string }): SafeHtml {
  return html`<form class="filters" method="get">
${current.q ? html`<input type="hidden" name="q" value="${current.q}">` : ''}
<label class="filter"><span>${ctx.t('casino.provider')}</span>
<select name="provider" data-autosubmit><option value="">${ctx.t('casino.allProviders')}</option>${providerList.map((p) => html`<option value="${p.slug}"${p.slug === current.provider ? html` selected` : ''}>${p.name}</option>`)}</select></label>
<label class="filter"><span>${ctx.t('casino.sortBy')}</span>
<select name="sort" data-autosubmit>${(
    [
      ['default', 'casino.sort.default'],
      ['az', 'casino.sort.az'],
      ['za', 'casino.sort.za'],
      ['newest', 'casino.sort.newest'],
    ] as const
  ).map(([v, k]) => html`<option value="${v}"${v === current.sort ? html` selected` : ''}>${ctx.t(k)}</option>`)}</select></label>
<noscript><button class="btn btn-dark" type="submit">${ctx.t('common.apply')}</button></noscript>
</form>`;
}

function readPage(ctx: PageCtx): number {
  const n = Number(ctx.url.searchParams.get('page') ?? '1');
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}

/** One filtered grid, with "Showing X of Y" and Load more (JS appends the next page in place). */
async function gridView(ctx: PageCtx, view: View, title: string, query: GameQuery): Promise<PageResult> {
  const provider = /^[a-z0-9-]{1,80}$/.test(ctx.url.searchParams.get('provider') ?? '') ? (ctx.url.searchParams.get('provider') as string) : '';
  const sortParam = ctx.url.searchParams.get('sort') ?? '';
  const sort = ['az', 'za', 'newest'].includes(sortParam) ? sortParam : (query.sort ?? 'default');
  const page = readPage(ctx);
  const result = await data.games(ctx, { ...query, provider: provider || undefined, sort: sort === 'default' ? undefined : sort, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
  const shown = Math.min(page * PAGE_SIZE, result.total);
  const next = new URL(ctx.url);
  next.searchParams.set('page', String(page + 1));
  next.searchParams.delete('partial');
  const more = shown < result.total ? html`<a class="btn btn-dark" data-load-more data-target="game-grid" href="${next.pathname + next.search}">${ctx.t('common.loadMore')}</a>` : '';
  const counter = html`<p class="counter" data-counter>${ctx.t('common.showing', { shown, total: result.total })}</p>`;

  if (ctx.url.searchParams.get('partial') === '1') {
    // fragment for "Load more": cards, then the new counter and link
    const fragment = html`${result.items.map((g) => gameCard(ctx, g))}<template data-meta>${counter}${more}</template>`;
    return { kind: 'raw', status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: fragment.value };
  }
  const providerList = await data.providers(ctx);
  const body = html`<div class="container">
${subnav(ctx, view)}
<div class="grid-head"><h1>${title} ${demoNotice(ctx)}</h1>${filters(ctx, providerList, { provider, sort, q: query.q })}</div>
${result.items.length === 0 ? html`<div class="empty">${icon('search')}<p>${ctx.t('casino.noGames')}</p></div>` : gameGrid(ctx, result.items, 'game-grid')}
<div class="load-more">${counter}${more}</div>
</div>`;
  return htmlPage(layout(ctx, { title: `${title} | ${ctx.t('nav.casino')}`, active: 'casino', body, dialogs: authDialogs(ctx) }));
}

export async function casinoLobby(ctx: PageCtx): Promise<PageResult> {
  const [heroes, featured, newest, slots, crash, table] = await Promise.all([
    data.banners(ctx, 'casino_hero'),
    data.games(ctx, { featured: true, limit: 16 }),
    data.games(ctx, { new: true, sort: 'newest', limit: 16 }),
    data.games(ctx, { category: 'slots', limit: 16 }),
    data.games(ctx, { category: 'crash', limit: 16 }),
    data.games(ctx, { category: 'table', limit: 16 }),
  ]);
  const empty = featured.total + newest.total + slots.total + crash.total + table.total === 0;
  const body = html`${heroSlider(ctx, heroes, null)}
<div class="container">
${subnav(ctx, 'lobby')}
<h1 class="sr-only">${ctx.t('meta.casinoTitle')}</h1>
${empty ? alert('info', ctx.t('casino.catalogEmpty')) : ''}
${gameRow(ctx, ctx.t('casino.featured'), featured.items, href(ctx, '/casino/featured'))}
${gameRow(ctx, ctx.t('casino.new'), newest.items, href(ctx, '/casino/new'))}
${gameRow(ctx, ctx.t('casino.slots'), slots.items, href(ctx, '/casino/slots'))}
${gameRow(ctx, ctx.t('casino.crash'), crash.items, href(ctx, '/casino/crash'))}
${gameRow(ctx, ctx.t('casino.otherGames'), table.items, href(ctx, '/casino/table'))}
</div>`;
  return htmlPage(layout(ctx, { title: ctx.t('meta.casinoTitle'), active: 'casino', body, dialogs: authDialogs(ctx) }));
}

export async function casinoView(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const view = params.view as keyof typeof VIEWS;
  const def = VIEWS[view];
  if (!def) return errorPage(ctx, 404);
  return gridView(ctx, view, ctx.t(def.label), def.query);
}

export async function casinoSearch(ctx: PageCtx): Promise<PageResult> {
  const q = (ctx.url.searchParams.get('q') ?? '').trim().slice(0, 60);
  return gridView(ctx, 'search', q ? ctx.t('casino.resultsFor', { query: q }) : ctx.t('common.search'), { q: q || undefined });
}

export async function casinoProviders(ctx: PageCtx): Promise<PageResult> {
  const list = await data.providers(ctx);
  const body = html`<div class="container">
${subnav(ctx, 'providers')}
<h1>${ctx.t('casino.providers')}</h1>
${list.length === 0 ? html`<div class="empty">${icon('list')}<p>${ctx.t('casino.noProviders')}</p></div>` : html`<ul class="provider-grid" role="list">${list.map((p) => html`<li><a class="provider-card" href="${href(ctx, `/casino/all?provider=${p.slug}`)}">${p.name}${p.isDemo ? html` <span class="badge badge-purple">${ctx.t('common.demo')}</span>` : ''}</a></li>`)}</ul>`}
</div>`;
  return htmlPage(layout(ctx, { title: ctx.t('casino.providers'), active: 'casino', body, dialogs: authDialogs(ctx) }));
}

export async function casinoAll(ctx: PageCtx): Promise<PageResult> {
  return gridView(ctx, 'lobby', ctx.t('casino.allGames'), {});
}

export async function gamePage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const slug = params.slug ?? '';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return errorPage(ctx, 404);
  const game = await data.game(ctx, slug);
  const related = await data.games(ctx, { category: game.category, limit: 12 });
  const body = html`<div class="container">
${pageHeader(game.name, { subtitle: game.provider.name, back: { href: href(ctx, '/casino'), label: ctx.t('nav.casino') } })}
<div class="game-detail">
<img class="game-detail-img" src="${gameImageUrl(game)}" alt="" width="320" height="320">
<div class="card">
<h2>${icon('play')}<span>${ctx.t('casino.launchUnavailableTitle')}</span></h2>
<p class="muted">${ctx.t('casino.launchUnavailableBody')}</p>
${game.isDemo ? alert('info', ctx.t('casino.demoGameNote')) : ''}
${ctx.me ? '' : html`<p>${linkButton(ctx.t('nav.register'), href(ctx, '/register'), { attrs: html` data-dialog="register"` })}</p>`}
</div>
</div>
${gameRow(ctx, ctx.t('casino.related'), related.items.filter((g) => g.slug !== game.slug), href(ctx, `/casino/${game.category === 'other' || game.category === 'live' ? 'table' : game.category}`))}
</div>`;
  return htmlPage(layout(ctx, { title: game.name, active: 'casino', body, dialogs: authDialogs(ctx) }));
}

export async function liveCasinoPage(ctx: PageCtx): Promise<PageResult> {
  const [heroes, live] = await Promise.all([data.banners(ctx, 'live_casino_hero'), data.games(ctx, { category: 'live', limit: 48 })]);
  const body = html`${heroSlider(ctx, heroes, null)}
<div class="container">
${subnav(ctx, 'lobby')}
${pageHeader(ctx.t('meta.liveCasinoTitle'))}
${alert('info', ctx.t('comingSoon.liveCasino'))}
${live.items.length ? gameGrid(ctx, live.items) : ''}
</div>`;
  return htmlPage(layout(ctx, { title: ctx.t('meta.liveCasinoTitle'), active: 'liveCasino', body, dialogs: authDialogs(ctx) }));
}
