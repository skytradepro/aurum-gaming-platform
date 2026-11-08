/** Sections that need a licensed provider (honest "not available yet"), information pages and the shop list. */
import { currencyName, href, htmlPage } from '../context.ts';
import type { PageCtx, PageResult } from '../context.ts';
import { html, paragraphs } from '../html.ts';
import { alert, linkButton, pageHeader } from '../layout/components.ts';
import { icon } from '../layout/icons.ts';
import { layout } from '../layout/shell.ts';
import type { NavKey } from '../layout/shell.ts';
import * as data from '../public-data.ts';
import { authDialogs } from './auth.ts';
import { errorPage } from './errors.ts';
import { heroSlider, shopsBand } from './home.ts';

const SECTIONS: Record<string, { nav: NavKey; title: string; body: string; iconName: string }> = {
  sports: { nav: 'sports', title: 'meta.sportsTitle', body: 'comingSoon.sports', iconName: 'ball' },
  'live-betting': { nav: 'live', title: 'meta.liveBettingTitle', body: 'comingSoon.live', iconName: 'live' },
  virtuals: { nav: 'virtuals', title: 'meta.virtualsTitle', body: 'comingSoon.virtuals', iconName: 'bolt' },
  'live-channels': { nav: 'none', title: 'home.tiles.liveChannels', body: 'comingSoon.channels', iconName: 'tv' },
};

export async function comingSoonPage(ctx: PageCtx, section: string): Promise<PageResult> {
  const s = SECTIONS[section];
  if (!s) return errorPage(ctx, 404);
  const heroes = section === 'sports' || section === 'live-betting' ? await data.banners(ctx, 'sports_hero') : [];
  const body = html`${heroSlider(ctx, heroes, null)}
<div class="container narrow">
<section class="coming-soon">
<span class="coming-icon">${icon(s.iconName, 'icon icon-xl')}</span>
<h1>${ctx.t(s.title)}</h1>
<p class="lead">${ctx.t('comingSoon.title')}</p>
<p class="muted">${ctx.t(s.body)}</p>
<p>${linkButton(ctx.t('nav.casino'), href(ctx, '/casino'), { iconName: 'cards' })}</p>
</section>
</div>`;
  return htmlPage(layout(ctx, { title: ctx.t(s.title), active: s.nav, body, dialogs: authDialogs(ctx) }));
}

const PAGE_TITLES: Record<string, string> = {
  'about-us': 'footer.aboutUs',
  'privacy-policy': 'footer.privacyPolicy',
  'terms-and-conditions': 'footer.termsConditions',
  'responsible-gaming': 'footer.responsibleGaming',
  'sportsbook-rules': 'footer.sportsbookRules',
};

export async function infoPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const slug = params.slug ?? '';
  const titleKey = PAGE_TITLES[slug];
  if (!titleKey) return errorPage(ctx, 404);
  const page = await data.infoPage(ctx, slug);
  const title = page.published && page.title ? page.title : ctx.t(titleKey);
  const body = html`<div class="container narrow">
${pageHeader(title)}
${page.published ? html`<article class="prose"${page.locale && page.locale !== ctx.locale ? html` lang="${page.locale}" dir="${page.locale === 'ar' ? 'rtl' : 'ltr'}"` : ''}>${paragraphs(page.body ?? '')}</article>` : alert('info', ctx.t('legal.pending'))}
${slug === 'responsible-gaming' ? html`<section class="card"><h2>${icon('shield')}<span>${ctx.t('responsible.title')}</span></h2><ul class="bullets"><li>${ctx.t('responsible.point1')}</li><li>${ctx.t('responsible.point2')}</li><li>${ctx.t('responsible.point3')}</li></ul></section>` : ''}
</div>`;
  return htmlPage(layout(ctx, { title, active: 'none', body, dialogs: authDialogs(ctx) }));
}

export async function shopsPage(ctx: PageCtx): Promise<PageResult> {
  const currency = ctx.url.searchParams.get('currency') ?? '';
  const city = (ctx.url.searchParams.get('city') ?? '').trim();
  const all = await data.shops(ctx, /^[A-Z][A-Z0-9]{2,9}$/.test(currency) ? currency : undefined);
  const cities = [...new Set(all.map((s) => s.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, ctx.locale));
  const list = city ? all.filter((s) => s.city === city) : all;
  const body = html`<div class="container">
${pageHeader(ctx.t('shops.title'), { subtitle: ctx.t('shops.subtitle') })}
${shopsBand(ctx)}
<form class="filters" method="get">
<label class="filter"><span>${ctx.t('shops.city')}</span><select name="city" data-autosubmit><option value="">${ctx.t('common.all')}</option>${cities.map((c) => html`<option value="${c}"${c === city ? html` selected` : ''}>${c}</option>`)}</select></label>
<label class="filter"><span>${ctx.t('common.currency')}</span><select name="currency" data-autosubmit><option value="">${ctx.t('common.all')}</option>${ctx.publicConfig.currencies.map((c) => html`<option value="${c.code}"${c.code === currency ? html` selected` : ''}>${c.code}</option>`)}</select></label>
<noscript><button class="btn btn-dark" type="submit">${ctx.t('common.apply')}</button></noscript>
</form>
${list.length === 0
  ? html`<div class="empty">${icon('shop')}<p>${ctx.t('shops.none')}</p></div>`
  : html`<ul class="shop-grid" role="list">${list.map(
      (s) => html`<li class="shop-card">
<h2>${s.name}</h2>
<p class="small muted">${s.code} · ${currencyName(ctx, s.currency)} (${s.currency})</p>
${s.address || s.city ? html`<p>${icon('map')}<span>${[s.address, s.city].filter(Boolean).join(', ')}</span></p>` : ''}
${s.openingHours ? html`<p>${icon('clock')}<span>${s.openingHours}</span></p>` : ''}
${s.phone ? html`<p>${icon('phone')}<a href="tel:${s.phone}" dir="ltr">${s.phone}</a></p>` : ''}
</li>`,
    )}</ul>`}
<p class="small muted">${ctx.t('shops.idNote')}</p>
</div>`;
  return htmlPage(layout(ctx, { title: ctx.t('shops.title'), active: 'shops', body, dialogs: authDialogs(ctx) }));
}
