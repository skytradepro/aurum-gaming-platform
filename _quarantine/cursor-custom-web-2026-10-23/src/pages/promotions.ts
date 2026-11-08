/** Promotions: list with image cards (Read more / Register) and the detail page with terms. */
import { dateText, href, htmlPage } from '../context.ts';
import type { PageCtx, PageResult } from '../context.ts';
import { html, paragraphs } from '../html.ts';
import type { SafeHtml } from '../html.ts';
import { linkButton, pageHeader } from '../layout/components.ts';
import { icon } from '../layout/icons.ts';
import { layout } from '../layout/shell.ts';
import * as data from '../public-data.ts';
import type { PublicPromotionDTO } from '../types.ts';
import { authDialogs } from './auth.ts';

export function promotionCard(ctx: PageCtx, p: PublicPromotionDTO): SafeHtml {
  return html`<li class="promo-card">
<a class="promo-media" href="${href(ctx, `/promotions/${p.slug}`)}" tabindex="-1" aria-hidden="true">${p.image ? html`<img src="${p.image.url}" alt="" loading="lazy" width="${p.image.width}" height="${p.image.height}">` : html`<span class="promo-placeholder">${icon('gift', 'icon icon-xl')}</span>`}</a>
<div class="promo-body">
<h3><a href="${href(ctx, `/promotions/${p.slug}`)}">${p.title}</a></h3>
${p.summary ? html`<p class="muted">${p.summary}</p>` : ''}
${p.endsAt ? html`<p class="small muted">${ctx.t('promotions.validUntil', { date: dateText(ctx, p.endsAt, false) })}</p>` : ''}
<div class="promo-actions">${linkButton(ctx.t('common.readMore'), href(ctx, `/promotions/${p.slug}`), { kind: 'dark' })}${ctx.me ? '' : linkButton(ctx.t('promotions.register'), href(ctx, '/register'), { kind: 'gold', attrs: html` data-dialog="register"` })}</div>
</div>
</li>`;
}

export async function promotionsPage(ctx: PageCtx): Promise<PageResult> {
  const list = await data.promotions(ctx);
  const body = html`<div class="container">
${pageHeader(ctx.t('promotions.title'), { subtitle: ctx.t('promotions.subtitle') })}
${list.length === 0 ? html`<div class="empty">${icon('gift')}<p>${ctx.t('promotions.none')}</p></div>` : html`<ul class="promo-grid" role="list">${list.map((p) => promotionCard(ctx, p))}</ul>`}
</div>`;
  return htmlPage(layout(ctx, { title: ctx.t('meta.promotionsTitle'), active: 'promotions', body, dialogs: authDialogs(ctx) }));
}

export async function promotionPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const slug = params.slug ?? '';
  const p = await data.promotion(ctx, slug);
  const body = html`<div class="container narrow">
${pageHeader(p.title, { back: { href: href(ctx, '/promotions'), label: ctx.t('promotions.title') } })}
${p.image ? html`<img class="promo-hero" src="${p.image.url}" alt="" width="${p.image.width}" height="${p.image.height}">` : ''}
${p.summary ? html`<p class="lead">${p.summary}</p>` : ''}
${p.startsAt || p.endsAt ? html`<p class="small muted">${p.endsAt ? ctx.t('promotions.validUntil', { date: dateText(ctx, p.endsAt, false) }) : ''}</p>` : ''}
<div class="prose">${paragraphs(p.body ?? '')}</div>
${p.terms ? html`<section class="card terms"><h2>${ctx.t('promotions.terms')}</h2><div class="prose small">${paragraphs(p.terms)}</div></section>` : html`<p class="small muted">${ctx.t('promotions.termsApply')}</p>`}
${ctx.me ? '' : html`<p>${linkButton(ctx.t('promotions.register'), href(ctx, '/register'), { kind: 'gold', attrs: html` data-dialog="register"` })}</p>`}
</div>`;
  return htmlPage(layout(ctx, { title: p.title, description: p.summary || undefined, active: 'promotions', body, dialogs: authDialogs(ctx) }));
}
