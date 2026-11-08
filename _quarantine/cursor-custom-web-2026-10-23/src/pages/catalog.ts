/** Game cards and grids shared by the home page and the casino pages. */
import { href } from '../context.ts';
import type { PageCtx } from '../context.ts';
import { html } from '../html.ts';
import type { SafeHtml } from '../html.ts';
import { badge } from '../layout/components.ts';
import type { GameDTO } from '../types.ts';

/** Image of a game: the uploaded thumbnail, or the generated artwork for placeholder rows. */
export function gameImageUrl(game: GameDTO): string {
  if (game.thumbnail) return game.thumbnail.url;
  const art = game.art as { c1?: unknown; c2?: unknown; glyph?: unknown };
  const params = new URLSearchParams();
  if (typeof art.c1 === 'string') params.set('c1', art.c1.replace('#', ''));
  if (typeof art.c2 === 'string') params.set('c2', art.c2.replace('#', ''));
  if (typeof art.glyph === 'string') params.set('g', art.glyph);
  params.set('t', game.name);
  return `/art/game.svg?${params.toString()}`;
}

export function gameCard(ctx: PageCtx, game: GameDTO): SafeHtml {
  return html`<li class="game-card">
<a href="${href(ctx, `/casino/game/${game.slug}`)}">
<span class="game-thumb"><img src="${gameImageUrl(game)}" alt="" loading="lazy" decoding="async" width="200" height="200">
${game.isNew ? html`<span class="game-flag">${ctx.t('casino.new')}</span>` : ''}${game.isDemo ? html`<span class="game-flag game-flag-demo">${ctx.t('common.demo')}</span>` : ''}</span>
<span class="game-name">${game.name}</span>
<span class="game-provider">${game.provider.name}</span>
</a>
</li>`;
}

export function gameGrid(ctx: PageCtx, list: readonly GameDTO[], id?: string): SafeHtml {
  return html`<ul class="game-grid" role="list"${id ? html` id="${id}"` : ''}>${list.map((g) => gameCard(ctx, g))}</ul>`;
}

export function gameRow(ctx: PageCtx, title: string, list: readonly GameDTO[], more?: string): SafeHtml {
  if (list.length === 0) return html``;
  return html`<section class="section">
<div class="section-head"><h2>${title}</h2>${more ? html`<a class="link-more" href="${more}">${ctx.t('common.viewAll')}</a>` : ''}</div>
<ul class="game-row" role="list">${list.map((g) => gameCard(ctx, g))}</ul>
</section>`;
}

export function demoNotice(ctx: PageCtx): SafeHtml {
  return ctx.publicConfig.demo ? badge(ctx.t('common.demoData'), 'purple') : html``;
}
